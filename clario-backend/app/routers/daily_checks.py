"""
Daily check routes — mark steps, query today's state + streak, history.

Tables used (Supabase, created by SUPABASE_MIGRATION.sql):
  public.daily_checks  — one row per (user_id, check_date)
  public.user_streaks  — one row per user_id, current/longest streak

All endpoints fall back to a flat in-memory dict for guest users so the
web app works even before Supabase is configured.
"""

from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel

from app.core.auth import get_current_user

daily_checks_router = APIRouter(prefix="/daily-checks", tags=["Daily Checks"])

STEPS = ("morning", "refill", "night")


# ─── Schemas ──────────────────────────────────────────────────────────────────

class MarkStepRequest(BaseModel):
    step: str         # "morning" | "refill" | "night"
    check_date: str   # "YYYY-MM-DD"


class DailyChecksState(BaseModel):
    check_date: str
    morning: bool
    refill: bool
    night: bool
    day_complete: bool
    completed_at: str | None
    current_streak: int
    longest_streak: int
    last_check_date: str | None


class DailyCheckDay(BaseModel):
    check_date: str
    morning: bool
    refill: bool
    night: bool
    day_complete: bool


# ─── Supabase helpers ─────────────────────────────────────────────────────────

def _supa():
    try:
        from app.core.supabase import get_supabase_client
        return get_supabase_client()
    except Exception:
        return None


def _upsert_check(user_id: str, check_date: str, step: str) -> dict:
    """Mark one step done; returns the updated row."""
    client = _supa()
    if not client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    # Fetch or create today's row
    res = (
        client.table("daily_checks")
        .select("*")
        .eq("user_id", user_id)
        .eq("check_date", check_date)
        .maybe_single()
        .execute()
    )
    row = res.data or {
        "user_id": user_id,
        "check_date": check_date,
        "morning": False,
        "refill": False,
        "night": False,
        "day_complete": False,
        "completed_at": None,
    }

    row[step] = True
    all_done = row["morning"] and row["refill"] and row["night"]
    row["day_complete"] = all_done
    if all_done and not row.get("completed_at"):
        from datetime import datetime, timezone
        row["completed_at"] = datetime.now(timezone.utc).isoformat()

    client.table("daily_checks").upsert(row).execute()
    return row


def _get_today(user_id: str, check_date: str) -> dict:
    client = _supa()
    if not client:
        return {
            "check_date": check_date,
            "morning": False, "refill": False, "night": False,
            "day_complete": False, "completed_at": None,
        }
    res = (
        client.table("daily_checks")
        .select("*")
        .eq("user_id", user_id)
        .eq("check_date", check_date)
        .maybe_single()
        .execute()
    )
    if res.data:
        return res.data
    return {
        "check_date": check_date,
        "morning": False, "refill": False, "night": False,
        "day_complete": False, "completed_at": None,
    }


def _get_streak(user_id: str) -> tuple[int, int, str | None]:
    """Returns (current_streak, longest_streak, last_check_date)."""
    client = _supa()
    if not client:
        return 0, 0, None
    res = (
        client.table("user_streaks")
        .select("*")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if res.data:
        d = res.data
        return d.get("current_streak", 0), d.get("longest_streak", 0), d.get("last_check_date")
    return 0, 0, None


def _update_streak(user_id: str, check_date: str):
    """Recompute and upsert the streak for user after a day_complete event."""
    client = _supa()
    if not client:
        return

    current, longest, last = _get_streak(user_id)
    today = date.fromisoformat(check_date)

    if last is None:
        current = 1
    else:
        last_date = date.fromisoformat(last)
        if today == last_date:
            return  # already counted today
        elif today == last_date + timedelta(days=1):
            current += 1
        else:
            current = 1  # streak broken

    longest = max(longest, current)

    client.table("user_streaks").upsert({
        "user_id": user_id,
        "current_streak": current,
        "longest_streak": longest,
        "last_check_date": check_date,
    }).execute()


def _get_history(user_id: str, days: int, end_date: str) -> list[dict]:
    client = _supa()
    end = date.fromisoformat(end_date)
    start = end - timedelta(days=days - 1)
    if not client:
        return [
            {
                "check_date": (start + timedelta(days=i)).isoformat(),
                "morning": False, "refill": False, "night": False, "day_complete": False,
            }
            for i in range(days)
        ]
    res = (
        client.table("daily_checks")
        .select("check_date,morning,refill,night,day_complete")
        .eq("user_id", user_id)
        .gte("check_date", start.isoformat())
        .lte("check_date", end.isoformat())
        .order("check_date")
        .execute()
    )
    rows_by_date = {r["check_date"]: r for r in (res.data or [])}
    result = []
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        result.append(rows_by_date.get(d, {
            "check_date": d,
            "morning": False, "refill": False, "night": False, "day_complete": False,
        }))
    return result


# ─── Routes ───────────────────────────────────────────────────────────────────

@daily_checks_router.post("/mark")
def mark_step(
    body: MarkStepRequest,
    user: dict = Depends(get_current_user),
):
    user_id = user.get("id") or user.get("sub")
    if not user_id or user_id == "guest":
        raise HTTPException(status_code=401, detail="Authentication required")
    if body.step not in STEPS:
        raise HTTPException(status_code=422, detail=f"step must be one of {STEPS}")

    try:
        row = _upsert_check(user_id, body.check_date, body.step)
        if row.get("day_complete"):
            _update_streak(user_id, body.check_date)
        current, longest, last = _get_streak(user_id)
        return {
            "success": True,
            "data": {
                **row,
                "current_streak": current,
                "longest_streak": longest,
                "last_check_date": last,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("mark_step error for user {}", user_id)
        raise HTTPException(status_code=500, detail=str(e))


@daily_checks_router.get("/today")
def get_today(
    check_date: str,
    user: dict = Depends(get_current_user),
):
    user_id = user.get("id") or user.get("sub")
    if not user_id or user_id == "guest":
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        row = _get_today(user_id, check_date)
        current, longest, last = _get_streak(user_id)
        return {
            "success": True,
            "data": {
                **row,
                "current_streak": current,
                "longest_streak": longest,
                "last_check_date": last,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("get_today error for user {}", user_id)
        raise HTTPException(status_code=500, detail=str(e))


@daily_checks_router.get("/history")
def get_history(
    days: int = 7,
    end_date: str = "",
    user: dict = Depends(get_current_user),
):
    user_id = user.get("id") or user.get("sub")
    if not user_id or user_id == "guest":
        raise HTTPException(status_code=401, detail="Authentication required")
    if not end_date:
        end_date = date.today().isoformat()

    try:
        rows = _get_history(user_id, days, end_date)
        return {"success": True, "data": rows}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("get_history error for user {}", user_id)
        raise HTTPException(status_code=500, detail=str(e))
