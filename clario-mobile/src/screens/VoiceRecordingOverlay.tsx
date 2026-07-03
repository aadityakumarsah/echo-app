/**
 * VoiceRecordingOverlay — full-screen voice call UI.
 *
 * Audio pipeline (native, works on simulator + physical device):
 *   react-native-audio-api AudioRecorder → PCM16 16kHz → raw binary WebSocket frames → Gemini Live
 *   Gemini Live → raw binary PCM16 24kHz ← WebSocket → AudioContext playback
 *
 * No WebView needed — uses native iOS/Android AVAudioEngine.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Modal,
  Easing,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic, MicOff, PhoneOff } from 'lucide-react-native';
import {
  AudioContext,
  AudioManager,
  AudioRecorder,
  type AudioBuffer as RNAudioBuffer,
} from 'react-native-audio-api';
import { colors, fonts } from '../lib/theme';

const { width } = Dimensions.get('window');
const ORB_SIZE = Math.min(width * 0.52, 220);

const WS_URL = 'wss://echo-yg4t.onrender.com/websocket/gemini/live';
const GEMINI_INPUT_RATE = 16000;
const GEMINI_OUTPUT_RATE = 24000;
const INPUT_GAIN = 2.4;
// User must be significantly louder than typical speaker bleed to barge in.
// 0.28 requires the user to speak at near-normal volume — speaker bleed at arm's
// length is typically 0.04-0.10 even with defaultToSpeaker, so this prevents echo
// feedback while still allowing deliberate interruption.
const BARGE_IN_RMS = 0.28;

// ─── audio helpers ─────────────────────────────────────────────────────────────

function floatToPcm16(float32: Float32Array): Int16Array {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const boosted = float32[i] * INPUT_GAIN;
    const s = Math.max(-1, Math.min(1, boosted));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}

function rmsOf(f: Float32Array): number {
  let sum = 0;
  const stride = Math.max(1, Math.floor(f.length / 256));
  let count = 0;
  for (let i = 0; i < f.length; i += stride) { sum += f[i] * f[i]; count++; }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

function resampleLinear(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate || input.length === 0) return input;
  const ratio = inRate / outRate;
  const newLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    out[i] = input[i0] * (1 - (srcPos - i0)) + input[i1] * (srcPos - i0);
  }
  return out;
}

// ─── types ─────────────────────────────────────────────────────────────────────

interface Transcript { role: 'user' | 'assistant'; text: string; }
type AgentStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

export interface Props {
  visible: boolean;
  onEnd: () => void;
  onRetry?: () => void;
  sessionId?: string | null;
  token?: string | null;
  displayName?: string;
  persona?: string;
  voice?: string;
  lang?: string;
}

// ─── component ─────────────────────────────────────────────────────────────────

export default function VoiceRecordingOverlay({
  visible, onEnd, onRetry,
  sessionId, token, displayName,
  persona = 'vanilla', voice = 'Zephyr', lang = 'en',
}: Props) {
  const insets = useSafeAreaInsets();
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('connecting');
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Animations
  const fadeAnim    = useRef(new Animated.Value(0)).current;
  const outerPulse  = useRef(new Animated.Value(1)).current;
  const innerPulse  = useRef(new Animated.Value(1)).current;
  const dotPulse    = useRef(new Animated.Value(1)).current;
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // Audio / WS refs
  const wsRef             = useRef<WebSocket | null>(null);
  const recorderRef       = useRef<AudioRecorder | null>(null);
  const playbackCtxRef    = useRef<AudioContext | null>(null);
  const nextStartTimeRef  = useRef(0);
  const mutedRef          = useRef(muted);
  const streamingRef      = useRef(false);
  const aiSpeakingRef       = useRef(false);
  // Two-stage gate: idle timer fires 650 ms after last chunk; unlock timer waits for queue drain.
  const speakingIdleRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakingUnlockRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectLockRef      = useRef(false);
  mutedRef.current = muted;

  const clearSpeakingTimers = useCallback(() => {
    if (speakingIdleRef.current)   { clearTimeout(speakingIdleRef.current);   speakingIdleRef.current   = null; }
    if (speakingUnlockRef.current) { clearTimeout(speakingUnlockRef.current); speakingUnlockRef.current = null; }
  }, []);

  const markAiSpeaking = useCallback(() => {
    aiSpeakingRef.current = true;
    clearSpeakingTimers();
    // Stage 1: wait 650 ms of silence (no new chunks) before measuring queue
    speakingIdleRef.current = setTimeout(() => {
      const ctx = playbackCtxRef.current;
      const queued = ctx ? Math.max(0, nextStartTimeRef.current - ctx.currentTime) : 0;
      // Stage 2: wait for the remaining scheduled audio + 300 ms buffer
      const unlockMs = Math.max(500, Math.round(queued * 1000) + 300);
      speakingUnlockRef.current = setTimeout(() => {
        aiSpeakingRef.current = false;
      }, unlockMs);
    }, 650);
  }, [clearSpeakingTimers]);

  // ── playback ───────────────────────────────────────────────────────────────
  const playPcmBytes = useCallback((bytes: ArrayBuffer) => {
    const ctx = playbackCtxRef.current;
    if (!ctx) return;

    const pcm16 = new Int16Array(bytes);
    if (pcm16.length === 0) return;

    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;

    const ctxRate = ctx.sampleRate || GEMINI_OUTPUT_RATE;
    const samples = ctxRate !== GEMINI_OUTPUT_RATE
      ? resampleLinear(float32, GEMINI_OUTPUT_RATE, ctxRate)
      : float32;

    const buf = ctx.createBuffer(1, samples.length, ctxRate);
    buf.copyToChannel(samples, 0, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    const now = ctx.currentTime;
    if (nextStartTimeRef.current < now + 0.02) nextStartTimeRef.current = now + 0.02;
    src.start(nextStartTimeRef.current);
    nextStartTimeRef.current += buf.duration;

    // Two-stage gate: hold mic closed while AI speaks + queue drain buffer
    markAiSpeaking();

    setAgentStatus('speaking');
    const durationMs = (bytes.byteLength / 2 / GEMINI_OUTPUT_RATE * 1000) + 200;
    setTimeout(() => setAgentStatus('listening'), durationMs);
  }, [markAiSpeaking]);

  // ── native audio stop ─────────────────────────────────────────────────────
  const stopNativeAudio = useCallback(() => {
    streamingRef.current = false;
    aiSpeakingRef.current = false;
    clearSpeakingTimers();

    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      try { recorder.clearOnAudioReady(); } catch {}
      try { recorder.stop(); } catch {}
    }

    const ctx = playbackCtxRef.current;
    playbackCtxRef.current = null;
    if (ctx) void ctx.close().catch(() => {});

    nextStartTimeRef.current = 0;
    try { void AudioManager.setAudioSessionActivity(false); } catch {}
  }, [clearSpeakingTimers]);

  // ── native audio start ────────────────────────────────────────────────────
  const startNativeAudio = useCallback(async (): Promise<boolean> => {
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosMode: 'voiceChat',
      iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
    });

    let permission: string;
    try { permission = await AudioManager.requestRecordingPermissions(); }
    catch { permission = 'Denied'; }

    if (permission !== 'Granted') {
      setAgentStatus('error');
      setErrorMsg('Microphone permission denied — allow in Settings and try again.');
      return false;
    }

    try { await AudioManager.setAudioSessionActivity(true); } catch {}

    const ctx = new AudioContext({ sampleRate: GEMINI_OUTPUT_RATE });
    playbackCtxRef.current = ctx;
    nextStartTimeRef.current = 0;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

    const recorder = new AudioRecorder();
    recorderRef.current = recorder;

    recorder.onAudioReady(
      { sampleRate: GEMINI_INPUT_RATE, bufferLength: Math.round(GEMINI_INPUT_RATE * 0.1), channelCount: 1 },
      ({ buffer }: { buffer: RNAudioBuffer }) => {
        const ws = wsRef.current;
        const channel = buffer.getChannelData(0);
        const channelRms = rmsOf(channel);
        const bargeIn = channelRms >= BARGE_IN_RMS;
        const uplinkOk = streamingRef.current && !mutedRef.current && (!aiSpeakingRef.current || bargeIn);

        if (!ws || ws.readyState !== WebSocket.OPEN || !uplinkOk) return;

        const pcm16 = floatToPcm16(channel);
        try { ws.send(pcm16.buffer as ArrayBuffer); } catch {}
      }
    );

    const result = recorder.start();
    if ((result as any)?.status === 'error') {
      setAgentStatus('error');
      setErrorMsg("Couldn't start the microphone.");
      return false;
    }

    streamingRef.current = true;
    return true;
  }, []);

  // ── WebSocket connect ─────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!sessionId || !token || connectLockRef.current) return;
    connectLockRef.current = true;
    setAgentStatus('connecting');
    setErrorMsg(null);

    const qs = [
      `token=${encodeURIComponent(token)}`,
      `persona=${encodeURIComponent(persona)}`,
      `voice=${encodeURIComponent(voice)}`,
      `lang=${encodeURIComponent(lang)}`,
      `user_name=${encodeURIComponent(displayName ?? 'friend')}`,
    ].join('&');

    const ws = new WebSocket(`${WS_URL}?${qs}`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = async () => {
      connectLockRef.current = false;
      ws.send(JSON.stringify({ type: 'config', metadata: { session_id: sessionId } }));
      const ok = await startNativeAudio();
      if (!ok) {
        ws.close(1011, 'audio_setup_failed');
        return;
      }
      setAgentStatus('listening');
    };

    ws.onmessage = (evt) => {
      if (evt.data instanceof ArrayBuffer && evt.data.byteLength > 0) {
        playPcmBytes(evt.data);
        return;
      }
      if (typeof evt.data === 'string') {
        try {
          const obj = JSON.parse(evt.data);
          if (obj.type === 'user'  && obj.text) setTranscripts((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'user') return [...prev.slice(0, -1), { role: 'user', text: obj.text }];
            return [...prev, { role: 'user', text: obj.text }];
          });
          if (obj.type === 'gemini' && obj.text) setTranscripts((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') return [...prev.slice(0, -1), { role: 'assistant', text: obj.text }];
            return [...prev, { role: 'assistant', text: obj.text }];
          });
          if (obj.type === 'turn_complete' || obj.type === 'interrupted') {
            nextStartTimeRef.current = 0;
            setAgentStatus('listening');
          }
          if (obj.type === 'error') {
            setAgentStatus('error');
            setErrorMsg(obj.message ?? 'Something went wrong');
          }
        } catch {}
      }
    };

    ws.onerror = () => {
      connectLockRef.current = false;
      setAgentStatus('error');
      setErrorMsg('WebSocket error — check your connection');
    };

    ws.onclose = () => {
      connectLockRef.current = false;
      wsRef.current = null;
      streamingRef.current = false;
    };
  }, [sessionId, token, persona, voice, lang, displayName, startNativeAudio, playPcmBytes]);

  // ── teardown ───────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    streamingRef.current = false;
    stopNativeAudio();
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close(1000, 'client_disconnect');
    }
  }, [stopNativeAudio]);

  // ── visibility effect ──────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setMuted(false);
      setElapsed(0);
      setAgentStatus('connecting');
      setTranscripts([]);
      setErrorMsg(null);

      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();

      Animated.loop(Animated.sequence([
        Animated.timing(outerPulse, { toValue: 1.12, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(outerPulse, { toValue: 1,    duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])).start();
      Animated.loop(Animated.sequence([
        Animated.timing(innerPulse, { toValue: 1.07, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(innerPulse, { toValue: 1,    duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])).start();
      Animated.loop(Animated.sequence([
        Animated.timing(dotPulse, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        Animated.timing(dotPulse, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ])).start();

      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      void connect();
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
      outerPulse.setValue(1); innerPulse.setValue(1); dotPulse.setValue(1);
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
      teardown();
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [visible]);

  const handleEnd = useCallback(() => { teardown(); onEnd(); }, [teardown, onEnd]);
  const handleToggleMute = useCallback(() => setMuted((m) => !m), []);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const statusLabel = muted
    ? 'Muted'
    : agentStatus === 'connecting' ? 'Connecting...'
    : agentStatus === 'speaking'   ? 'Clario is speaking'
    : agentStatus === 'error'      ? 'Could not connect'
    : 'Listening...';

  const statusHint = muted
    ? 'Tap the mic to unmute'
    : agentStatus === 'error'
    ? (errorMsg ?? 'Check your connection and try again')
    : agentStatus === 'speaking'   ? 'Clario is responding'
    : agentStatus === 'connecting' ? 'Starting voice session — may take a moment'
    : 'Speak freely — Clario is here with you';

  const orbColor =
    agentStatus === 'error'      ? colors.roseDeep     :
    agentStatus === 'speaking'   ? colors.lavenderDeep  :
    agentStatus === 'connecting' ? colors.warmGray + 'AA' :
    colors.amberRich;

  const recentTranscripts = transcripts.slice(-4);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleEnd}>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>

        {/* ── Top bar ── */}
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <View style={styles.recordingBadge}>
            <Animated.View style={[styles.recordingDot, { opacity: dotPulse, backgroundColor: orbColor }]} />
            <Text style={styles.recordingLabel}>ACTIVE REFLECTION</Text>
          </View>
          <View style={styles.timerPill}>
            <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
          </View>
        </View>

        {/* ── Orb — flex-centred in the space above the bottom panel ── */}
        <View style={styles.orbArea}>
          <Animated.View style={[styles.orbGlow, { transform: [{ scale: outerPulse }], backgroundColor: orbColor + '0D', borderColor: orbColor + '1A' }]} />
          <Animated.View style={[styles.orbMid,  { transform: [{ scale: outerPulse }], backgroundColor: orbColor + '12', borderColor: orbColor + '28' }]} />
          <Animated.View style={[styles.orbMain,  { transform: [{ scale: innerPulse }], backgroundColor: orbColor, shadowColor: orbColor }]}>
            <Mic size={56} color={colors.cream} strokeWidth={1.8} />
          </Animated.View>
        </View>

        {/* ── Bottom panel — sits below the orb, never overlaps ── */}
        <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 20 }]}>

          {/* Status label + hint */}
          <View style={styles.titleArea}>
            <Text style={[
              styles.listeningText,
              agentStatus === 'speaking' && { color: colors.lavenderDeep },
              agentStatus === 'error'    && { color: colors.roseDeep, fontSize: 20 },
            ]}>
              {statusLabel}
            </Text>
            <Text style={styles.listeningHint}>{statusHint}</Text>

            {agentStatus === 'error' && onRetry && (
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => { handleEnd(); setTimeout(onRetry!, 300); }}
                activeOpacity={0.8}
              >
                <Text style={styles.retryBtnText}>Try again</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Transcript bubbles — bounded height so they can't push controls off-screen */}
          {recentTranscripts.length > 0 && (
            <ScrollView
              style={styles.transcriptScroll}
              contentContainerStyle={styles.transcriptContent}
              showsVerticalScrollIndicator={false}
            >
              {recentTranscripts.map((t, i) => (
                <View key={i} style={[styles.bubble, t.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
                  <Text style={[styles.bubbleText, t.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>{t.text}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.divider} />

          {/* Controls */}
          <View style={styles.controls}>
            <View style={styles.controlItem}>
              <TouchableOpacity style={[styles.controlBtn, styles.muteBtn, muted && styles.muteBtnActive]} onPress={handleToggleMute} activeOpacity={0.8}>
                {muted
                  ? <MicOff size={24} color={colors.roseDeep} strokeWidth={2.2} />
                  : <Mic    size={24} color={colors.cocoa}    strokeWidth={2.2} />}
              </TouchableOpacity>
              <Text style={styles.controlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
            </View>
            <View style={styles.controlItem}>
              <TouchableOpacity style={[styles.controlBtn, styles.endBtn]} onPress={handleEnd} activeOpacity={0.85}>
                <PhoneOff size={24} color={colors.cream} strokeWidth={2.2} />
              </TouchableOpacity>
              <Text style={styles.controlLabel}>End Session</Text>
            </View>
          </View>

        </View>

      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.cream, flexDirection: 'column' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
  },
  recordingBadge: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  recordingDot:   { width: 7, height: 7, borderRadius: 4 },
  recordingLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2.5, color: colors.warmGray },
  timerPill: {
    backgroundColor: colors.paper, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  timerText: { fontSize: 13, fontWeight: '600', color: colors.cocoa, fontVariant: ['tabular-nums'] },

  orbArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  orbGlow: {
    position: 'absolute',
    width: ORB_SIZE + 100, height: ORB_SIZE + 100,
    borderRadius: (ORB_SIZE + 100) / 2, borderWidth: 1,
  },
  orbMid: {
    position: 'absolute',
    width: ORB_SIZE + 44, height: ORB_SIZE + 44,
    borderRadius: (ORB_SIZE + 44) / 2, borderWidth: 1,
  },
  orbMain: {
    width: ORB_SIZE, height: ORB_SIZE, borderRadius: ORB_SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 28, elevation: 18,
  },

  bottomSection: { paddingHorizontal: 24 },
  titleArea: { alignItems: 'center', paddingTop: 4, paddingBottom: 12, gap: 5 },
  listeningText: { fontFamily: fonts.serif, fontSize: 26, color: colors.cocoa, letterSpacing: -0.3, textAlign: 'center' },
  listeningHint: { fontSize: 13, color: colors.warmGray, textAlign: 'center', lineHeight: 19 },

  transcriptScroll: { maxHeight: 88, marginBottom: 8 },
  transcriptContent: { gap: 6, paddingBottom: 4 },
  bubble: { maxWidth: '85%', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
  bubbleUser:          { alignSelf: 'flex-end',  backgroundColor: colors.blush,  borderColor: colors.rose + '44' },
  bubbleAssistant:     { alignSelf: 'flex-start', backgroundColor: colors.paper, borderColor: colors.lavenderDeep + '33' },
  bubbleText:          { fontSize: 13, lineHeight: 18 },
  bubbleTextUser:      { color: colors.cocoa },
  bubbleTextAssistant: { color: colors.warmGray },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: 18 },

  retryBtn: {
    marginTop: 14, backgroundColor: colors.cocoa,
    borderRadius: 999, paddingHorizontal: 28, paddingVertical: 11,
  },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: colors.cream },

  controls:    { flexDirection: 'row', justifyContent: 'center', gap: 52 },
  controlItem: { alignItems: 'center', gap: 9 },
  controlBtn:  { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  muteBtn:     { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  muteBtnActive: { backgroundColor: colors.blush, borderColor: colors.roseDeep + '44' },
  endBtn: {
    backgroundColor: colors.cocoa,
    shadowColor: colors.cocoa, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22, shadowRadius: 10, elevation: 8,
  },
  controlLabel: { fontSize: 12, color: colors.warmGray, fontWeight: '500', letterSpacing: 0.2 },
});
