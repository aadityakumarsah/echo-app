# ─── Supabase admin client ────────────────────────────────────────────────────
# Uses the service role key — bypasses RLS for all backend writes.
# Env vars:
#   SUPABASE_URL              → Project URL from Supabase > Settings > API
#   SUPABASE_SERVICE_ROLE_KEY → service_role key (keep SECRET — never expose to frontend)

from __future__ import annotations
from functools import lru_cache
from app.core.config import settings


@lru_cache(maxsize=1)
def get_supabase_client():
    """Return a cached Supabase admin client, or None if not configured."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return None
    try:
        from supabase import create_client
        return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Supabase client init failed: %s", e)
        return None
