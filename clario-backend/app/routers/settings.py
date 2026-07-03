from fastapi import APIRouter, Depends
from loguru import logger

from app.core.auth import get_current_user
from app.schema.response import ApiResponse, ok, fail, field_error
from app.schema.settings import SettingsData, SettingsUpdate
from app.services import settings as settings_service

settings_router = APIRouter(prefix="/settings", tags=["Settings"])


def _to_response(row: dict, email: str) -> SettingsData:
    return SettingsData(
        user_id=row["user_id"],
        name=row.get("name", ""),
        email=email,
        daily_reminder=row.get("daily_reminder", True),
        streak_notifications=row.get("streak_notifications", True),
        weekly_digest=row.get("weekly_digest", False),
        reminder_time=row.get("reminder_time", "08:00"),
        updated_at=str(row.get("updated_at", "")),
    )


@settings_router.get("", response_model=ApiResponse[SettingsData])
def get_settings(user: dict = Depends(get_current_user)):
    logger.info("GET /settings for user {}", user.get("id"))
    row = settings_service.get_or_create(user["id"])
    if not row:
        logger.error("get_or_create returned None for user {}", user.get("id"))
        return fail("Could not retrieve settings")
    return ok("Settings retrieved", _to_response(row, user.get("email", "")))


@settings_router.patch("", response_model=ApiResponse[SettingsData])
def patch_settings(body: SettingsUpdate, user: dict = Depends(get_current_user)):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return fail(
            "No fields provided",
            [field_error(None, "empty_body", "Send at least one field to update")],
        )

    # Ensure the row exists before patching
    settings_service.get_or_create(user["id"])

    row = settings_service.update_settings(user["id"], updates)
    if not row:
        return fail("Failed to update settings")
    return ok("Settings updated", _to_response(row, user.get("email", "")))
