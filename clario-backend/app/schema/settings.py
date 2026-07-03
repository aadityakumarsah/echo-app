from __future__ import annotations

import re
from typing import Optional
from pydantic import BaseModel, field_validator


class SettingsData(BaseModel):
    """Full settings object returned in API responses."""
    user_id: str
    name: str
    email: str          # injected from Supabase auth — not stored in DB
    daily_reminder: bool
    streak_notifications: bool
    weekly_digest: bool
    reminder_time: str  # "HH:MM"
    updated_at: str


class SettingsUpdate(BaseModel):
    """All fields optional — send only what changed."""
    name: Optional[str] = None
    daily_reminder: Optional[bool] = None
    streak_notifications: Optional[bool] = None
    weekly_digest: Optional[bool] = None
    reminder_time: Optional[str] = None

    model_config = {"extra": "forbid"}

    @field_validator("reminder_time")
    @classmethod
    def validate_time(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", v):
            raise ValueError("reminder_time must be HH:MM (e.g. 08:00)")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v.strip()) == 0:
            raise ValueError("name cannot be blank")
        return v.strip() if v else v
