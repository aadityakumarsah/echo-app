/**
 * Daily Check hub — 3 step cards.
 * Cream light theme with per-step dynamic gradients (echo-app aesthetic).
 * Completion state persisted in AsyncStorage keyed by today's date.
 */
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import {
  markCheckStep,
  getDailyChecksToday,
  getDailyChecksHistory,
  localDateString,
  type DailyStep,
} from '../lib/api';
import { Sunrise, Activity, Moon, Check, ChevronRight, Sprout, Flame, Coffee, Flower2, Sparkles, Leaf, Trees, Bird, Cherry, Flower } from 'lucide-react-native';
import { colors, fonts, cardShadow, gradients } from '../lib/theme';
import { SoftGradient } from '../components/SoftGradient';
import { GardenScene } from '../components/GardenScene';
import { Image } from 'expo-image';
import { useAuth } from '../contexts/AuthContext';
import { avatarUrl } from '../lib/cloudinary';

// ─── DEV override — set to null for production ───────────────────────────────
const DEV_DAY: number | null = 65;

// ─── milestones (mirrors echo-app NC_MAJOR_MILESTONES) ───────────────────────
const MILESTONES = [
  { successDay: 1,  kind: 'teapot',    label: 'teapot',        Icon: Coffee  },
  { successDay: 4,  kind: 'floral',    label: 'floral ornament', Icon: Flower2 },
  { successDay: 7,  kind: 'bee',       label: 'honey bee',     Icon: Sparkles },
  { successDay: 12, kind: 'autumn',    label: 'autumn leaves', Icon: Leaf    },
  { successDay: 21, kind: 'tree',      label: 'tree',          Icon: Trees   },
  { successDay: 30, kind: 'birds',     label: 'birds',         Icon: Bird    },
  { successDay: 45, kind: 'berrySprig',label: 'berry sprig',   Icon: Cherry  },
  { successDay: 60, kind: 'bgBees',    label: 'garden bees',   Icon: Flower  },
  { successDay: 90, kind: 'frog',      label: 'frog',          Icon: Sparkles},
] as const;

function nextMilestone(dayCount: number) {
  return MILESTONES.find((m) => m.successDay > dayCount) ?? null;
}

function milestoneProgress(dayCount: number) {
  const next = nextMilestone(dayCount);
  if (!next) return { pct: 1, daysToGo: 0, next: null };
  const idx  = MILESTONES.findIndex((m) => m.successDay === next.successDay);
  const prev = idx > 0 ? MILESTONES[idx - 1].successDay : 0;
  const span = Math.max(1, next.successDay - prev);
  const done = Math.max(0, Math.min(span, dayCount - prev));
  return { pct: done / span, daysToGo: next.successDay - dayCount, next };
}

// ─── persistence ──────────────────────────────────────────────────────────────
// AsyncStorage is the optimistic local cache; Supabase (via API) is the source
// of truth for streaks and historical data across devices/reinstalls.

const todayKey = () => `daily-check-${localDateString()}`;

function dateKeyFor(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `daily-check-${y}-${m}-${day}`;
}

/** Read today's completion from local cache (fast, used for optimistic UI). */
async function loadDone(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(todayKey());
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Write one step to local cache so the UI updates instantly on return. */
async function persistLocal(key: string): Promise<void> {
  const current = await loadDone();
  current[key] = true;
  await AsyncStorage.setItem(todayKey(), JSON.stringify(current));
}

/**
 * Sync today's state from Supabase.
 * Returns { done, streak, week } — all three pieces the screen needs.
 * Falls back to local cache if the network call fails.
 */
async function syncFromApi(): Promise<{
  done: Record<string, boolean>;
  streak: number;
  week: { label: string; full: boolean }[];
}> {
  try {
    const [today, history] = await Promise.all([
      getDailyChecksToday(),
      getDailyChecksHistory(7),
    ]);

    const done: Record<string, boolean> = {
      morning: today.morning,
      refill:  today.refill,
      night:   today.night,
    };

    // Keep local cache in sync so it stays consistent on offline reads
    await AsyncStorage.setItem(todayKey(), JSON.stringify(done));

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    const week = history.map((h, i) => ({
      label: days[i].toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
      full:  h.day_complete,
    }));

    return { done, streak: today.current_streak, week };
  } catch {
    // Network unavailable — fall back to local cache
    const done = await loadDone();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    const week = await Promise.all(days.map(async (d) => {
      try {
        const raw = await AsyncStorage.getItem(dateKeyFor(d));
        const data = raw ? JSON.parse(raw) : {};
        return {
          label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
          full: Object.values(data).filter(Boolean).length === 3,
        };
      } catch {
        return { label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1), full: false };
      }
    }));
    // Compute local streak as fallback
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      try {
        const raw = await AsyncStorage.getItem(dateKeyFor(d));
        const data = raw ? JSON.parse(raw) : {};
        if (Object.values(data).filter(Boolean).length === 3) streak++;
        else break;
      } catch { break; }
    }
    return { done, streak, week };
  }
}

