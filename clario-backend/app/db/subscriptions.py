# ─── Subscription storage ─────────────────────────────────────────────────────
# Primary:  Supabase `subscriptions` table (when SUPABASE_URL is set)
# Fallback: SQLite (local dev without Supabase)
#
# Supabase table schema — run SUPABASE_MIGRATION.sql in your Supabase SQL editor.

from __future__ import annotations
from loguru import logger

# Track whether the Supabase subscriptions table is confirmed to exist.
# Avoids repeated error logs when the migration hasn't been run yet.
_supa_table_ok: bool | None = None  # None = untested, True = ok, False = missing


# ── Supabase path ─────────────────────────────────────────────────────────────

def _supa():
    from app.core.supabase import get_supabase_client
    return get_supabase_client()


def _supa_available() -> bool:
    """Return True only if Supabase is configured AND the subscriptions table exists."""
    global _supa_table_ok
    if _supa() is None:
        return False
    if _supa_table_ok is False:
        return False  # already confirmed missing — don't retry every request
    return True


def _supa_get(user_id: str) -> dict | None:
    global _supa_table_ok
    if not user_id or user_id == "guest":
        return None
    try:
        res = _supa().table("subscriptions").select("*").eq("user_id", user_id).maybe_single().execute()
        _supa_table_ok = True
        return res.data if res is not None else None
    except Exception as e:
        err = str(e)
        if "PGRST205" in err or "schema cache" in err or "does not exist" in err:
            if _supa_table_ok is not False:
                logger.warning("Supabase 'subscriptions' table missing — run SUPABASE_MIGRATION.sql. Falling back to SQLite.")
            _supa_table_ok = False
        else:
            logger.error("Supabase get_subscription error: {}", e)
        return None


def _supa_upsert(user_id: str, **fields) -> None:
    global _supa_table_ok
    try:
        payload = {"user_id": user_id, **{k: v for k, v in fields.items() if v is not None}}
        _supa().table("subscriptions").upsert(payload, on_conflict="user_id").execute()
        _supa_table_ok = True
    except Exception as e:
        err = str(e)
        if "PGRST205" in err or "schema cache" in err or "does not exist" in err:
            if _supa_table_ok is not False:
                logger.warning("Supabase 'subscriptions' table missing — run SUPABASE_MIGRATION.sql. Falling back to SQLite.")
            _supa_table_ok = False
        else:
            logger.error("Supabase upsert_subscription error: {}", e)


# ── SQLite fallback path ───────────────────────────────────────────────────────

def _sqlite_init() -> None:
    from app.core.database import get_conn
    get_conn().executescript("""
        CREATE TABLE IF NOT EXISTS subscriptions (
            user_id TEXT PRIMARY KEY,
            stripe_customer_id TEXT,
            stripe_subscription_id TEXT,
            plan TEXT,
            status TEXT,
            current_period_end INTEGER
        );
    """)
    get_conn().commit()


def _sqlite_get(user_id: str) -> dict | None:
    from app.core.database import get_conn
    row = get_conn().execute(
        "SELECT * FROM subscriptions WHERE user_id = ?", (user_id,)
    ).fetchone()
    return dict(row) if row else None


def _sqlite_upsert(user_id: str, **fields) -> None:
    from app.core.database import get_conn
    conn = get_conn()
    existing = conn.execute(
        "SELECT 1 FROM subscriptions WHERE user_id = ?", (user_id,)
    ).fetchone()
    if existing:
        sets, vals = [], []
        for k, v in fields.items():
            if v is not None:
                sets.append(f"{k} = ?")
                vals.append(v)
        if sets:
            conn.execute(f"UPDATE subscriptions SET {', '.join(sets)} WHERE user_id = ?", [*vals, user_id])
    else:
        cols = ["user_id"] + [k for k, v in fields.items() if v is not None]
        vals = [user_id] + [v for v in fields.values() if v is not None]
        placeholders = ", ".join(["?"] * len(vals))
        conn.execute(f"INSERT INTO subscriptions ({', '.join(cols)}) VALUES ({placeholders})", vals)
    conn.commit()


# ── Public API ────────────────────────────────────────────────────────────────

def init_subscriptions_table() -> None:
    """Only needed for SQLite; Supabase tables are created via SQL migration."""
    if _supa() is None:
        _sqlite_init()


def get_subscription(user_id: str) -> dict | None:
    if _supa_available():
        result = _supa_get(user_id)
        if _supa_table_ok:  # table confirmed ok
            return result
    return _sqlite_get(user_id)


def upsert_subscription(
    user_id: str,
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
    plan: str | None = None,
    status: str | None = None,
    current_period_end: int | None = None,
) -> None:
    fields = dict(
        stripe_customer_id=stripe_customer_id,
        stripe_subscription_id=stripe_subscription_id,
        plan=plan,
        status=status,
        current_period_end=current_period_end,
    )
    if _supa_available():
        _supa_upsert(user_id, **fields)
        if _supa_table_ok:
            return
    _sqlite_upsert(user_id, **fields)
