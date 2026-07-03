"""Voice session rows — Supabase (primary) with SQLite fallback."""
import json
import uuid
from datetime import date, datetime, time, timedelta, timezone

from loguru import logger

from app.core.database import get_conn
from app.core.supabase import get_supabase_client

TABLE = "voice_sessions"


# ── helpers ───────────────────────────────────────────────────────────────────

def _sb():
    """Return Supabase client or None."""
    return get_supabase_client()


def _parse_report(d: dict) -> dict:
    """Ensure call_report is a dict, not a JSON string (SQLite stores strings)."""
    if d.get("call_report") and isinstance(d["call_report"], str):
        try:
            d["call_report"] = json.loads(d["call_report"])
        except Exception:
            pass
    return d


# ── create ────────────────────────────────────────────────────────────────────

def create_session(user_id: str) -> dict | None:
    sb = _sb()
    if sb:
        try:
            res = sb.table(TABLE).insert({"user_id": user_id}).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.warning("create_session (supabase) error: {}", e)

    # SQLite fallback
    session_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_conn()
        conn.execute(
            "INSERT INTO voice_sessions (session_id, user_id, created_at) VALUES (?, ?, ?)",
            (session_id, user_id, created_at),
        )
        conn.commit()
        return {"session_id": session_id, "user_id": user_id, "created_at": created_at}
    except Exception as e:
        logger.warning("create_session (sqlite) error: {}", e)
        return None


# ── read ──────────────────────────────────────────────────────────────────────

def get_session_for_user(session_id: str, user_id: str) -> dict | None:
    sb = _sb()
    if sb:
        try:
            res = (
                sb.table(TABLE)
                .select("*")
                .eq("session_id", session_id)
                .eq("user_id", user_id)
                .maybe_single()
                .execute()
            )
            return _parse_report(dict(res.data)) if res.data else None
        except Exception as e:
            logger.warning("get_session_for_user (supabase) error: {}", e)

    # SQLite fallback
    row = get_conn().execute(
        "SELECT * FROM voice_sessions WHERE session_id = ? AND user_id = ?",
        (session_id, user_id),
    ).fetchone()
    return _parse_report(dict(row)) if row else None


def list_sessions_for_user(
    user_id: str,
    *,
    session_date: date | None = None,
    tz_offset_minutes: int = 0,
) -> list[dict] | None:
    sb = _sb()
    if sb:
        try:
            q = sb.table(TABLE).select("*").eq("user_id", user_id).order("created_at", desc=True)
            if session_date is not None:
                local_tz = timezone(timedelta(minutes=-tz_offset_minutes))
                local_start = datetime.combine(session_date, time.min, tzinfo=local_tz)
                local_end = local_start + timedelta(days=1)
                utc_start = local_start.astimezone(timezone.utc).isoformat()
                utc_end   = local_end.astimezone(timezone.utc).isoformat()
                q = q.gte("created_at", utc_start).lt("created_at", utc_end)
            res = q.execute()
            return [_parse_report(dict(r)) for r in (res.data or [])]
        except Exception as e:
            logger.warning("list_sessions_for_user (supabase) error: {}", e)

    # SQLite fallback
    try:
        conn = get_conn()
        if session_date is not None:
            local_tz = timezone(timedelta(minutes=-tz_offset_minutes))
            local_start = datetime.combine(session_date, time.min, tzinfo=local_tz)
            local_end   = local_start + timedelta(days=1)
            utc_start = local_start.astimezone(timezone.utc).isoformat()
            utc_end   = local_end.astimezone(timezone.utc).isoformat()
            rows = conn.execute(
                "SELECT * FROM voice_sessions WHERE user_id=? AND created_at>=? AND created_at<? ORDER BY created_at DESC",
                (user_id, utc_start, utc_end),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM voice_sessions WHERE user_id=? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
        return [_parse_report(dict(r)) for r in rows]
    except Exception as e:
        logger.warning("list_sessions_for_user (sqlite) error: {}", e)
        return None


# ── update ────────────────────────────────────────────────────────────────────

def end_session(session_id: str, user_id: str, duration_seconds: int) -> bool:
    if not get_session_for_user(session_id, user_id):
        return False
    ended_at = datetime.now(timezone.utc).isoformat()
    dur = max(0, int(duration_seconds))

    sb = _sb()
    if sb:
        try:
            sb.table(TABLE).update({"ended_at": ended_at, "duration_seconds": dur}).eq("session_id", session_id).eq("user_id", user_id).execute()
            return True
        except Exception as e:
            logger.warning("end_session (supabase) error: {}", e)

    try:
        conn = get_conn()
        conn.execute(
            "UPDATE voice_sessions SET ended_at=?, duration_seconds=? WHERE session_id=? AND user_id=?",
            (ended_at, dur, session_id, user_id),
        )
        conn.commit()
        return True
    except Exception as e:
        logger.warning("end_session (sqlite) error: {}", e)
        return False


def save_call_report(session_id: str, user_id: str, report: dict) -> bool:
    if not get_session_for_user(session_id, user_id):
        return False

    sb = _sb()
    if sb:
        try:
            sb.table(TABLE).update({"call_report": report}).eq("session_id", session_id).eq("user_id", user_id).execute()
            return True
        except Exception as e:
            logger.warning("save_call_report (supabase) error: {}", e)

    try:
        conn = get_conn()
        conn.execute(
            "UPDATE voice_sessions SET call_report=? WHERE session_id=? AND user_id=?",
            (json.dumps(report), session_id, user_id),
        )
        conn.commit()
        return True
    except Exception as e:
        logger.warning("save_call_report (sqlite) error: {}", e)
        return False


# ── delete ────────────────────────────────────────────────────────────────────

def delete_session(session_id: str, user_id: str) -> bool:
    """Delete a session and all its conversation history (cascade)."""
    if not get_session_for_user(session_id, user_id):
        return False

    sb = _sb()
    if sb:
        try:
            sb.table(TABLE).delete().eq("session_id", session_id).eq("user_id", user_id).execute()
            return True
        except Exception as e:
            logger.warning("delete_session (supabase) error: {}", e)

    try:
        conn = get_conn()
        conn.execute("DELETE FROM conversation_history WHERE session_id=? AND user_id=?", (session_id, user_id))
        conn.execute("DELETE FROM voice_sessions WHERE session_id=? AND user_id=?", (session_id, user_id))
        conn.commit()
        return True
    except Exception as e:
        logger.warning("delete_session (sqlite) error: {}", e)
        return False