/**
 * Called by each check screen when a step is finished.
 * 1. Updates AsyncStorage immediately (optimistic — instant return from nav).
 * 2. Calls the backend in the background to persist to Supabase and update streak.
 */
export async function markStepDone(key: string): Promise<void> {
  await persistLocal(key);
  // Fire-and-forget — the DailyCheck hub will sync on next render
  markCheckStep(key as DailyStep).catch(() => {/* network error — local cache still updated */});
}

// ─── step data ────────────────────────────────────────────────────────────────
const STEPS = [
  {
    key: 'morning',
    number: '01',
    title: 'Morning Energy',
    subtitle: 'Hydrate to activate',
    description: 'Drink 2 glasses of water to wake your body up.',
    Icon: Sunrise,
    accent: colors.amberRich,
    gradient: gradients.morning,
    path: '/daily-check-morning' as const,
  },
  {
    key: 'refill',
    number: '02',
    title: 'Day Refill',
    subtitle: 'Move to reset',
    description: 'Squats tracked by pose detection — reps grow 10→15→20→25 each day.',
    Icon: Activity,
    accent: colors.mossRich,
    gradient: gradients.refill,
    path: '/daily-check-refill' as const,
  },
  {
    key: 'night',
    number: '03',
    title: 'Night Summary',
    subtitle: 'Release the day',
    description: 'Speak your whole day to your voice agent. Nothing held back.',
    Icon: Moon,
    accent: colors.lavenderDeep,
    gradient: gradients.night,
    path: '/daily-check-night' as const,
  },
];

