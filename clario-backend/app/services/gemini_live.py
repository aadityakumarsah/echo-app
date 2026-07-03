import asyncio
import inspect
import logging
import traceback
from pathlib import Path

logger = logging.getLogger(__name__)
from google import genai
from google.genai import types

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "ai" / "prompts"
_BASE_AGENT_PROMPT_PATH = _PROMPTS_DIR / "base_agent.md"

# Frontend persona ids -> prompt filenames under app/ai/prompts/
_PERSONA_PROMPT_FILES: dict[str, str] = {
    "vanilla": "base_agent.md",
    "chaotic_friend": "chaotic_friend.md",
    "older_sibling": "older_sibling.md",
    "chill_overthinker": "chill_overthinker.md",
    "insight_coach": "insight_coach.md",
    "calm_observer": "calm_obserber.md",
}

# Gemini Live prebuilt voices (aligned with frontend VOICES)
_ALLOWED_VOICES = frozenset(
    {"Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede"}
)
_DEFAULT_VOICE = "Zephyr"

# Session UI language (query ?lang=en|ne)
_ALLOWED_LANGS = frozenset({"en", "ne"})
_DEFAULT_LANG = "en"


def _load_base_agent_prompt() -> str:
    return _BASE_AGENT_PROMPT_PATH.read_text(encoding="utf-8")


def _resolve_system_prompt(persona: str | None) -> str:
    if not persona:
        return _load_base_agent_prompt()
    key = persona.strip()
    fname = _PERSONA_PROMPT_FILES.get(key)
    if not fname:
        logger.warning("Unknown persona id %r, using base_agent.md", key)
        return _load_base_agent_prompt()
    path = _PROMPTS_DIR / fname
    if not path.is_file():
        logger.warning("Persona prompt missing %s, using base_agent.md", path)
        return _load_base_agent_prompt()
    return path.read_text(encoding="utf-8")


def _resolve_voice_name(voice: str | None) -> str:
    if not voice:
        return _DEFAULT_VOICE
    name = voice.strip()
    if name in _ALLOWED_VOICES:
        return name
    logger.warning("Unsupported voice %r, using %s", name, _DEFAULT_VOICE)
    return _DEFAULT_VOICE


def _resolve_language(lang: str | None) -> str:
    if not lang:
        return _DEFAULT_LANG
    key = lang.strip().lower()
    if key in _ALLOWED_LANGS:
        return key
    logger.warning("Unknown lang %r, using %s", lang, _DEFAULT_LANG)
    return _DEFAULT_LANG


def _language_preference_block(lang: str) -> str:
    if lang == "ne":
        return """

<preferred_language>
The user's preferred language for this session is: Nepali.
Conduct the entire conversation in Nepali: listen, think, and respond only in natural Nepali as spoken in Nepal.
Use authentic Nepali pronunciation and intonation; avoid a Westernized or "foreign learner" delivery when speaking Nepali.
If the user explicitly switches to another language mid-session, follow their lead for the rest of that turn onward.
</preferred_language>
"""
    return """

<preferred_language>
The user's preferred language for this session is: English.
Conduct the entire conversation in English: listen, think, and respond only in clear, natural English.
If the user explicitly switches to another language mid-session, follow their lead for the rest of that turn onward.
</preferred_language>
"""


def _build_full_system_prompt(persona: str | None, lang: str | None, user_name: str | None = None) -> str:
    resolved_lang = _resolve_language(lang)
    base = _resolve_system_prompt(persona)
    name_block = f"""
<user_context>
    The user's name is {user_name.strip()}. Use their name naturally in conversation — greet them by name at the start, and occasionally use it throughout to make the session feel personal. Don't overdo it.
</user_context>
""" if user_name and user_name.strip() else ""
    return base + name_block + _language_preference_block(resolved_lang)


