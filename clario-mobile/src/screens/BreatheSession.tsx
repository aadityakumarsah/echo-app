import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  Dimensions,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
// Try to load react-native-svg — works on web always, works on native after expo run:android/ios.
// Falls back to an Animated circle if the native module is not linked yet.
const SvgLib = (() => {
  try {
    const m = require('react-native-svg');
    return { Svg: m.default, Path: m.Path, Circle: m.Circle };
  } catch {
    return null;
  }
})();

// ─── cross-platform sound ─────────────────────────────────────────────────────

interface SoundHandle {
  play: () => void;   // for cues: restarts from 0; for ambient: just resumes
  resume: () => void; // always resumes without seeking
  pause: () => void;
  unload: () => void;
}

// Bundled audio assets (works on web + native via Metro)
const AUDIO_ASSETS = {
  ambient: require('../../public/breathe/breadth.m4a'),
  inhale:  require('../../public/breathe/deepbreadth.m4a'),
  exhale:  require('../../public/breathe/exhale.m4a'),
};

async function createSound(
  asset: any,
  volume: number,
  loop = false,
  restartOnPlay = true, // false for ambient — just resume, let loop handle cycling
): Promise<SoundHandle | null> {
  try {
    if (Platform.OS === 'web') {
      const srcMap: Record<any, string> = {
        [AUDIO_ASSETS.ambient]: '/breathe/breadth.m4a',
        [AUDIO_ASSETS.inhale]:  '/breathe/deepbreadth.m4a',
        [AUDIO_ASSETS.exhale]:  '/breathe/exhale.m4a',
      };
      const src = srcMap[asset] ?? String(asset);
      const el = new (window as any).Audio(src) as HTMLAudioElement;
      el.volume = volume;
      el.loop = loop;
      return {
        play:   () => { if (restartOnPlay) el.currentTime = 0; el.play().catch(() => {}); },
        resume: () => { el.play().catch(() => {}); },
        pause:  () => { el.pause(); },
        unload: () => { el.pause(); el.src = ''; },
      };
    }

    // expo-audio SDK 56
    const { createAudioPlayer, setAudioModeAsync } = require('expo-audio');
    await setAudioModeAsync({ playsInSilentMode: true, shouldDuckAndroid: true });
    const p = createAudioPlayer(asset);
    p.volume = volume;
    p.loop = loop;
    return {
      play:   () => { if (restartOnPlay) { p.seekTo(0).then(() => p.play()).catch(() => p.play()); } else { p.play(); } },
      resume: () => { p.play(); },
      pause:  () => { p.pause(); },
      unload: () => { try { p.pause(); p.remove(); } catch {} },
    };
  } catch {
    return null;
  }
}

const { width: SW } = Dimensions.get('window');

// ─── types ────────────────────────────────────────────────────────────────────

type Phase = 'inhale' | 'hold' | 'exhale' | 'rest';

interface PhaseStep {
  name: Phase;
  duration: number;
  text: string;
}

interface BreathPattern {
  label: string;
  tagline: string;
  color: string;
  phases: PhaseStep[];
  totalMinutes: number;
}

// ─── patterns ─────────────────────────────────────────────────────────────────

