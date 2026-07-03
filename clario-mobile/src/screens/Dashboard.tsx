/**
 * Dashboard — cream/cocoa, easy-to-use layout.
 * Hero: large centered mic orb with pulsing ring.
 * Below: quick stats row, mood trend, recent sessions.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Easing,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Mic, Flame, TrendingUp, Clock, Smile,
  ChevronRight, Lock, Sparkles, BookOpen, BarChart2,
  MessageCircle, User, Heart, Search, Leaf, Wind, Lightbulb,
} from 'lucide-react-native';
import { listSessions, startVoiceSession, generateSessionReport, type SessionDetailData } from '../lib/api';
import { hasFreeSessionBeenUsed, markFreeSessionUsed } from '../lib/freeSession';
import { supabase } from '../lib/supabase';
import { useAccess } from '../hooks/useAccess';
import { useAuth } from '../contexts/AuthContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors, fonts, cardShadow } from '../lib/theme';
import { SoftGradient } from '../components/SoftGradient';
import SessionReportModal from './SessionReportModal';
import VoiceRecordingOverlay from './VoiceRecordingOverlay';
import { Image } from 'expo-image';
import { avatarUrl } from '../lib/cloudinary';

// ─── persona / voice / language config ────────────────────────────────────────
const PERSONAS = [
  { id: 'vanilla',          name: 'Vanilla',          Icon: MessageCircle, desc: 'Friendly, balanced journaling partner' },
  { id: 'chaotic_friend',   name: 'Chaotic Friend',   Icon: Flame,         desc: 'Unfiltered and will call you out (with love)' },
  { id: 'older_sibling',    name: 'Older Sibling',    Icon: Heart,         desc: 'Caring, protective, gently checks you' },
  { id: 'insight_coach',    name: 'Insight Coach',    Icon: Search,        desc: 'Cuts through noise and shows you the pattern' },
  { id: 'calm_observer',    name: 'Calm Observer',    Icon: Leaf,          desc: "Quiet, grounded, sees what you're not saying" },
  { id: 'chill_overthinker',name: 'Chill Overthinker',Icon: Wind,          desc: 'Gets your spirals because they spiral too' },
];

const VOICES = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede'];

const LANGS = [
  { id: 'en', label: 'English' },
  { id: 'ne', label: 'Nepali' },
];

// ─── helpers ──────────────────────────────────────────────────────────────────
function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatDate(iso: string) {
  try { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)); }
  catch { return iso.slice(0, 10); }
}
function sessionSummary(s: SessionDetailData) {
  const r = s.report;
  if (!r) return 'No summary yet.';
  if (r.session_overview?.length) return r.session_overview[0];
  return r.one_word_summary ?? 'Session recorded';
}
function computeStreak(sessions: SessionDetailData[]) {
  if (!sessions.length) return 0;
  const days = new Set(sessions.map((s) => localDateKey(new Date(s.created_at))));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i <= 365; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    if (days.has(localDateKey(d))) streak++;
    else if (i > 0) break;
  }
  return streak;
}

// ─── Pulse ring around mic orb ────────────────────────────────────────────────
function PulseRing({ active }: { active: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (!active) return;
    const anim = Animated.loop(
      Animated.parallel([
        Animated.timing(scale,   { toValue: 1.55, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,    duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [active]);

  if (!active) return null;
  return (
    <Animated.View style={[styles.pulseRing, { transform: [{ scale }], opacity }]} />
  );
}

// ─── Mini mood bars ───────────────────────────────────────────────────────────
function MoodBar({ label, value, isToday }: { label: string; value: number | null; isToday: boolean }) {
  const h = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(h, { toValue: value != null ? Math.max(4, (value / 10) * 56) : 0, duration: 700, useNativeDriver: false }).start();
  }, [value]);
  return (
    <View style={barStyles.col}>
      <View style={barStyles.bg}>
        <Animated.View style={[barStyles.fill, { height: h, backgroundColor: isToday ? colors.lavenderDeep : colors.lavender }]} />
      </View>
      <Text style={[barStyles.lbl, isToday && { color: colors.cocoa, fontWeight: '700' }]}>{label}</Text>
    </View>
  );
}
const barStyles = StyleSheet.create({
  col:  { alignItems: 'center', flex: 1 },
  bg:   { width: 16, height: 56, backgroundColor: colors.border, borderRadius: 8, justifyContent: 'flex-end', overflow: 'hidden', marginBottom: 5 },
  fill: { width: '100%', borderRadius: 8 },
  lbl:  { fontSize: 9, color: colors.softGray },
});

// ─── main ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { isPremium, loading: accessLoading } = useAccess();
  const { displayName, user } = useAuth();
  const router = useRouter();
  const { autoStart } = useLocalSearchParams<{ autoStart?: string }>();

  const [sessions, setSessions]       = useState<SessionDetailData[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [selected, setSelected]       = useState<SessionDetailData | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportPhase, setReportPhase] = useState<'saving' | 'generating'>('saving');
  const [recording, setRecording]     = useState(false);
  const [sessionId, setSessionId]     = useState<string | null>(null);
  const [token, setToken]             = useState<string | null>(null);
  const [starting, setStarting]       = useState(false);
  const [startHint, setStartHint]     = useState('');
  const [showPersonaSheet, setShowPersonaSheet] = useState(false);
  const [selectedPersona, setSelectedPersona]   = useState(PERSONAS[0].id);
  const [selectedVoice, setSelectedVoice]       = useState(VOICES[0]);
  const [selectedLang, setSelectedLang]         = useState('en');
  const [sessionPersona, setSessionPersona]     = useState('vanilla');
  const [sessionVoice, setSessionVoice]         = useState('Zephyr');
  const [sessionLang, setSessionLang]           = useState('en');

  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(14)).current;
  const [freeUsed, setFreeUsed] = useState(true); // default locked until checked
  useEffect(() => {
    hasFreeSessionBeenUsed().then(setFreeUsed);
  }, []);
  const voiceLocked = accessLoading || (!isPremium && freeUsed);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
    let cancelled = false;
    (async () => {
      try { const rows = await listSessions(); if (!cancelled) setSessions(rows); }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-start voice call when navigated from Night Summary
  useEffect(() => {
    if (autoStart === 'true' && !accessLoading && (isPremium || !freeUsed)) {
      startRecording();
    }
  }, [autoStart, accessLoading, isPremium]);

  const streak = useMemo(() => computeStreak(sessions), [sessions]);
  const avgMood = useMemo(() => {
    const moods = sessions.map((s) => s.report?.average_mood_rating).filter((m): m is number => m != null);
    return moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
  }, [sessions]);

  const moodTrend = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = localDateKey(d);
    const moods = sessions.filter((s) => localDateKey(new Date(s.created_at)) === key && s.report)
      .map((s) => s.report?.average_mood_rating).filter((m): m is number => m != null);
    return {
      label: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d).slice(0, 1),
      value: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null,
      isToday: i === 6,
    };
  }), [sessions]);

  const latestSession = sessions[0] ?? null;
  const hasMoodData   = moodTrend.some((d) => d.value != null);

  const startRecording = async (persona = selectedPersona, voice = selectedVoice, lang = selectedLang) => {
    if (starting) return;
    setShowPersonaSheet(false);
    setStarting(true);
    setStartHint('checking connection…');
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s?.access_token) throw new Error('Not signed in — please sign out and back in.');
      setToken(s.access_token);

      setStartHint('starting server…');
      try {
        await Promise.race([
          fetch('https://echo-yg4t.onrender.com/', { method: 'GET' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000)),
        ]);
      } catch { /* non-fatal */ }

      setStartHint('creating session…');
      const vs = await startVoiceSession();
      setSessionId(vs.session_id);
      setSessionPersona(persona);
      setSessionVoice(voice);
      setSessionLang(lang);

      if (!isPremium) {
        await markFreeSessionUsed();
        setFreeUsed(true);
      }
      setStarting(false);
      setStartHint('');
      setRecording(true);
    } catch (e) {
      setStarting(false);
      setStartHint('');
      Alert.alert('Could not start session', e instanceof Error ? e.message : 'Please check your connection and try again.');
    }
  };

  const endRecording = async () => {
    setRecording(false);
    const sid = sessionId;
    setSessionId(null);
    setToken(null);
    if (!sid) return;

    setGeneratingReport(true);
    setReportPhase('saving');
    try {
      // The backend WebSocket saves the conversation transcript in its `finally` block,
      // which runs asynchronously after the connection closes. Wait 7 s so those DB
      // writes complete before we ask for the report.
      await new Promise<void>(r => setTimeout(r, 7000));

      setReportPhase('generating');
      let updated: Awaited<ReturnType<typeof generateSessionReport>> | null = null;
      try {
        updated = await generateSessionReport(sid);
      } catch {
        // First attempt failed — wait another 5 s and retry once (covers slow Render cold-starts)
        await new Promise<void>(r => setTimeout(r, 5000));
        try { updated = await generateSessionReport(sid); } catch { /* best-effort */ }
      }
      const rows = await listSessions();
      setSessions(rows);
      const fresh = rows.find(r => r.session_id === sid) ?? updated ?? undefined;
      if (fresh) setSelected(fresh);
    } catch {
      // session is still saved even if report fails
    } finally {
      setGeneratingReport(false);
    }
  };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'good morning';
    if (h < 17) return 'good afternoon';
    return 'good evening';
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <Animated.View style={[styles.header, { opacity: fade, transform: [{ translateY: slide }] }]}>
          {/* Profile row — avatar + Hey, Name at the very top */}
          <View style={styles.profileRow}>
            {user?.user_metadata?.avatar_url ? (
              <Image
                source={{ uri: avatarUrl(user.user_metadata.avatar_url, 80) }}
                style={styles.profileAvatar}
                contentFit="cover"
                transition={300}
              />
            ) : (
              <View style={styles.profileAvatarPlaceholder}>
                <Text style={styles.profileAvatarInitial}>
                  {displayName ? displayName.charAt(0).toUpperCase() : '?'}
                </Text>
              </View>
            )}
            <Text style={styles.profileGreet}>
              Hey, {displayName
                ? displayName.split(' ')[0].charAt(0).toUpperCase() + displayName.split(' ')[0].slice(1).toLowerCase()
                : 'there'}
            </Text>
          </View>

          {/* Page subtitle */}
          <Text style={styles.eyebrow}>{greeting.toUpperCase()}</Text>
          <Text style={styles.subtitle}>your voice reflection space.</Text>
        </Animated.View>

        {/* ── Hero mic orb ── */}
        <View style={styles.heroSection}>
          {voiceLocked ? (
            <View style={styles.heroLocked}>
              <View style={styles.orbLocked}>
                <Lock size={32} color={colors.warmGray} strokeWidth={1.6} />
              </View>
              <Text style={styles.heroTitle}>voice journal</Text>
              <Text style={styles.heroSub}>
                {freeUsed
                  ? 'you’ve used your free session — upgrade for unlimited'
                  : 'upgrade to unlock your daily reflection'}
              </Text>
              <TouchableOpacity style={styles.upgradeBtn} onPress={() => router.push('/paywall')} activeOpacity={0.85}>
                <Sparkles size={14} color={colors.cream} strokeWidth={2} />
                <Text style={styles.upgradeBtnText}>unlock premium</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.heroReady}>
              {/* Pulsing orb */}
              <View style={styles.orbWrap}>
                <PulseRing active={!starting} />
                <TouchableOpacity
                  style={[styles.orb, starting && { opacity: 0.7 }]}
                  onPress={() => starting ? undefined : setShowPersonaSheet(true)}
                  activeOpacity={0.82}
                  disabled={starting}
                >
                  {starting
                    ? <ActivityIndicator size="large" color={colors.cream} />
                    : <Mic size={44} color={colors.cream} strokeWidth={1.6} />}
                </TouchableOpacity>
              </View>
              <Text style={styles.heroTitle}>{starting ? startHint : 'start reflection'}</Text>
              <Text style={styles.heroSub}>
                {starting ? 'getting ready…' : 'tap to choose your agent & begin'}
              </Text>
              {/* Quick hints */}
              <View style={styles.hintRow}>
                <View style={styles.hintPill}>
                  <Clock size={11} color={colors.lavenderDeep} strokeWidth={2} />
                  <Text style={styles.hintText}>5–20 min</Text>
                </View>
                <View style={styles.hintPill}>
                  <Sparkles size={11} color={colors.lavenderDeep} strokeWidth={2} />
                  <Text style={styles.hintText}>ai insights</Text>
                </View>
                <View style={styles.hintPill}>
                  <BarChart2 size={11} color={colors.lavenderDeep} strokeWidth={2} />
                  <Text style={styles.hintText}>mood report</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ── Quick stats row ── */}
        <View style={styles.statsRow}>
          {[
            { label: 'streak',   value: streak > 0 ? `${streak}d` : '—', sub: 'days',     color: colors.amberRich, bg: colors.amber },
            { label: 'sessions', value: String(sessions.length || '—'),   sub: 'total',    color: colors.lavenderDeep, bg: colors.lavender },
            { label: 'avg mood', value: avgMood != null ? avgMood.toFixed(1) : '—',        sub: '/10', color: colors.mossRich, bg: colors.sage },
          ].map((stat) => (
            <View key={stat.label} style={[styles.statCard, { backgroundColor: stat.bg + '55', borderColor: stat.bg }]}>
              <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={styles.statSub}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Latest session ── */}
        {latestSession?.report && (
          <TouchableOpacity style={[styles.latestCard, cardShadow]} onPress={() => setSelected(latestSession)} activeOpacity={0.86}>
            <View style={styles.latestHeader}>
              <View>
                <Text style={styles.cardEyebrow}>LATEST REFLECTION</Text>
                <Text style={styles.latestTitle}>{latestSession.report.one_word_summary ?? 'Reflective'}</Text>
              </View>
              <View style={styles.latestDateBadge}>
                <Text style={styles.latestDateText}>{formatDate(latestSession.created_at)}</Text>
              </View>
            </View>

            {/* 3 inline stats */}
            <View style={styles.latestStats}>
              {[
                { label: 'Mood',     val: latestSession.report.average_mood_rating?.toFixed(1) ?? '—', unit: '/10', color: colors.lavenderDeep },
                { label: 'Energy',   val: String(latestSession.report.energy_level ?? '—'),            unit: '/10', color: colors.amberRich },
                { label: 'Duration', val: latestSession.duration_seconds ? String(Math.ceil(latestSession.duration_seconds / 60)) : '—', unit: 'min', color: colors.mossRich },
              ].map((item, i, arr) => (
                <React.Fragment key={item.label}>
                  <View style={styles.latestStatItem}>
                    <Text style={[styles.latestStatVal, { color: item.color }]}>{item.val}<Text style={styles.latestStatUnit}>{item.unit}</Text></Text>
                    <Text style={styles.latestStatLabel}>{item.label}</Text>
                  </View>
                  {i < arr.length - 1 && <View style={styles.statDivider} />}
                </React.Fragment>
              ))}
            </View>

            {latestSession.report.session_overview?.[0] && (
              <Text style={styles.overview} numberOfLines={2}>"{latestSession.report.session_overview[0]}"</Text>
            )}

            <View style={styles.reportLink}>
              <BookOpen size={12} color={colors.lavenderDeep} strokeWidth={2} />
              <Text style={styles.reportLinkText}>view full report</Text>
              <ChevronRight size={12} color={colors.lavenderDeep} strokeWidth={2} />
            </View>
          </TouchableOpacity>
        )}

        {/* ── Mood trend ── */}
        <View style={[styles.card, cardShadow]}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.cardEyebrow}>LAST 7 DAYS</Text>
              <Text style={styles.cardTitle}>mood trend</Text>
            </View>
            <TrendingUp size={18} color={colors.lavenderDeep} strokeWidth={2} />
          </View>
          {loading
            ? <ActivityIndicator color={colors.lavenderDeep} style={{ marginTop: 16 }} />
            : hasMoodData
              ? <View style={styles.barsRow}>{moodTrend.map((d, i) => <MoodBar key={i} label={d.label} value={d.value} isToday={d.isToday} />)}</View>
              : (
                <View style={styles.emptyBox}>
                  <Smile size={24} color={colors.border} strokeWidth={1.5} />
                  <Text style={styles.emptyText}>complete a reflection to see your mood trend</Text>
                </View>
              )
          }
        </View>

        {/* ── Reflection prompts ── */}
        <ReflectionPrompts />

      </ScrollView>

      {/* Generating report banner */}
      {generatingReport && (
        <View style={styles.reportingBanner}>
          <ActivityIndicator size="small" color={colors.cocoa} />
          <Text style={styles.reportingText}>
            {reportPhase === 'saving' ? 'saving your session…' : 'generating your report…'}
          </Text>
        </View>
      )}

      <SessionReportModal
        session={selected!}
        visible={selected !== null}
        onClose={() => setSelected(null)}
        onDeleted={(id) => setSessions(prev => prev.filter(s => s.session_id !== id))}
      />
      <VoiceRecordingOverlay
        visible={recording}
        onEnd={endRecording}
        onRetry={startRecording}
        sessionId={sessionId}
        token={token}
        displayName={displayName ?? undefined}
        persona={sessionPersona}
        voice={sessionVoice}
        lang={sessionLang}
      />
      <PersonaSheet
        visible={showPersonaSheet}
        onClose={() => setShowPersonaSheet(false)}
        onStart={() => startRecording(selectedPersona, selectedVoice, selectedLang)}
        selectedPersona={selectedPersona}
        onPersonaChange={setSelectedPersona}
        selectedVoice={selectedVoice}
        onVoiceChange={setSelectedVoice}
        selectedLang={selectedLang}
        onLangChange={setSelectedLang}
      />
    </SafeAreaView>
  );
}