// ─── component ────────────────────────────────────────────────────────────────
export default function DailyCheck() {
  const router = useRouter();
  const { user, displayName } = useAuth();
  const firstName = displayName?.split(' ')[0] ?? '';
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [streak, setStreak] = useState(0);
  const [week, setWeek] = useState<{ label: string; full: boolean }[]>([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    // Immediate optimistic load from local cache, then sync from Supabase
    loadDone().then(setDone);
    syncFromApi().then(({ done, streak, week }) => {
      setDone(done);
      setStreak(streak);
      setWeek(week);
    });
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    // Poll every 5 s — picks up completions from other screens navigating back
    const interval = setInterval(() => {
      syncFromApi().then(({ done, streak, week }) => {
        setDone(done);
        setStreak(streak);
        setWeek(week);
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const completedCount = STEPS.filter((s) => done[s.key]).length;
  const displayStreak = DEV_DAY ?? streak;

  const completedKeysList = Object.keys(done).filter((k) => done[k]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* ── Sticky profile bar — always visible at top ── */}
      <Animated.View style={[styles.topBar, { opacity: fadeAnim }]}>
        <View style={styles.profileLeft}>
          {user?.user_metadata?.avatar_url ? (
            <Image
              source={{ uri: avatarUrl(user.user_metadata.avatar_url, 80) }}
              style={styles.profileAvatar}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={styles.profileAvatarPlaceholder}>
              <Text style={styles.profileAvatarInitial}>
                {firstName ? firstName.charAt(0).toUpperCase() : '☀️'}
              </Text>
            </View>
          )}
          <Text style={styles.profileGreet}>
            Hey, {firstName
              ? firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()
              : 'there'}
          </Text>
        </View>
        <View style={[styles.progressPill, completedCount === 3 && styles.progressPillDone]}>
          <Text style={[styles.progressText, completedCount === 3 && styles.progressTextDone]}>
            {completedCount} / 3 done
          </Text>
        </View>
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Garden — full width at top, tappable */}
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => router.push('/garden')}
          style={styles.gardenCard}
        >
          <GardenScene completedKeys={completedKeysList} compact={false} />
          {/* Row 1: streak + week dots */}
          <View style={styles.trackerRow}>
            {/* Streak badge */}
            <View style={styles.streakBadge}>
              <Flame size={14} color={colors.amberRich} strokeWidth={2.3} />
              <Text style={styles.streakNum}>{displayStreak}</Text>
              <Text style={styles.streakLabel}>day streak</Text>
            </View>

            {/* 7-day dots */}
            <View style={styles.weekDots}>
              {week.map((d, i) => (
                <View key={i} style={styles.dotCol}>
                  <View style={[styles.dot, d.full && styles.dotFull, i === 6 && styles.dotToday]} />
                  <Text style={[styles.dotLabel, i === 6 && styles.dotLabelToday]}>{d.label}</Text>
                </View>
              ))}
            </View>

            {/* Garden link */}
            <TouchableOpacity onPress={() => router.push('/garden')} style={styles.gardenLink} hitSlop={10}>
              <Sprout size={16} color={colors.mossRich} strokeWidth={2.2} />
              <ChevronRight size={14} color={colors.softGray} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Row 2: next milestone progress */}
          {(() => {
            const { pct, daysToGo, next } = milestoneProgress(displayStreak);
            if (!next) return null;
            const MIcon = next.Icon;
            return (
              <View style={styles.milestoneRow}>
                <View style={styles.milestoneBadge}>
                  <MIcon size={18} color={colors.mossRich} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.milestoneTop}>
                    <Text style={styles.milestoneEyebrow}>NEXT UNLOCK</Text>
                    <Text style={styles.milestoneDays}>{daysToGo} day{daysToGo !== 1 ? 's' : ''} to go</Text>
                  </View>
                  <Text style={styles.milestoneTitle}>{next.label}</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%` }]} />
                  </View>
                </View>
              </View>
            );
          })()}
        </TouchableOpacity>

        {/* Header */}
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.eyebrow}>TODAY'S RITUAL</Text>
          <Text style={styles.title}>daily check</Text>
          <Text style={styles.subtitle}>three steps, morning to night.</Text>
        </Animated.View>

        {/* Step cards */}
        <View style={styles.cards}>
          {STEPS.map((step, idx) => (
            <StepCard
              key={step.key}
              step={step}
              isDone={!!done[step.key]}
              delay={idx * 80}
              onPress={() => router.push(step.path)}
            />
          ))}
        </View>

        {/* All done banner */}
        {completedCount === 3 && (
          <View style={styles.doneBanner}>
            <View style={styles.doneBannerIcon}>
              <Check size={18} color={colors.cream} strokeWidth={2.6} />
            </View>
            <View>
              <Text style={styles.doneTitle}>All done for today</Text>
              <Text style={styles.doneSub}>See you tomorrow.</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── StepCard ─────────────────────────────────────────────────────────────────
interface StepCardProps {
  step: (typeof STEPS)[0];
  isDone: boolean;
  delay: number;
  onPress: () => void;
}

function StepCard({ step, isDone, delay, onPress }: StepCardProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, delay, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  const handlePressIn = () => Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true }).start();
  const handlePressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();

  const { Icon } = step;

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {/* Dynamic gradient surface, driven by the step's accent */}
        <SoftGradient
          colors={step.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.card, cardShadow]}
        >
          {/* Inner paper panel keeps text legible over the gradient */}
          <View style={styles.cardInner}>
            <View style={[styles.iconCircle, { backgroundColor: step.accent + '22', borderColor: step.accent + '44' }]}>
              <Icon size={24} color={step.accent} strokeWidth={2.2} />
            </View>

            <View style={styles.cardText}>
              <View style={styles.cardMeta}>
                <Text style={[styles.stepNumber, { color: step.accent }]}>{step.number}</Text>
                <Text style={styles.stepSubtitle}>{step.subtitle.toUpperCase()}</Text>
              </View>
              <Text style={[styles.stepTitle, isDone && styles.stepTitleDone]}>{step.title}</Text>
              <Text style={styles.stepDesc}>{step.description}</Text>
            </View>

            {isDone ? (
              <View style={[styles.tick, { backgroundColor: step.accent }]}>
                <Check size={15} color={colors.cream} strokeWidth={2.8} />
              </View>
            ) : (
              <ChevronRight size={22} color={colors.softGray} strokeWidth={2.2} />
            )}
          </View>
        </SoftGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  scroll: { flex: 1 },
  content: { paddingBottom: 48, paddingTop: 0 },

  header: { marginBottom: 24, paddingHorizontal: 20 },

  // sticky profile bar above scroll
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: colors.cream,
  },
  profileLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  profileAvatar: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: colors.border,
  },
  profileAvatarPlaceholder: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.amber,
    borderWidth: 2, borderColor: colors.amberRich + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarInitial: { fontFamily: fonts.serif, fontSize: 18, color: colors.cocoa },
  profileGreet: {
    fontFamily: fonts.serif, fontSize: 20,
    color: colors.cocoa, letterSpacing: -0.2,
  },

  eyebrow: {
    fontSize: 10,
    letterSpacing: 3,
    fontWeight: '700',
    color: colors.softGray,
    marginBottom: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  title: {
    fontFamily: fonts.serif,
    fontSize: 34,
    color: colors.cocoa,
    letterSpacing: -0.5,
  },
  subtitle: { marginTop: 4, fontSize: 13, color: colors.warmGray },

  progressPill: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 2,
  },
  progressPillDone: { backgroundColor: colors.sage, borderColor: colors.moss },
  progressText: { fontSize: 11, fontWeight: '700', color: colors.warmGray },
  progressTextDone: { color: colors.mossRich },

  cards: { gap: 14, marginBottom: 16, paddingHorizontal: 20 },

  gardenCard: {
    overflow: 'hidden',
    backgroundColor: colors.paper,
    marginBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  // ── tracker rows ────────────────────────────────────────────────────────────
  trackerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.paper,
    gap: 10,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.amber,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  streakNum: { fontSize: 13, fontWeight: '800', color: colors.cocoa },
  streakLabel: { fontSize: 11, color: colors.cocoa },

  weekDots: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  dotCol: { alignItems: 'center', gap: 3 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  dotFull: { backgroundColor: colors.mossRich },
  dotToday: { borderWidth: 2, borderColor: colors.amberRich, backgroundColor: colors.border },
  dotLabel: { fontSize: 9, color: colors.softGray },
  dotLabelToday: { color: colors.cocoa, fontWeight: '700' },

  gardenLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },

  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#FFFDF8',
  },
  milestoneBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EEF4E9',
    borderWidth: 1,
    borderColor: 'rgba(143,168,124,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  milestoneEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, color: colors.mossRich },
  milestoneDays: { fontSize: 9, color: colors.warmGray },
  milestoneTitle: { fontFamily: fonts.serif, fontSize: 14, color: colors.cocoa, marginBottom: 5 },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(143,168,124,0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.mossRich,
  },

  card: { borderRadius: 22, padding: 3, marginBottom: 2 },
  cardInner: {
    backgroundColor: colors.paper,
    borderRadius: 19,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  cardText: { flex: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  stepNumber: { fontSize: 10, fontWeight: '700' },
  stepSubtitle: { fontSize: 10, color: colors.softGray, letterSpacing: 1.5, fontWeight: '600' },
  stepTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.cocoa, lineHeight: 22 },
  stepTitleDone: { color: colors.warmGray, textDecorationLine: 'line-through' },
  stepDesc: { fontSize: 12, color: colors.warmGray, marginTop: 3, lineHeight: 17 },

  tick: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  doneBanner: {
    marginTop: 22,
    marginHorizontal: 20,
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.sage,
    borderWidth: 1,
    borderColor: colors.moss,
  },
  doneBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.mossRich,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: { fontFamily: fonts.serif, fontSize: 16, color: colors.cocoa },
  doneSub: { fontSize: 12, color: colors.warmGray, marginTop: 2 },
});
