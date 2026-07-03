from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


MoodLabel = Literal[
    "anxious",
    "calm",
    "hopeful",
    "reflective",
    "frustrated",
    "overwhelmed",
    "grateful",
    "sad",
    "excited",
    "neutral",
]

InsightType = Literal["pattern", "moment", "suggestion"]

ThingCategory = Literal["work", "social", "health", "personal", "other"]

ThingSentiment = Literal["positive", "neutral", "negative"]


class MoodPoint(BaseModel):
    score: int = Field(ge=1, le=10)
    label: MoodLabel


class ThemeDiscussed(BaseModel):
    label: str
    summary: str


class ThingYouDid(BaseModel):
    """First-person journal lines; legacy `label` is migrated to `narrative` on load."""

    narrative: str = Field(
        ...,
        description=(
            "2–4 sentences in first person (I…), warm and concrete — what they did, felt, or chose."
        ),
    )
    category: ThingCategory
    sentiment: ThingSentiment

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_label(cls, data: Any) -> Any:
        if isinstance(data, dict) and "narrative" not in data and data.get("label"):
            data = {**data, "narrative": data["label"]}
        return data


class InsightItem(BaseModel):
    type: InsightType
    body: str


class CallReportLLMFields(BaseModel):
    """Structured output from the model (no session metrics — those are computed)."""

    session_overview: list[str] = Field(
        ...,
        min_length=3,
        max_length=3,
        description=(
            "Exactly three strings. Each must be one beautiful, complete sentence — "
            "mental-health journaling tone, emotional truth, not a plot summary. "
            "Together they form a short lyrical arc."
            "Make sure the points are different and distinct and not repetitive"
        ),
    )
    one_word_summary: str
    average_mood_rating: float = Field(ge=1.0, le=10.0)
    energy_level: int = Field(ge=1, le=10)
    mood_across_session: list[MoodPoint]
    themes_discussed: list[ThemeDiscussed]
    things_you_did_today: list[ThingYouDid]
    gratitude: list[str]
    insights: list[InsightItem]
    suggestions: list[str]
    personal_reflection: str = Field(
        ...,
        description=(
            "Full journal-style reflection as the user might write it: first person (I, me, my), "
            "several paragraphs with sensory detail, feelings, tensions, and meaning — not a summary. "
            "This is the main private reflection for a journal replacement."
        ),
    )


class CallReportData(CallReportLLMFields):
    session_id: str
    duration_seconds: int = Field(ge=0)
    user_words_spoken: int = Field(ge=0)

    @model_validator(mode="before")
    @classmethod
    def legacy_missing_personal_reflection(cls, data: Any) -> Any:
        if isinstance(data, dict) and "personal_reflection" not in data:
            data = {**data, "personal_reflection": ""}
        return data


class ConversationTurn(BaseModel):
    role: str
    message: str
    created_at: str


class SessionDetailData(BaseModel):
    """Session row + optional stored report + transcript turns (for GET and POST report)."""

    session_id: str
    user_id: str
    created_at: str
    ended_at: str | None = None
    duration_seconds: int | None = None
    report: CallReportData | None = None
    conversation: list[ConversationTurn]