// ─── ReflectionPrompts ────────────────────────────────────────────────────────
const PROMPTS = [
  { Icon: MessageCircle, color: colors.lavenderDeep, bg: colors.lavender, title: "What's on your mind?",        body: "Something you've been holding in — big or small. Say it out loud." },
  { Icon: TrendingUp,    color: colors.mossRich,     bg: colors.sage,     title: 'What went well today?',       body: 'Even one small win counts. Acknowledge it.' },
  { Icon: Lightbulb,     color: colors.amberRich,    bg: colors.amber,    title: 'What drained your energy?',   body: 'Name what felt heavy. Naming it is the first step to releasing it.' },
  { Icon: Heart,         color: '#B07DAA',            bg: '#F0E6EF',       title: 'Who do you want to show up as tomorrow?', body: 'One intention. Not a list — just one thing.' },
];

function ReflectionPrompts() {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, delay: 200, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fade }}>
      <View style={rpStyles.header}>
        <Text style={rpStyles.eyebrow}>REFLECTION PROMPTS</Text>
        <Text style={rpStyles.title}>what to talk about</Text>
        <Text style={rpStyles.sub}>let these guide your session — no pressure to cover all of them.</Text>
      </View>
      <View style={rpStyles.grid}>
        {PROMPTS.map((p, i) => {
          const PIcon = p.Icon;
          return (
            <View key={i} style={[rpStyles.card, { borderColor: p.bg + 'CC' }]}>
              <View style={[rpStyles.iconWrap, { backgroundColor: p.bg }]}>
                <PIcon size={16} color={p.color} strokeWidth={2.2} />
              </View>
              <Text style={rpStyles.cardTitle}>{p.title}</Text>
              <Text style={rpStyles.cardBody}>{p.body}</Text>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const rpStyles = StyleSheet.create({
  header: { marginBottom: 14 },
  eyebrow: { fontSize: 10, letterSpacing: 3, fontWeight: '700', color: colors.softGray, marginBottom: 4 },
  title: { fontFamily: fonts.serif, fontSize: 20, color: colors.cocoa, marginBottom: 4 },
  sub: { fontSize: 12, color: colors.warmGray, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 32 },
  card: {
    width: '47.5%',
    backgroundColor: colors.paper,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 16,
    gap: 8,
    ...cardShadow,
  },
  iconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: colors.cocoa, lineHeight: 17 },
  cardBody: { fontSize: 11, color: colors.warmGray, lineHeight: 16 },
});

// ─── PersonaSheet ─────────────────────────────────────────────────────────────
function PersonaSheet({
  visible, onClose, onStart,
  selectedPersona, onPersonaChange,
  selectedVoice, onVoiceChange,
  selectedLang, onLangChange,
}: {
  visible: boolean; onClose: () => void; onStart: () => void;
  selectedPersona: string; onPersonaChange: (v: string) => void;
  selectedVoice: string; onVoiceChange: (v: string) => void;
  selectedLang: string; onLangChange: (v: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : 600,
      useNativeDriver: true,
      damping: 22, stiffness: 160,
    }).start();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={pStyles.overlay} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[pStyles.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={pStyles.handle} />
        <Text style={pStyles.sheetTitle}>set up your session</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={pStyles.scrollContent}>

          {/* Agent Persona */}
          <Text style={pStyles.sectionLabel}>AGENT PERSONA</Text>
          <View style={pStyles.personaGrid}>
            {PERSONAS.map((p) => {
              const active = selectedPersona === p.id;
              const PIcon = p.Icon;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[pStyles.personaCard, active && pStyles.personaCardActive]}
                  onPress={() => onPersonaChange(p.id)}
                  activeOpacity={0.78}
                >
                  <View style={[pStyles.personaIconWrap, active && pStyles.personaIconWrapActive]}>
                    <PIcon size={18} color={active ? colors.cream : colors.warmGray} strokeWidth={2} />
                  </View>
                  <Text style={[pStyles.personaName, active && pStyles.personaNameActive]}>{p.name}</Text>
                  <Text style={pStyles.personaDesc} numberOfLines={2}>{p.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Voice */}
          <Text style={[pStyles.sectionLabel, { marginTop: 20 }]}>VOICE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={pStyles.pillRow}>
            {VOICES.map((v) => {
              const active = selectedVoice === v;
              return (
                <TouchableOpacity
                  key={v}
                  style={[pStyles.pill, active && pStyles.pillActive]}
                  onPress={() => onVoiceChange(v)}
                  activeOpacity={0.78}
                >
                  <Text style={[pStyles.pillText, active && pStyles.pillTextActive]}>{v}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Language */}
          <Text style={[pStyles.sectionLabel, { marginTop: 20 }]}>LANGUAGE</Text>
          <View style={pStyles.pillRow}>
            {LANGS.map((l) => {
              const active = selectedLang === l.id;
              return (
                <TouchableOpacity
                  key={l.id}
                  style={[pStyles.pill, active && pStyles.pillActive]}
                  onPress={() => onLangChange(l.id)}
                  activeOpacity={0.78}
                >
                  <Text style={[pStyles.pillText, active && pStyles.pillTextActive]}>{l.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Start button */}
        <TouchableOpacity style={pStyles.startBtn} onPress={onStart} activeOpacity={0.85}>
          <Mic size={18} color={colors.cream} strokeWidth={2} />
          <Text style={pStyles.startBtnText}>Start Session</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const pStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.cream,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 12, paddingHorizontal: 20,
    maxHeight: '88%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 20,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontFamily: fonts.serif, fontSize: 22, color: colors.cocoa, marginBottom: 20, textAlign: 'center' },
  scrollContent: { paddingBottom: 8 },

  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2.5, color: colors.warmGray, marginBottom: 10 },

  personaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  personaCard: {
    width: '47%', backgroundColor: colors.paper,
    borderRadius: 16, borderWidth: 1.5, borderColor: colors.border,
    padding: 14, gap: 4,
  },
  personaCardActive: { borderColor: colors.cocoa, backgroundColor: colors.cocoa + '0A' },
  personaIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.cream,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  personaIconWrapActive: { backgroundColor: colors.cocoa, borderColor: colors.cocoa },
  personaName: { fontSize: 13, fontWeight: '700', color: colors.warmGray },
  personaNameActive: { color: colors.cocoa },
  personaDesc: { fontSize: 11, color: colors.softGray, lineHeight: 15 },

  pillRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 999, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.paper,
  },
  pillActive: { borderColor: colors.cocoa, backgroundColor: colors.cocoa },
  pillText:   { fontSize: 13, fontWeight: '600', color: colors.warmGray },
  pillTextActive: { color: colors.cream },

  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.cocoa, borderRadius: 18,
    paddingVertical: 16, marginTop: 20,
    shadowColor: colors.cocoa, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 8,
  },
  startBtnText: { fontSize: 16, fontWeight: '700', color: colors.cream },
});

// ─── styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.cream },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60, paddingTop: 8 },

  // header
  header:   { marginBottom: 28 },
  eyebrow:  { fontSize: 10, letterSpacing: 3, fontWeight: '700', color: colors.softGray, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.warmGray, marginTop: 3 },

  // profile row (top of page)
  profileRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, marginBottom: 14,
  },
  profileAvatar: {
    width: 46, height: 46, borderRadius: 23,
    borderWidth: 2, borderColor: colors.border,
  },
  profileAvatarPlaceholder: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.amber,
    borderWidth: 2, borderColor: colors.amberRich + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarInitial: {
    fontFamily: fonts.serif, fontSize: 20, color: colors.cocoa,
  },
  profileGreet: {
    fontFamily: fonts.serif, fontSize: 22,
    color: colors.cocoa, letterSpacing: -0.3,
  },

  // hero
  heroSection: {
    backgroundColor: colors.paper,
    borderRadius: 28, borderWidth: 1, borderColor: colors.border,
    marginBottom: 14, overflow: 'hidden',
    ...cardShadow,
  },
  heroReady:  { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  heroLocked: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },

  orbWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  orb: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: colors.lavenderDeep,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.lavenderDeep, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 8,
  },
  orbLocked: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: colors.cream, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  pulseRing: {
    position: 'absolute',
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 2, borderColor: colors.lavenderDeep,
  },

  heroTitle: { fontFamily: fonts.serif, fontSize: 24, color: colors.cocoa, marginBottom: 6, textAlign: 'center' },
  heroSub:   { fontSize: 13, color: colors.warmGray, textAlign: 'center', lineHeight: 19, marginBottom: 16 },

  hintRow:  { flexDirection: 'row', gap: 8 },
  hintPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.lavender + '44', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  hintText: { fontSize: 11, color: colors.lavenderDeep, fontWeight: '600' },

  upgradeBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.cocoa, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 11 },
  upgradeBtnText: { color: colors.cream, fontSize: 14, fontWeight: '700' },

  // quick stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1, borderRadius: 18, borderWidth: 1,
    paddingVertical: 14, alignItems: 'center', gap: 3,
  },
  statValue: { fontFamily: fonts.serif, fontSize: 22, letterSpacing: -0.5 },
  statSub:   { fontSize: 10, color: colors.warmGray, fontWeight: '600' },

  // latest card
  latestCard: {
    backgroundColor: colors.paper,
    borderRadius: 22, borderWidth: 1, borderColor: colors.border,
    padding: 20, marginBottom: 14,
  },
  latestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  cardEyebrow:  { fontSize: 10, letterSpacing: 2.5, fontWeight: '700', color: colors.softGray, marginBottom: 3 },
  latestTitle:  { fontFamily: fonts.serif, fontSize: 22, color: colors.cocoa },
  latestDateBadge: { backgroundColor: colors.cream, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.border },
  latestDateText:  { fontSize: 10, color: colors.warmGray },

  latestStats:    { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cream, borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  latestStatItem: { flex: 1, alignItems: 'center' },
  latestStatVal:  { fontFamily: fonts.serif, fontSize: 20 },
  latestStatUnit: { fontSize: 11, color: colors.warmGray, fontFamily: fonts.sans },
  latestStatLabel:{ fontSize: 9, letterSpacing: 1.5, color: colors.softGray, marginTop: 2 },
  statDivider:    { width: 1, height: 32, backgroundColor: colors.border },

  overview:   { fontSize: 13, color: colors.warmGray, fontStyle: 'italic', lineHeight: 19, marginBottom: 12 },
  reportLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reportLinkText: { fontSize: 12, color: colors.lavenderDeep, fontWeight: '600' },

  // mood card
  card: { backgroundColor: colors.paper, borderRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 20, marginBottom: 14 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  cardTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.cocoa },
  barsRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 4 },

  // empty state (mood card)
  emptyBox:  { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyText: { fontSize: 12, color: colors.softGray, textAlign: 'center' },
  reportingBanner: {
    position: 'absolute',
    bottom: 40,
    left: 24,
    right: 24,
    backgroundColor: colors.cream,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportingText: { fontSize: 14, color: colors.cocoa, fontWeight: '500' },
});
