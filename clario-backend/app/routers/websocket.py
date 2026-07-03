import asyncio
import base64
import json
import time
import traceback
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from loguru import logger

from app.core.auth import get_current_user_from_token
from app.core.config import settings
from app.services import conversation_history
from app.services import voice_session
from app.services.gemini_live import GeminiLive

websocket_router = APIRouter(prefix="/websocket", tags=["WebSocket"])


def _merge_stream_transcript(previous: str, chunk: str) -> str:
    """Merge streaming transcription (cumulative strings or small deltas)."""
    if not chunk:
        return previous
    if not previous:
        return chunk
    if chunk.startswith(previous):
        return chunk
    if previous in chunk:
        return chunk
    return previous + chunk


def _playback_interrupt_noop() -> None:
    """Gemini Live callback when model audio is interrupted (client gets JSON separately)."""
    return


async def _persist_conversation_outbox(
    messages: list[conversation_history.ConversationRow],
) -> None:
    if not messages:
        return
    batch = list(messages)
    try:
        ok = await asyncio.to_thread(conversation_history.bulk_insert_messages, batch)
        if ok:
            logger.info("Saved {} conversation row(s) in one bulk insert", len(batch))
        else:
            logger.warning(
                "Bulk insert failed ({} row(s) not persisted)",
                len(batch),
            )
    except Exception as e:
        logger.warning("Bulk insert error: {}", e)


async def _try_bind_session_from_config(
    metadata: dict,
    *,
    user_id: str,
    session_holder: dict[str, str | None],
    voice_timing: dict[str, float | None],
) -> None:
    raw_sid = metadata.get("session_id")
    if not raw_sid or not user_id:
        return
    row = await asyncio.to_thread(
        voice_session.get_session_for_user,
        str(raw_sid),
        user_id,
    )
    if row:
        session_holder["id"] = str(raw_sid)
        if voice_timing.get("started_monotonic") is None:
            voice_timing["started_monotonic"] = time.monotonic()
    else:
        logger.warning("Config session_id not found or forbidden: {}", raw_sid)


async def _finalize_voice_session(
    session_id: str,
    user_id: str,
    voice_timing: dict[str, float | None],
) -> None:
    """Persist ended_at + duration_seconds on the voice_sessions row (live WS lifetime)."""
    start = voice_timing.get("started_monotonic")
    if start is None:
        return
    duration_s = max(0, int(time.monotonic() - start))
    try:
        ok = await asyncio.to_thread(
            voice_session.end_session,
            session_id,
            user_id,
            duration_s,
        )
        if ok:
            logger.info(
                "Voice session ended | session_id={} duration_seconds={}",
                session_id,
                duration_s,
            )
        else:
            logger.warning(
                "Could not update voice_sessions end | session_id={}",
                session_id,
            )
    except Exception as e:
        logger.warning("end_session error: {}", e)


