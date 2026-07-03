"""Conversation rows — Supabase (primary) with SQLite fallback."""
from datetime import datetime, timezone
from typing import TypedDict

from loguru import logger

from app.core.database import get_conn
from app.core.supabase import get_supabase_client
from app.services.voice_session import get_session_for_user

TABLE = "conversation_history"
_VALID_ROLES = frozenset({"user", "assistant", "system"})


class ConversationRow(TypedDict):
    session_id: str
    user_id: str
    role: str
    message: str


def _sb():
    return get_supabase_client()


def _validate_and_build_payload(rows: list[ConversationRow]) -> list[dict] | None:
    sid, uid = rows[0]["session_id"], rows[0]["user_id"]
    payload: list[dict] = []
    for i, row in enumerate(rows):
        if row["session_id"] != sid or row["user_id"] != uid:
            logger.warning("bulk_insert: row {} mixes session_id or user_id", i)
            return None
        role = row["role"]
        if role not in _VALID_ROLES:
            logger.warning("bulk_insert: invalid role at row {}", i)
            return None
        text = (row["message"] or "").strip()
        if not text:
            continue
        payload.append({"session_id": sid, "user_id": uid, "role": role, "message": text})
    return payload


def bulk_insert_messages(rows: list[ConversationRow]) -> bool:
    if not rows:
        return True
    sid, uid = rows[0]["session_id"], rows[0]["user_id"]
    if not get_session_for_user(sid, uid):
        logger.warning("bulk_insert: session not found | session_id={}", sid)
        return False
    payload = _validate_and_build_payload(rows)
    if payload is None:
        return False
    if not payload:
        return True

    sb = _sb()
    if sb:
        try:
            sb.table(TABLE).insert(payload).execute()
            return True
        except Exception as e:
            logger.warning("bulk_insert (supabase) error: {}", e)

    # SQLite fallback
    created_at = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_conn()
        conn.executemany(
            "INSERT INTO conversation_history (session_id, user_id, role, message, created_at) VALUES (?, ?, ?, ?, ?)",
            [(r["session_id"], r["user_id"], r["role"], r["message"], created_at) for r in payload],
        )
        conn.commit()
        return True
    except Exception as e:
        logger.warning("bulk_insert (sqlite) error: {}", e)
        return False


def list_messages_for_session(session_id: str, user_id: str) -> list[dict] | None:
    sb = _sb()
    if sb:
        try:
            res = (
                sb.table(TABLE)
                .select("role, message, created_at")
                .eq("session_id", session_id)
                .eq("user_id", user_id)
                .order("created_at")
                .execute()
            )
            return res.data or []
        except Exception as e:
            logger.warning("list_messages_for_session (supabase) error: {}", e)

    try:
        rows = get_conn().execute(
            "SELECT role, message, created_at FROM conversation_history WHERE session_id=? AND user_id=? ORDER BY created_at ASC",
            (session_id, user_id),
        ).fetchall()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.warning("list_messages_for_session (sqlite) error: {}", e)
        return None


def get_messages_for_session(session_id: str, user_id: str) -> list[dict] | None:
    if not get_session_for_user(session_id, user_id):
        return None
    return list_messages_for_session(session_id, user_id)
