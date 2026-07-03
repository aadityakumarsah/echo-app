"""Text-to-speech via Gemini TTS model — returns WAV audio."""

import asyncio
import base64
import struct

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from loguru import logger

from google import genai
from google.genai import types

from app.core.config import settings

tts_router = APIRouter(prefix="/tts", tags=["TTS"])

_ALLOWED_VOICES = frozenset(
    {"Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede"}
)


class TTSRequest(BaseModel):
    text: str
    voice: str = "Zephyr"


def _pcm_to_wav(pcm: bytes, sample_rate: int = 24000, channels: int = 1, bit_depth: int = 16) -> bytes:
    data_size = len(pcm)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + data_size, b"WAVE",
        b"fmt ", 16, 1, channels, sample_rate,
        sample_rate * channels * bit_depth // 8,
        channels * bit_depth // 8, bit_depth,
        b"data", data_size,
    )
    return header + pcm


def _synthesize(text: str, voice: str) -> bytes:
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    response = client.models.generate_content(
        model="gemini-2.5-flash-preview-tts",
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
                )
            ),
        ),
    )
    part = response.candidates[0].content.parts[0]
    raw = base64.b64decode(part.inline_data.data)
    mime = (part.inline_data.mime_type or "").lower()

    if "pcm" in mime:
        rate = 24000
        if "rate=" in mime:
            try:
                rate = int(mime.split("rate=")[1].split(";")[0].strip())
            except Exception:
                pass
        return _pcm_to_wav(raw, sample_rate=rate)

    return raw  # already MP3 / WAV


@tts_router.post("")
async def text_to_speech(req: TTSRequest):
    voice = req.voice if req.voice in _ALLOWED_VOICES else "Zephyr"
    text = req.text.strip()[:400]
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    try:
        audio = await asyncio.to_thread(_synthesize, text, voice)
        return Response(content=audio, media_type="audio/wav")
    except Exception as e:
        logger.error("TTS error: {}", e)
        raise HTTPException(status_code=500, detail="TTS generation failed")