@websocket_router.websocket("/gemini/live")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None),
    persona: Optional[str] = Query(default=None),
    voice: Optional[str] = Query(default=None),
    lang: Optional[str] = Query(default=None),
    user_name: Optional[str] = Query(default=None),
):
    """Gemini Live bridge (optional JWT ?token=; ?persona= ?voice= ?lang=en|ne)."""
    user = get_current_user_from_token(token)
    await websocket.accept()
    logger.info(
        "WebSocket connection accepted for user {} | persona={} | voice={} | lang={} | name={}",
        user.get("id"),
        persona,
        voice,
        lang,
        user_name,
    )

    user_id = str(user.get("id") or "")
    session_holder: dict[str, str | None] = {"id": None}
    voice_timing: dict[str, float | None] = {"started_monotonic": None}
    transcript_buffers: dict[str, str] = {"user": "", "assistant": ""}
    pending_messages: list[conversation_history.ConversationRow] = []

    def _enqueue_conversation_row(role: str, text: str) -> None:
        sid = session_holder.get("id")
        if not sid or not user_id:
            return
        msg = str(text).strip()
        if not msg or role not in ("user", "assistant", "system"):
            return
        pending_messages.append(
            {
                "session_id": sid,
                "user_id": user_id,
                "role": role,
                "message": msg,
            }
        )

    def _flush_stream_buffers_to_outbox() -> None:
        user_text = transcript_buffers["user"].strip()
        assistant_text = transcript_buffers["assistant"].strip()
        transcript_buffers["user"] = ""
        transcript_buffers["assistant"] = ""
        if user_text:
            _enqueue_conversation_row("user", user_text)
        if assistant_text:
            _enqueue_conversation_row("assistant", assistant_text)

    disconnect_event = asyncio.Event()

    async def _send_bytes_safe(data: bytes) -> None:
        if disconnect_event.is_set():
            return
        try:
            await websocket.send_bytes(data)
        except (RuntimeError, WebSocketDisconnect):
            disconnect_event.set()

    async def _send_json_safe(payload: dict) -> None:
        if disconnect_event.is_set():
            return
        try:
            await websocket.send_json(payload)
        except (RuntimeError, WebSocketDisconnect):
            disconnect_event.set()

    audio_input_queue: asyncio.Queue = asyncio.Queue()
    video_input_queue: asyncio.Queue = asyncio.Queue()
    text_input_queue: asyncio.Queue = asyncio.Queue()

    async def audio_output_callback(data: bytes) -> None:
        await _send_bytes_safe(data)

    gemini_client = GeminiLive(
        api_key=settings.GEMINI_API_KEY,
        model=settings.GEMINI_MODEL,
        input_sample_rate=16000,
        persona=persona,
        voice_name=voice,
        language=lang,
        user_name=user_name,
    )

    session_task: asyncio.Task | None = None

    async def receive_from_client() -> None:
        try:
            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    logger.info("WebSocket disconnected")
                    disconnect_event.set()
                    if session_task and not session_task.done():
                        session_task.cancel()
                    break

                if message.get("bytes"):
                    await audio_input_queue.put(message["bytes"])
                    continue

                if not message.get("text"):
                    continue

                raw_text = message["text"]
                try:
                    payload = json.loads(raw_text)
                except json.JSONDecodeError:
                    await text_input_queue.put(raw_text)
                    continue

                if not isinstance(payload, dict):
                    await text_input_queue.put(raw_text)
                    continue

                msg_type = payload.get("type")
                if msg_type == "config":
                    meta = payload.get("metadata")
                    if isinstance(meta, dict):
                        await _try_bind_session_from_config(
                            meta,
                            user_id=user_id,
                            session_holder=session_holder,
                            voice_timing=voice_timing,
                        )
                        logger.info(
                            "Client session config frame | session_id={} | metadata={}",
                            meta.get("session_id"),
                            meta,
                        )
                    else:
                        logger.info(
                            "Client session config frame | session_id=(none) | metadata={}",
                            payload.get("metadata", payload),
                        )
                    continue

                if msg_type == "image":
                    logger.info(
                        "Received image chunk from client: {} base64 chars",
                        len(payload["data"]),
                    )
                    image_data = base64.b64decode(payload["data"])
                    await video_input_queue.put(image_data)
                    continue

                if msg_type == "text":
                    content = payload.get("content") or ""
                    store = payload.get("persist") is not False
                    if store and content.strip() and session_holder["id"]:
                        _enqueue_conversation_row("user", content)
                    await text_input_queue.put(content)
                    continue

                await text_input_queue.put(raw_text)
        except WebSocketDisconnect:
            logger.info("WebSocket disconnected")
            disconnect_event.set()
            if session_task and not session_task.done():
                session_task.cancel()
        except Exception as e:
            logger.error("Error receiving from client: {}", e)
            disconnect_event.set()
            if session_task and not session_task.done():
                session_task.cancel()

    async def run_session() -> None:
        try:
            async for event in gemini_client.start_session(
                audio_input_queue=audio_input_queue,
                video_input_queue=video_input_queue,
                text_input_queue=text_input_queue,
                audio_output_callback=audio_output_callback,
                audio_interrupt_callback=_playback_interrupt_noop,
            ):
                if disconnect_event.is_set():
                    break
                if not event:
                    continue
                if isinstance(event, dict):
                    et = event.get("type")
                    if et == "user" and event.get("text") is not None:
                        transcript_buffers["user"] = _merge_stream_transcript(
                            transcript_buffers["user"],
                            str(event["text"]),
                        )
                    elif et == "gemini" and event.get("text") is not None:
                        transcript_buffers["assistant"] = _merge_stream_transcript(
                            transcript_buffers["assistant"],
                            str(event["text"]),
                        )
                    elif et in ("turn_complete", "interrupted"):
                        _flush_stream_buffers_to_outbox()
                await _send_json_safe(event)
        except asyncio.CancelledError:
            raise
        finally:
            _flush_stream_buffers_to_outbox()

    session_task = asyncio.create_task(run_session())
    receive_task = asyncio.create_task(receive_from_client())

    try:
        await session_task
    except asyncio.CancelledError:
        logger.debug("Gemini session task cancelled (client gone)")
    except Exception as e:
        logger.error(
            "Error in Gemini session: {}: {}\n{}",
            type(e).__name__,
            e,
            traceback.format_exc(),
        )
    finally:
        receive_task.cancel()
        try:
            await receive_task
        except asyncio.CancelledError:
            pass

        await _persist_conversation_outbox(pending_messages)

        sid = session_holder.get("id")
        if sid and user_id:
            await _finalize_voice_session(sid, user_id, voice_timing)

        try:
            await websocket.close()
        except Exception:
            pass
