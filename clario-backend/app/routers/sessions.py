from uuid import UUID
from datetime import date

from fastapi import APIRouter, Depends, Query
from loguru import logger

from app.core.auth import get_current_user
from app.schema.call_report import SessionDetailData
from app.schema.response import ApiResponse, fail, ok
from app.schema.session import SessionStartData
from app.services import call_report as call_report_service
from app.services import voice_session as voice_session_service

sessions_router = APIRouter(prefix="/sessions", tags=["Sessions"])


@sessions_router.get("", response_model=ApiResponse[list[SessionDetailData]])
def list_sessions(
    date_filter: date | None = Query(default=None, alias="date"),
    tz_offset_minutes: int = Query(default=0, ge=-840, le=840),
    user: dict = Depends(get_current_user),
):
    """All sessions for the current user with metadata, optional report, and conversation turns."""
    user_id = user.get("id")
    logger.info(
        "GET /sessions for user {} | date={} | tz_offset_minutes={}",
        user_id,
        date_filter,
        tz_offset_minutes,
    )
    items = call_report_service.list_sessions_detail(
        user_id,
        session_date=date_filter,
        tz_offset_minutes=tz_offset_minutes,
    )
    if items is None:
        return fail("Could not load sessions")
    return ok("OK", items)


@sessions_router.post("/start", response_model=ApiResponse[SessionStartData])
def start_session(user: dict = Depends(get_current_user)):
    """Create a voice session record and return a new random session_id."""
    user_id = user.get("id")
    logger.info("POST /sessions/start for user {}", user_id)
    row = voice_session_service.create_session(user_id)
    if not row:
        return fail("Could not create session")

    return ok(
        "Session created",
        SessionStartData(
            session_id=str(row["session_id"]),
            user_id=str(row["user_id"]),
            created_at=str(row["created_at"]),
        ),
    )


@sessions_router.get(
    "/{session_id}",
    response_model=ApiResponse[SessionDetailData],
)
def get_session(session_id: UUID, user: dict = Depends(get_current_user)):
    """Session metadata, optional stored report, and conversation turns."""
    user_id = user.get("id")
    sid = str(session_id)
    logger.info("GET /sessions/{} for user {}", sid, user_id)
    detail = call_report_service.get_session_detail(sid, user_id)
    if not detail:
        return fail("Session not found")
    return ok("OK", detail)


@sessions_router.post(
    "/{session_id}/report",
    response_model=ApiResponse[SessionDetailData],
)
def generate_session_report(session_id: UUID, user: dict = Depends(get_current_user)):
    """Generate a structured call report, persist it, and return session detail including transcript."""
    user_id = user.get("id")
    sid = str(session_id)
    logger.info("POST /sessions/{}/report for user {}", sid, user_id)
    out = call_report_service.generate_call_report(sid, user_id)
    if not out:
        return fail("Session not found, no messages, or report could not be generated")

    report, session, messages = out
    if not voice_session_service.save_call_report(sid, user_id, report.model_dump()):
        return fail("Report generated but could not be saved")

    detail = call_report_service.build_session_detail(session, report, messages)
    return ok("Report ready", detail)


@sessions_router.delete(
    "/{session_id}",
    response_model=ApiResponse[None],
)
def delete_session(session_id: UUID, user: dict = Depends(get_current_user)):
    """Permanently delete a session and its conversation history."""
    user_id = user.get("id")
    sid = str(session_id)
    logger.info("DELETE /sessions/{} for user {}", sid, user_id)
    deleted = voice_session_service.delete_session(sid, user_id)
    if not deleted:
        return fail("Session not found or could not be deleted")
    return ok("Session deleted", None)
