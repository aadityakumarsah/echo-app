"""Relief activity analysis — sends drawing image to Gemini Vision for stress assessment."""

import base64
import json
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger

from google import genai
from google.genai import types

from app.core.config import settings

relief_router = APIRouter(prefix="/relief", tags=["Relief"])


class DrawingAnalysisRequest(BaseModel):
    image: str  # data:image/png;base64,<data>  OR bare base64


class DrawingAnalysisResponse(BaseModel):
    stress_level: int          # 0 (very stressed) – 10 (very calm)
    mental_state: str
    drawing_analysis: str
    stress_reduction: int      # 0-100 %
    focus_score: int
    calm_score: int
    creativity_score: int
    mood_before: int
    mood_after: int
    insights: list[str]
    recommendation: str


_PROMPT = """
You are a clinical art-therapy AI. A user just made a freehand air-drawing in a mindfulness app.
Analyze the image carefully and infer their emotional/stress state from visual cues.

Look for:
- Stroke randomness, jaggedness, or chaos → high stress/anxiety
- Dense, overlapping, or erratic marks → tension or hyperactivity
- Smooth, flowing, or circular strokes → calm or meditative state
- Sparse or tiny drawings → withdrawn / low energy
- Bold, confident strokes → grounded / focused
- Empty canvas → they barely engaged (possible dissociation or boredom)
- Geometric or structured patterns → analytical / controlled mind
- Use of the full canvas → expressive / open
- Color variety (infer from dark/light areas) → emotional range

Based on this, return ONLY a valid JSON object (no markdown, no explanation outside the JSON):
{
  "stress_level": <int 0-10, where 0=extreme stress/chaos, 10=very calm/peaceful>,
  "mental_state": "<2-3 word phrase like 'Mildly Anxious', 'Deeply Calm', 'Scattered Focus'>",
  "drawing_analysis": "<1-2 sentences describing exactly what you observe in the strokes>",
  "stress_reduction": <int 10-75, how much the session likely reduced stress>,
  "focus_score": <int 0-100>,
  "calm_score": <int 0-100>,
  "creativity_score": <int 0-100>,
  "mood_before": <int 3-7, estimated mood before session>,
  "mood_after": <int mood_before+1 to mood_before+4, must be <= 10>,
  "insights": [
    "<insight 1 — specific to what you saw in the drawing>",
    "<insight 2 — psychological interpretation>",
    "<insight 3 — actionable suggestion>"
  ],
  "recommendation": "<one gentle, personalized suggestion for their next step>"
}
"""


def _extract_json(text: str) -> dict:
    """Extract first JSON object from LLM output."""
    text = text.strip()
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Extract JSON block
    match = re.search(r"\{[\s\S]+\}", text)
    if match:
        return json.loads(match.group(0))
    raise ValueError("No JSON found in response")


def _analyze(image_b64: str) -> dict:
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    image_bytes = base64.b64decode(image_b64)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
            _PROMPT,
        ],
    )

    raw = response.candidates[0].content.parts[0].text
    logger.debug("Gemini drawing analysis raw: {}", raw[:300])
    return _extract_json(raw)


@relief_router.post("/analyze", response_model=DrawingAnalysisResponse)
async def analyze_drawing(req: DrawingAnalysisRequest):
    # Strip data URI prefix if present
    image_data = req.image
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]

    if not image_data:
        raise HTTPException(status_code=400, detail="image is required")

    try:
        import asyncio
        result = await asyncio.to_thread(_analyze, image_data)
    except Exception as e:
        logger.error("Drawing analysis error: {}", e)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")

    # Clamp / validate fields
    def clamp(v, lo, hi):
        try:
            return max(lo, min(hi, int(v)))
        except Exception:
            return lo

    mb = clamp(result.get("mood_before", 4), 3, 7)
    ma = clamp(result.get("mood_after", mb + 2), mb, 10)

    return DrawingAnalysisResponse(
        stress_level=clamp(result.get("stress_level", 5), 0, 10),
        mental_state=str(result.get("mental_state", "Neutral"))[:60],
        drawing_analysis=str(result.get("drawing_analysis", ""))[:400],
        stress_reduction=clamp(result.get("stress_reduction", 30), 0, 100),
        focus_score=clamp(result.get("focus_score", 50), 0, 100),
        calm_score=clamp(result.get("calm_score", 50), 0, 100),
        creativity_score=clamp(result.get("creativity_score", 50), 0, 100),
        mood_before=mb,
        mood_after=ma,
        insights=[str(i)[:300] for i in result.get("insights", [])[:3]],
        recommendation=str(result.get("recommendation", ""))[:300],
    )
