"""Generate structured call reports from session transcripts via LangChain + Gemini."""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from pathlib import Path

from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from loguru import logger

from app.core.config import settings
from app.schema.call_report import (
    CallReportData,
    CallReportLLMFields,
    ConversationTurn,
    SessionDetailData,
)
from app.services.conversation_history import list_messages_for_session
from app.services.voice_session import get_session_for_user, list_sessions_for_user

_CALL_REPORT_PROMPT_PATH = (
    Path(__file__).resolve().parent.parent / "ai" / "prompts" / "call_report.md"
)


def _load_call_report_prompt() -> str:
    return _CALL_REPORT_PROMPT_PATH.read_text(encoding="utf-8")


def _parse_ts(ts: str) -> datetime:
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    return datetime.fromisoformat(ts)


def _count_user_words(messages: list[dict]) -> int:
    n = 0
    for m in messages:
        if m.get("role") != "user":
            continue
        text = (m.get("message") or "").strip()
        if not text:
            continue
        n += len(re.split(r"\s+", text))
    return n


def _build_transcript(
    session_created: datetime,
    messages: list[dict],
    duration_seconds: int | None,
) -> str:
    lines: list[str] = []
    base = session_created
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)

    for m in messages:
        role = m.get("role", "")
        text = (m.get("message") or "").strip()
        if not text:
            continue
        created = m.get("created_at")
        if isinstance(created, str):
            t = _parse_ts(created)
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
            sec = max(0, int((t - base).total_seconds()))
        else:
            sec = 0
        lines.append(f"[{sec}s] {role}: {text}")

    dur = duration_seconds if duration_seconds is not None else "unknown"
    return f"Session duration_seconds (from app): {dur}\n\n" + "\n".join(lines)


def build_conversation_turns(
    session_created: datetime,
    messages: list[dict],
) -> list[ConversationTurn]:
    """Role, message, and ISO created_at per turn."""
    base = session_created
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)

    out: list[ConversationTurn] = []
    for m in messages:
        text = (m.get("message") or "").strip()
        if not text:
            continue
        role = str(m.get("role", ""))
        created = m.get("created_at")
        if isinstance(created, str):
            t = _parse_ts(created)
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
            sec = max(0, int((t - base).total_seconds()))
            created_iso = t.isoformat()
        else:
            sec = 0
            created_iso = base.isoformat()

        out.append(
            ConversationTurn(
                role=role,
                message=text,
                created_at=created_iso,
            )
        )
    return out


def build_session_detail(
    session: dict,
    report: CallReportData | None,
    messages: list[dict],
) -> SessionDetailData:
    created_raw = session.get("created_at")
    if isinstance(created_raw, str):
        session_created = _parse_ts(created_raw)
    else:
        session_created = datetime.now(timezone.utc)
    if session_created.tzinfo is None:
        session_created = session_created.replace(tzinfo=timezone.utc)

    messages = [m for m in messages if (m.get("message") or "").strip()]
    conversation = build_conversation_turns(session_created, messages)

    raw_dur = session.get("duration_seconds")
    duration_val = int(raw_dur) if raw_dur is not None else None

    ended = session.get("ended_at")
    ended_at = str(ended) if ended else None

    return SessionDetailData(
        session_id=str(session["session_id"]),
        user_id=str(session["user_id"]),
        created_at=str(session["created_at"]),
        ended_at=ended_at,
        duration_seconds=duration_val,
        report=report,
        conversation=conversation,
    )


def get_session_detail(session_id: str, user_id: str) -> SessionDetailData | None:
    """Session row + optional stored report + conversation turns."""
    session = get_session_for_user(session_id, user_id)
    if not session:
        return None

    messages = list_messages_for_session(session_id, user_id)
    if messages is None:
        return None

    raw_report = session.get("call_report")
    report: CallReportData | None = None
    if raw_report:
        try:
            report = CallReportData.model_validate(raw_report)
        except Exception:
            logger.warning(
                "get_session_detail: invalid call_report JSON | session_id={}",
                session_id,
            )

    return build_session_detail(session, report, messages)


def list_sessions_detail(
    user_id: str,
    *,
    session_date: date | None = None,
    tz_offset_minutes: int = 0,
) -> list[SessionDetailData] | None:
    """All sessions for the user with report + conversation (same shape as GET one session)."""
    sessions = list_sessions_for_user(
        user_id,
        session_date=session_date,
        tz_offset_minutes=tz_offset_minutes,
    )
    if sessions is None:
        return None

    out: list[SessionDetailData] = []
    for session in sessions:
        sid = str(session["session_id"])
        messages = list_messages_for_session(sid, user_id)
        if messages is None:
            logger.warning(
                "list_sessions_detail: skip session (messages fetch failed) | session_id={}",
                sid,
            )
            continue

        raw_report = session.get("call_report")
        report: CallReportData | None = None
        if raw_report:
            try:
                report = CallReportData.model_validate(raw_report)
            except Exception:
                logger.warning(
                    "list_sessions_detail: invalid call_report JSON | session_id={}",
                    sid,
                )

        out.append(build_session_detail(session, report, messages))
    return out


def generate_call_report(
    session_id: str,
    user_id: str,
) -> tuple[CallReportData, dict, list[dict]] | None:
    """
    Load transcript, run structured LLM, return report + session row + messages.
    Messages are non-empty only.
    """
    session = get_session_for_user(session_id, user_id)
    if not session:
        return None

    messages = list_messages_for_session(session_id, user_id)
    if messages is None:
        return None

    messages = [m for m in messages if (m.get("message") or "").strip()]
    if not messages:
        return None

    created_raw = session.get("created_at")
    if isinstance(created_raw, str):
        session_created = _parse_ts(created_raw)
    else:
        session_created = datetime.now(timezone.utc)
    if session_created.tzinfo is None:
        session_created = session_created.replace(tzinfo=timezone.utc)

    raw_dur = session.get("duration_seconds")
    duration_int = int(raw_dur) if raw_dur is not None else 0

    user_words = _count_user_words(messages)
    transcript = _build_transcript(session_created, messages, duration_int)

    llm = ChatGoogleGenerativeAI(
        model=settings.GEMINI_REPORT_MODEL,
        google_api_key=settings.GEMINI_API_KEY,
        temperature=0.42,
    )
    structured = llm.with_structured_output(CallReportLLMFields)

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", _load_call_report_prompt()),
            ("human", "Transcript:\n{transcript}"),
        ]
    )

    chain = prompt | structured
    try:
        llm_part = chain.invoke({"transcript": transcript})
    except Exception:
        logger.exception("call report LLM invoke failed | session_id={}", session_id)
        return None

    dumped = (
        llm_part.model_dump()
        if isinstance(llm_part, CallReportLLMFields)
        else llm_part
    )
    report = CallReportData(
        session_id=session_id,
        duration_seconds=duration_int,
        user_words_spoken=user_words,
        **dumped,
    )
    return report, session, messages
