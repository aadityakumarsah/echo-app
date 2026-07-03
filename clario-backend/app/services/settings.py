"""Settings service — SQLite."""
from datetime import datetime, timezone

from loguru import logger

from app.core.database import get_conn

_DEFAULTS = {
    "name": "",
    "daily_reminder": True,
    "streak_notifications": True,
    "weekly_digest": False,
    "reminder_time": "08:00",
}


def _row_to_dict(row) -> dict:
    d = dict(row)
    # SQLite stores booleans as 0/1
    for key in ("daily_reminder", "streak_notifications", "weekly_digest"):
        if key in d:
            d[key] = bool(d[key])
    return d


def get_settings(user_id: str) -> dict | None:
    row = get_conn().execute(
        "SELECT * FROM user_settings WHERE user_id = ?", (user_id,)
    ).fetchone()
    return _row_to_dict(row) if row else None


def create_defaults(user_id: str) -> dict | None:
    updated_at = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_conn()
        conn.execute(
            """INSERT INTO user_settings (user_id, name, daily_reminder, streak_notifications,
               weekly_digest, reminder_time, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                user_id,
                _DEFAULTS["name"],
                int(_DEFAULTS["daily_reminder"]),
                int(_DEFAULTS["streak_notifications"]),
                int(_DEFAULTS["weekly_digest"]),
                _DEFAULTS["reminder_time"],
                updated_at,
            ),
        )
        conn.commit()
        return get_settings(user_id)
    except Exception:
        # Row already exists (race) — fetch instead
        return get_settings(user_id)


def get_or_create(user_id: str) -> dict | None:
    row = get_settings(user_id)
    return row if row is not None else create_defaults(user_id)


def update_settings(user_id: str, updates: dict) -> dict | None:
    allowed = {"name", "daily_reminder", "streak_notifications", "weekly_digest", "reminder_time"}
    filtered = {k: v for k, v in updates.items() if k in allowed}
    if not filtered:
        return get_settings(user_id)

    filtered["updated_at"] = datetime.now(timezone.utc).isoformat()
    # Coerce booleans to int for SQLite
    for key in ("daily_reminder", "streak_notifications", "weekly_digest"):
        if key in filtered:
            filtered[key] = int(bool(filtered[key]))

    set_clause = ", ".join(f"{k} = ?" for k in filtered)
    values = list(filtered.values()) + [user_id]
    try:
        conn = get_conn()
        conn.execute(
            f"UPDATE user_settings SET {set_clause} WHERE user_id = ?", values
        )
        conn.commit()
        return get_settings(user_id)
    except Exception as e:
        logger.warning("update_settings error: {}", e)
        return None