const PATTERNS: Record<string, BreathPattern> = {
  anxiety: {
    label: 'Anxiety',
    tagline: 'Calm your nervous system',
    color: '#7C6FAC',
    totalMinutes: 2,
    phases: [
      { name: 'inhale', duration: 4, text: 'Breathe in' },
      { name: 'exhale', duration: 6, text: 'Breathe out slowly' },
    ],
  },
  anger: {
    label: 'Anger',
    tagline: 'Cool the fire within',
    color: '#A0688A',
    totalMinutes: 3,
    phases: [
      { name: 'inhale', duration: 4, text: 'Breathe in deep' },
      { name: 'exhale', duration: 8, text: 'Release it all out' },
    ],
  },
  irritation: {
    label: 'Irritation',
    tagline: 'Soften the edge',
    color: '#5C8A7A',
    totalMinutes: 3,
    phases: [
      { name: 'inhale', duration: 4, text: 'Breathe in' },
      { name: 'exhale', duration: 6, text: 'Let it go' },
    ],
  },
  sadness: {
    label: 'Sadness',
    tagline: 'Let it move through',
    color: '#5A7FA8',
    totalMinutes: 3,
    phases: [
      { name: 'inhale', duration: 4, text: 'Breathe in gently' },
      { name: 'exhale', duration: 5, text: 'Breathe out' },
    ],
  },
  fear: {
    label: 'Fear',
    tagline: 'Ground yourself now',
    color: '#6A8A6A',
    totalMinutes: 3,
    phases: [
      { name: 'inhale', duration: 4, text: 'Breathe in' },
      { name: 'exhale', duration: 4, text: 'Breathe out' },
    ],
  },
  worry: {
    label: 'Worry',
    tagline: "Release what you can't control",
    color: '#8A7A5A',
    totalMinutes: 4,
    phases: [
      { name: 'inhale', duration: 4, text: 'Breathe in' },
      { name: 'exhale', duration: 7, text: 'Release the worry' },
    ],
  },
  envy: {
    label: 'Envy',
    tagline: 'Return to yourself',
    color: '#5A6A8A',
    totalMinutes: 3,
    phases: [
      { name: 'inhale', duration: 4, text: 'Breathe in' },
      { name: 'exhale', duration: 4, text: 'Breathe out' },
    ],
  },
  stress: {
    label: 'Stress',
    tagline: 'Let the tension go',
    color: '#7C6FAC',
    totalMinutes: 3,
    phases: [
      { name: 'inhale', duration: 4, text: 'Breathe in' },
      { name: 'exhale', duration: 6, text: 'Breathe out' },
    ],
  },
};

// ─── wave geometry (web / SVG only) ──────────────────────────────────────────

const AMP_Y = 28;

const PHASE_TARGET: Record<Phase, number> = {
  inhale:  Math.PI / 2,
  hold:    0,
  exhale: -Math.PI / 2,
  rest:    0,
};

function buildWavePath(phase: number): string {
  const parts: string[] = [];
  for (let i = 0; i <= 100; i++) {
    const y = 50 + AMP_Y * Math.sin((2 * Math.PI * i) / 100 + phase);
    parts.push(i === 0 ? `M${i},${y.toFixed(2)}` : `L${i},${y.toFixed(2)}`);
  }
  return parts.join(' ');
}

function circleTopFromPhase(phase: number): number {
  return 50 - AMP_Y * Math.sin(phase);
}

// ─── deterministic stars ──────────────────────────────────────────────────────

const STARS = Array.from({ length: 38 }, (_, i) => ({
  x: (i * 173 + 53) % 100,
  y: (i * 97  + 11) % 75,
  r: 0.6 + (i % 4) * 0.45,
  op: 0.18 + (i % 5) * 0.12,
}));

// ─── component ────────────────────────────────────────────────────────────────