class GeminiLive:
    """
    Handles the interaction with the Gemini Live API.
    """
    def __init__(
        self,
        api_key,
        model,
        input_sample_rate,
        tools=None,
        tool_mapping=None,
        persona: str | None = None,
        voice_name: str | None = None,
        language: str | None = None,
        user_name: str | None = None,
    ):
        """
        Initializes the GeminiLive client.

        Args:
            api_key (str): The Gemini API Key.
            model (str): The model name to use.
            input_sample_rate (int): The sample rate for audio input.
            tools (list, optional): List of tools to enable. Defaults to None.
            tool_mapping (dict, optional): Mapping of tool names to functions. Defaults to None.
            persona (str, optional): Frontend persona id; selects prompt file under app/ai/prompts/.
            voice_name (str, optional): Gemini prebuilt voice name for TTS.
            language (str, optional): Session language code, ``en`` or ``ne`` (query ``lang``).
        """
        self.api_key = api_key
        self.model = model
        self.input_sample_rate = input_sample_rate
        self.client = genai.Client(api_key=api_key)
        self.tools = tools or []
        self.tool_mapping = tool_mapping or {}
        self.persona = persona
        self.user_name = user_name
        self.voice_name = _resolve_voice_name(voice_name)
        self.language = _resolve_language(language)
        self._system_instruction_text = _build_full_system_prompt(persona, language, user_name)

    async def start_session(self, audio_input_queue, video_input_queue, text_input_queue, audio_output_callback, audio_interrupt_callback=None):
        logger.info(
            "Gemini Live session config | persona=%r voice=%s lang=%s",
            self.persona,
            self.voice_name,
            self.language,
        )
        config = types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=self.voice_name
                    )
                )
            ),
            system_instruction=types.Content(
                parts=[types.Part(text=self._system_instruction_text)]
            ),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            realtime_input_config=types.RealtimeInputConfig(
                turn_coverage="TURN_INCLUDES_ONLY_ACTIVITY",
            ),
            tools=self.tools,
        )
        
        logger.info(f"Connecting to Gemini Live with model={self.model}")
        try:
          async with self.client.aio.live.connect(model=self.model, config=config) as session:
            logger.info("Gemini Live session opened successfully")
            
            async def send_audio():
                try:
                    while True:
                        chunk = await audio_input_queue.get()
                        await session.send_realtime_input(
                            audio=types.Blob(data=chunk, mime_type=f"audio/pcm;rate={self.input_sample_rate}")
                        )
                except asyncio.CancelledError:
                    logger.debug("send_audio task cancelled")
                except Exception as e:
                    logger.error(f"send_audio error: {e}\n{traceback.format_exc()}")

            async def send_video():
                try:
                    while True:
                        chunk = await video_input_queue.get()
                        logger.info(f"Sending video frame to Gemini: {len(chunk)} bytes")
                        await session.send_realtime_input(
                            video=types.Blob(data=chunk, mime_type="image/jpeg")
                        )
                except asyncio.CancelledError:
                    logger.debug("send_video task cancelled")
                except Exception as e:
                    logger.error(f"send_video error: {e}\n{traceback.format_exc()}")

            async def send_text():
                try:
                    while True:
                        text = await text_input_queue.get()
                        logger.info(f"Sending text to Gemini: {text}")
                        await session.send_realtime_input(text=text)
                except asyncio.CancelledError:
                    logger.debug("send_text task cancelled")
                except Exception as e:
                    logger.error(f"send_text error: {e}\n{traceback.format_exc()}")

            event_queue = asyncio.Queue()

            async def receive_loop():
                try:
                    while True:
                        async for response in session.receive():
                            logger.debug(f"Received response from Gemini: {response}")
                            
                            # Log the raw response type for debugging
                            if response.go_away:
                                logger.warning(f"Received GoAway from Gemini: {response.go_away}")
                            if response.session_resumption_update:
                                logger.info(f"Session resumption update: {response.session_resumption_update}")
                            
                            server_content = response.server_content
                            tool_call = response.tool_call
                            
                            if server_content:
                                if server_content.model_turn:
                                    for part in server_content.model_turn.parts:
                                        if part.inline_data:
                                            if inspect.iscoroutinefunction(audio_output_callback):
                                                await audio_output_callback(part.inline_data.data)
                                            else:
                                                audio_output_callback(part.inline_data.data)
                                
                                if server_content.input_transcription and server_content.input_transcription.text:
                                    await event_queue.put({"type": "user", "text": server_content.input_transcription.text})
                                
                                if server_content.output_transcription and server_content.output_transcription.text:
                                    await event_queue.put({"type": "gemini", "text": server_content.output_transcription.text})
                                
                                if server_content.turn_complete:
                                    await event_queue.put({"type": "turn_complete"})
                                
                                if server_content.interrupted:
                                    if audio_interrupt_callback:
                                        if inspect.iscoroutinefunction(audio_interrupt_callback):
                                            await audio_interrupt_callback()
                                        else:
                                            audio_interrupt_callback()
                                    await event_queue.put({"type": "interrupted"})

                            if tool_call:
                                function_responses = []
                                for fc in tool_call.function_calls:
                                    func_name = fc.name
                                    args = fc.args or {}
                                    
                                    if func_name in self.tool_mapping:
                                        try:
                                            tool_func = self.tool_mapping[func_name]
                                            if inspect.iscoroutinefunction(tool_func):
                                                result = await tool_func(**args)
                                            else:
                                                loop = asyncio.get_running_loop()
                                                result = await loop.run_in_executor(None, lambda: tool_func(**args))
                                        except Exception as e:
                                            result = f"Error: {e}"
                                        
                                        function_responses.append(types.FunctionResponse(
                                            name=func_name,
                                            id=fc.id,
                                            response={"result": result}
                                        ))
                                        await event_queue.put({"type": "tool_call", "name": func_name, "args": args, "result": result})
                                
                                await session.send_tool_response(function_responses=function_responses)
                        
                        # session.receive() iterator ended (e.g. after turn_complete) — re-enter to keep listening
                        logger.debug("Gemini receive iterator completed, re-entering receive loop")

                except asyncio.CancelledError:
                    logger.debug("receive_loop task cancelled")
                except Exception as e:
                    logger.error(f"receive_loop error: {type(e).__name__}: {e}\n{traceback.format_exc()}")
                    await event_queue.put({"type": "error", "error": f"{type(e).__name__}: {e}"})
                finally:
                    logger.info("receive_loop exiting")
                    await event_queue.put(None)

            send_audio_task = asyncio.create_task(send_audio())
            send_video_task = asyncio.create_task(send_video())
            send_text_task = asyncio.create_task(send_text())
            receive_task = asyncio.create_task(receive_loop())

            try:
                while True:
                    event = await event_queue.get()
                    if event is None:
                        break
                    if isinstance(event, dict) and event.get("type") == "error":
                        # Just yield the error event, don't raise to keep the stream alive if possible or let caller handle
                        yield event
                        break 
                    yield event
            finally:
                logger.info("Cleaning up Gemini Live session tasks")
                send_audio_task.cancel()
                send_video_task.cancel()
                send_text_task.cancel()
                receive_task.cancel()
        except Exception as e:
            logger.error(f"Gemini Live session error: {type(e).__name__}: {e}\n{traceback.format_exc()}")
            raise
        finally:
            logger.info("Gemini Live session closed")