export default function BreatheSession() {
  const { emotion } = useLocalSearchParams<{ emotion: string }>();
  const router = useRouter();
  const pattern = PATTERNS[emotion ?? 'anxiety'] ?? PATTERNS.anxiety;

  const [phaseIdx, setPhaseIdx] = useState(0);
  const [countdown, setCountdown] = useState(pattern.phases[0].duration);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const [wavePath, setWavePath] = useState(() => buildWavePath(0));
  const [circleTopPct, setCircleTopPct] = useState(50);

  const phaseSpring = useRef(new Animated.Value(0)).current;

  const circleScale = phaseSpring.interpolate({
    inputRange: [-Math.PI / 2, 0, Math.PI / 2],
    outputRange: [0.6, 0.85, 1.15],
    extrapolate: 'clamp',
  });

  // Cross-platform sound handles
  const ambientRef = useRef<SoundHandle | null>(null);
  const inhaleRef  = useRef<SoundHandle | null>(null);
  const exhaleRef  = useRef<SoundHandle | null>(null);
  const [soundOn, setSoundOn]           = useState(true);
  const [vibrationOn, setVibrationOn]   = useState(false);
  const [voiceOn, setVoiceOn]           = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const voiceCacheRef = useRef<Record<string, string>>({});
  const soundOnRef    = useRef(true);

  const GUIDE_PHRASES: Record<Phase, string> = {
    inhale: 'Take a deep breath in',
    hold:   'Hold your breath',
    exhale: 'Breathe out slowly',
    rest:   'Rest and relax',
  };

  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef      = useRef(0);
  const phaseIdxRef     = useRef(0);
  const countdownRef    = useRef(pattern.phases[0].duration);
  const skipFirstCueRef = useRef(false);

  const totalSeconds = pattern.totalMinutes * 60;
  const currentPhase = pattern.phases[phaseIdx];
  const timeLeft     = totalSeconds - elapsed;
  const timeLeftStr  = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`;

  // ── SVG wave listener ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!SvgLib) return;
    const id = phaseSpring.addListener(({ value }) => {
      setWavePath(buildWavePath(value));
      setCircleTopPct(circleTopFromPhase(value));
    });
    return () => phaseSpring.removeListener(id);
  }, []);

  // ── Load ambient immediately on mount; start playing right away ──────────
  useEffect(() => {
    let cancelled = false;
    // ambient: loop=true, restartOnPlay=false so resume never seeks to 0
    createSound(AUDIO_ASSETS.ambient, 0.45, true, false).then((s) => {
      if (cancelled) { s?.unload(); return; }
      ambientRef.current = s;
      if (soundOnRef.current) s?.play();
    });
    return () => {
      cancelled = true;
      ambientRef.current?.unload();
      ambientRef.current = null;
      inhaleRef.current?.unload();
      inhaleRef.current = null;
      exhaleRef.current?.unload();
      exhaleRef.current = null;
    };
  }, []);

  // ── Sound toggle — pause/resume ambient without seeking ──────────────────
  useEffect(() => {
    soundOnRef.current = soundOn;
    if (!ambientRef.current) return;
    if (soundOn) ambientRef.current.resume();
    else ambientRef.current.pause();
  }, [soundOn]);

  useEffect(() => { if (done) ambientRef.current?.pause(); }, [done]);

  // ── Spring animation ──────────────────────────────────────────────────────
  const goToPhase = useCallback((phase: Phase) => {
    Animated.spring(phaseSpring, {
      toValue: PHASE_TARGET[phase],
      stiffness: 12,
      damping: 11,
      useNativeDriver: false,
    }).start();
  }, [phaseSpring]);

  // ── Breath cue + vibration on phase change ───────────────────────────────
  const vibrationOnRef = useRef(false);
  useEffect(() => { vibrationOnRef.current = vibrationOn; }, [vibrationOn]);

  useEffect(() => {
    if (!running) return;
    const name = currentPhase.name;
    if (vibrationOnRef.current) Vibration.vibrate(120);
    if (name === 'inhale') {
      if (skipFirstCueRef.current) { skipFirstCueRef.current = false; return; }
      exhaleRef.current?.pause();
      inhaleRef.current?.play();
    } else if (name === 'exhale') {
      inhaleRef.current?.pause();
      exhaleRef.current?.play();
    }
  }, [phaseIdx, running]);

  // ── Main timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);

      if (elapsedRef.current >= totalSeconds) {
        clearInterval(timerRef.current!);
        setRunning(false);
        setDone(true);
        Animated.spring(phaseSpring, { toValue: 0, stiffness: 12, damping: 11, useNativeDriver: false }).start();
        return;
      }

      const cur = countdownRef.current;
      if (cur <= 1) {
        const next = (phaseIdxRef.current + 1) % pattern.phases.length;
        phaseIdxRef.current = next;
        const dur = pattern.phases[next].duration;
        countdownRef.current = dur;
        setPhaseIdx(next);
        setCountdown(dur);
        goToPhase(pattern.phases[next].name);
      } else {
        // Pre-cue inhale 2s before exhale ends
        if (cur === 2) {
          const ni = (phaseIdxRef.current + 1) % pattern.phases.length;
          if (pattern.phases[ni].name === 'inhale') {
            inhaleRef.current?.play();
            skipFirstCueRef.current = true;
          }
        }
        countdownRef.current = cur - 1;
        setCountdown(cur - 1);
      }
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [running]);

  // ── Start ─────────────────────────────────────────────────────────────────
  const start = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    phaseIdxRef.current  = 0;
    elapsedRef.current   = 0;
    countdownRef.current = pattern.phases[0].duration;
    setPhaseIdx(0);
    setCountdown(pattern.phases[0].duration);
    setElapsed(0);
    setDone(false);
    goToPhase(pattern.phases[0].name);

    // Load cue sounds fresh each session (ensures audio context is unlocked inside user gesture)
    inhaleRef.current?.unload();
    exhaleRef.current?.unload();
    const [inhale, exhale] = await Promise.all([
      createSound(AUDIO_ASSETS.inhale, 0.85),
      createSound(AUDIO_ASSETS.exhale, 0.85),
    ]);
    inhaleRef.current = inhale;
    exhaleRef.current = exhale;
    skipFirstCueRef.current = false;

    setRunning(true);
  };

  // ── Voice guide toggle (web TTS only) ────────────────────────────────────
  const toggleVoice = async () => {
    setVoiceOn((v) => !v);
    if (voiceOn) return;
    if (Platform.OS !== 'web') return;

    setVoiceLoading(true);
    const phrases = [...new Set(pattern.phases.map((p) => GUIDE_PHRASES[p.name]))];
    await Promise.all(phrases.map(async (text) => {
      if (voiceCacheRef.current[text]) return;
      try {
        const res = await fetch('https://echo-yg4t.onrender.com/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: 'Zephyr' }),
        });
        if (res.ok) {
          const blob = await res.blob();
          voiceCacheRef.current[text] = URL.createObjectURL(blob);
        }
      } catch {}
    }));
    setVoiceLoading(false);
  };

  useEffect(() => {
    return () => {
      Object.values(voiceCacheRef.current).forEach((u) => {
        try { URL.revokeObjectURL(u); } catch {}
      });
    };
  }, []);

  // ─── render ───────────────────────────────────────────────────────────────

  const iconColor      = (active: boolean) => active ? pattern.color : '#B0B8C8';
  const iconBtnActive  = { backgroundColor: pattern.color + '18', borderColor: pattern.color + '50' };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color="#555" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          {running && !done && (
            <Text style={styles.timerText}>{timeLeftStr}</Text>
          )}
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.pill, { backgroundColor: pattern.color + '18' }]}>
            <Ionicons name="timer-outline" size={13} color={pattern.color} />
            <Text style={[styles.pillText, { color: pattern.color }]}>{pattern.totalMinutes} min</Text>
          </View>
          <Text style={styles.emotionLabel}>{pattern.label}</Text>
          <Text style={styles.tagline}>{pattern.tagline}</Text>
        </View>

        {/* Animation area */}
        <View style={styles.waveArea}>
          {SvgLib ? (
            <>
              <SvgLib.Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
                <SvgLib.Path
                  d={wavePath}
                  stroke={pattern.color}
                  strokeWidth="0.6"
                  fill="none"
                  opacity={running ? 0.55 : 0.2}
                  strokeLinecap="round"
                />
              </SvgLib.Svg>
              <View style={[styles.orbWrap, { top: `${circleTopPct}%` as any }]}>
                <View style={[styles.orb, { borderColor: pattern.color, backgroundColor: pattern.color + '12', shadowColor: pattern.color, opacity: running ? 1 : 0.4 }]} />
              </View>
            </>
          ) : (
            <View style={styles.nativeCircleWrap}>
              <Animated.View style={[styles.nativeRing, styles.nativeRingOuter, { borderColor: pattern.color + '30', transform: [{ scale: circleScale }] }]} />
              <Animated.View style={[styles.nativeRing, styles.nativeRingMid,   { borderColor: pattern.color + '55', transform: [{ scale: circleScale }] }]} />
              <Animated.View style={[styles.nativeRing, styles.nativeRingInner, { borderColor: pattern.color,       transform: [{ scale: circleScale }] }]} />
            </View>
          )}

          {running && !done && (
            <View style={styles.phaseTextWrap} pointerEvents="none">
              <Text style={[styles.phaseText, { color: '#1A1A2E' }]}>{currentPhase.text}</Text>
              <Text style={[styles.countdownText, { color: pattern.color }]}>{countdown}</Text>
            </View>
          )}

          {done && (
            <View style={styles.doneWrap}>
              <View style={[styles.doneCheck, { backgroundColor: pattern.color + '18', borderColor: pattern.color + '40' }]}>
                <Ionicons name="checkmark" size={36} color={pattern.color} />
              </View>
              <Text style={styles.doneMark}>Session complete</Text>
              <TouchableOpacity
                style={[styles.doneBtn, { backgroundColor: pattern.color, borderColor: pattern.color }]}
                onPress={() => router.back()}
                activeOpacity={0.8}
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Bottom controls */}
        <View style={styles.bottom}>
          {running && !done && (
            <View style={styles.phaseHintRow}>
              <Ionicons
                name={currentPhase.name === 'inhale' ? 'arrow-up' : currentPhase.name === 'exhale' ? 'arrow-down' : 'remove'}
                size={14}
                color="#9AA5B4"
              />
              <Text style={styles.phaseHint}>
                {currentPhase.name === 'inhale' ? 'breathe in through your nose'
                 : currentPhase.name === 'exhale' ? 'breathe out through your mouth'
                 : currentPhase.name === 'hold' ? 'hold gently' : 'rest'}
              </Text>
            </View>
          )}

          {!running && !done && (
            <TouchableOpacity
              style={[styles.startBtn, { backgroundColor: pattern.color }]}
              onPress={start}
              activeOpacity={0.85}
            >
              <Ionicons name="play" size={16} color="#fff" />
              <Text style={styles.startBtnText}>Start · {pattern.totalMinutes} min</Text>
            </TouchableOpacity>
          )}

          <View style={styles.iconBar}>
            <TouchableOpacity
              style={[styles.iconBtn, voiceOn ? iconBtnActive : styles.iconBtnOff]}
              onPress={toggleVoice}
              activeOpacity={0.8}
            >
              {voiceLoading
                ? <View style={[styles.spinner, { borderColor: pattern.color }]} />
                : <Ionicons name={voiceOn ? 'mic' : 'mic-outline'} size={22} color={iconColor(voiceOn)} />
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.iconBtn, soundOn ? iconBtnActive : styles.iconBtnOff]}
              onPress={() => setSoundOn((v) => !v)}
              activeOpacity={0.8}
            >
              <Ionicons name={soundOn ? 'musical-notes' : 'musical-notes-outline'} size={22} color={iconColor(soundOn)} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.iconBtn, vibrationOn ? iconBtnActive : styles.iconBtnOff]}
              onPress={() => { setVibrationOn((v) => !v); Vibration.vibrate(80); }}
              activeOpacity={0.8}
            >
              <Ionicons name={vibrationOn ? 'phone-portrait' : 'phone-portrait-outline'} size={22} color={iconColor(vibrationOn)} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const ORB = 48;
const RING_OUTER = Math.min(SW * 0.72, 300);
const RING_MID   = RING_OUTER * 0.64;
const RING_INNER = RING_OUTER * 0.36;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F8FC' },
  safe: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },

  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#EDEEF2',
  },
  backText: { fontSize: 14, color: '#555', fontWeight: '500' },

  timerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9AA5B4',
    letterSpacing: 0.5,
  },

  header: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 24,
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 4,
  },
  pillText: { fontSize: 12, fontWeight: '600' },
  emotionLabel: { fontSize: 34, fontWeight: '700', color: '#1A1A2E', letterSpacing: -0.5 },
  tagline:      { fontSize: 13, color: '#8896A5', textAlign: 'center' },

  waveArea: { flex: 1, position: 'relative' },

  orbWrap: {
    position: 'absolute',
    left: '50%' as any,
    marginLeft: -(ORB / 2),
    marginTop: -(ORB / 2),
    width: ORB,
    height: ORB,
    zIndex: 15,
  },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },

  nativeCircleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  nativeRing: { position: 'absolute', borderRadius: 9999, borderWidth: 1.5, backgroundColor: 'transparent' },
  nativeRingOuter: { width: RING_OUTER, height: RING_OUTER },
  nativeRingMid:   { width: RING_MID,   height: RING_MID   },
  nativeRingInner: { width: RING_INNER, height: RING_INNER, borderWidth: 2 },

  phaseTextWrap: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  phaseText:     { fontSize: 26, fontWeight: '600', marginBottom: 4 },
  countdownText: { fontSize: 17, fontWeight: '700' },

  doneWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  doneCheck: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  doneMark:    { fontSize: 20, fontWeight: '600', color: '#1A1A2E' },
  doneBtn:     { paddingHorizontal: 32, paddingVertical: 13, borderRadius: 24 },
  doneBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  bottom: {
    alignItems: 'center',
    paddingBottom: 36,
    paddingTop: 8,
    gap: 14,
  },

  phaseHintRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  phaseHint:    { fontSize: 13, color: '#9AA5B4', letterSpacing: 0.2 },

  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 36,
    paddingVertical: 15,
    borderRadius: 28,
    marginBottom: 4,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  startBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  iconBar:    { flexDirection: 'row', gap: 12 },
  iconBtn: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  iconBtnOff: { backgroundColor: '#EDEEF2', borderColor: '#E2E4EA' },
  spinner: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2,
    borderTopColor: 'transparent',
  },
});
