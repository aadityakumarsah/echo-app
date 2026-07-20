/**
 * Garden — full-view screen showing the user's growing garden.
 * Each day they complete all 3 steps, the garden gains a new plant.
 * Same cream/cocoa theme as DailyCheck.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { ChevronLeft, Sprout, Flame, Lock, Check } from 'lucide-react-native';
import { Image } from 'expo-image';
import { colors, fonts, cardShadow } from '../lib/theme';
import { GardenScene } from '../components/GardenScene';
import { useAuth } from '../contexts/AuthContext';
import { avatarUrl } from '../lib/cloudinary';

const SCREEN_W = Dimensions.get('window').width;

// ─── Milestones ──────────────────────────────────────────────────────────────
const MILESTONES = [
  { day: 1,  label: 'Teapot',        emoji: '🫖',  desc: 'A warm teapot appears' },
  { day: 4,  label: 'Floral',        emoji: '🌸',  desc: 'Floral ornament blooms' },
  { day: 7,  label: 'Honey Bee',     emoji: '🐝',  desc: 'A bee starts buzzing around' },
  { day: 12, label: 'Autumn Leaves', emoji: '🍂',  desc: 'Leaves drift in the breeze' },
  { day: 30, label: 'Birds',         emoji: '🐦',  desc: 'Birds visit your garden' },
  { day: 45, label: 'Berry Sprigs',  emoji: '🫐',  desc: 'Berry bushes appear' },
  { day: 60, label: 'More Bees',     emoji: '🐝',  desc: 'Background bees join in' },
  { day: 75, label: 'More Birds',    emoji: '🕊️',  desc: 'A second flock arrives' },
  { day: 80, label: 'More Leaves',   emoji: '🍁',  desc: 'Autumn spreads to the left' },
  { day: 90, label: 'Frog',          emoji: '🐸',  desc: 'A frog settles by the pond' },
] as const;

// ─── helpers ──────────────────────────────────────────────────────────────────
function dateKey(d: Date) {
  return `daily-check-${d.toISOString().slice(0, 10)}`;
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

async function loadLast7Days(): Promise<{ date: Date; label: string; keys: string[] }[]> {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d;
  }).reverse();

  const results = await Promise.all(
    days.map(async (d) => {
      try {
        const raw = await AsyncStorage.getItem(dateKey(d));
        const data = raw ? JSON.parse(raw) : {};
        return { date: d, label: formatDate(d), keys: Object.keys(data).filter((k) => data[k]) };
      } catch {
        return { date: d, label: formatDate(d), keys: [] };
      }
    })
  );
  return results;
}

function calcStreak(days: { keys: string[] }[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].keys.length === 3) streak++;
    else break;
  }
  return streak;
}

// ─── DayDot ───────────────────────────────────────────────────────────────────
function DayDot({ label, keys, isToday }: { label: string; keys: string[]; isToday: boolean }) {
  const done = keys.length;
  const full = done === 3;
  return (
    <View style={styles.dotCol}>
      <View style={[styles.dot, full && styles.dotFull, isToday && styles.dotToday]}>
        {full ? (
          <Sprout size={13} color={colors.cream} strokeWidth={2.5} />
        ) : (
          <Text style={styles.dotCount}>{done}</Text>
        )}
      </View>
      <Text style={[styles.dotLabel, isToday && styles.dotLabelToday]}>{label.split(' ')[0]}</Text>
    </View>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────
export default function Garden() {
  const router = useRouter();
  const { user, displayName } = useAuth();
  const [days, setDays] = useState<{ date: Date; label: string; keys: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const firstName = displayName?.split(' ')[0] ?? '';

  useEffect(() => {
    loadLast7Days().then((d) => {
      setDays(d);
      setLoading(false);
    });
  }, []);

  const today = days[days.length - 1];
  const todayKeys = today?.keys ?? [];
  const streak = calcStreak(days);
  const totalPlants = days.filter((d) => d.keys.length === 3).length;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Profile row — avatar + Hey, Name left | streak right ── */}
        <View style={styles.profileRow}>
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
                  {firstName ? firstName.charAt(0).toUpperCase() : '🌱'}
                </Text>
              </View>
            )}
            <Text style={styles.profileGreet}>
              Hey, {firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase() : 'there'}
            </Text>
          </View>
          {streak > 0 ? (
            <View style={styles.streakBadge}>
              <Flame size={14} color={colors.amberRich} strokeWidth={2.3} />
              <Text style={styles.streakText}>{streak} day{streak !== 1 ? 's' : ''}</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <ChevronLeft size={22} color={colors.cocoa} strokeWidth={2.2} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Page title ── */}
        <Text style={styles.eyebrow}>YOUR SPACE</Text>
        <Text style={styles.title}>garden</Text>

        <Text style={styles.subtitle}>
          {streak > 0
            ? `${streak}-day streak — your garden is growing.`
            : 'Complete daily steps to grow your garden.'}
        </Text>

        {/* Main garden scene */}
        {!loading && (
          <View style={[styles.gardenCard, cardShadow]}>
            <GardenScene
              completedKeys={todayKeys}
              dayCount={streak}
              compact={false}
            />
            <View style={styles.gardenFooter}>
              <Text style={styles.gardenFooterText}>
                {todayKeys.length === 0 && 'Start today to see your garden bloom.'}
                {todayKeys.length === 1 && 'One step done — two more to go.'}
                {todayKeys.length === 2 && 'Almost there — one more step.'}
                {todayKeys.length === 3 && 'Full bloom today. Beautiful.'}
              </Text>
            </View>
          </View>
        )}

        {/* Weekly history */}
        <Text style={styles.sectionTitle}>this week</Text>
        <View style={styles.weekRow}>
          {days.map((d, i) => (
            <DayDot key={i} label={d.label} keys={d.keys} isToday={i === days.length - 1} />
          ))}
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{totalPlants}</Text>
            <Text style={styles.statLabel}>plants grown</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{streak}</Text>
            <Text style={styles.statLabel}>day streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{days.filter((d) => d.keys.length > 0).length}</Text>
            <Text style={styles.statLabel}>active days</Text>
          </View>
        </View>

        {/* Legend */}
        <Text style={styles.sectionTitle}>what grows</Text>
        <View style={styles.legendCol}>
          {[
            { color: colors.amber, label: 'Morning flower', step: 'Morning Energy complete' },
            { color: colors.moss, label: 'Moss bush', step: 'Day Refill complete' },
            { color: colors.lavender, label: 'Night bloom', step: 'Night Summary complete' },
          ].map((item) => (
            <View key={item.label} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <View>
                <Text style={styles.legendTitle}>{item.label}</Text>
                <Text style={styles.legendSub}>{item.step}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Milestone progression */}
        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>milestones</Text>
        <View style={styles.milestoneCard}>
          {MILESTONES.map((m, i) => {
            const unlocked = streak >= m.day;
            const isNext = !unlocked && (i === 0 || streak >= MILESTONES[i - 1].day);
            return (
              <View key={m.day} style={styles.milestoneRow}>
                {/* Vertical connector line */}
                {i < MILESTONES.length - 1 && (
                  <View style={[
                    styles.milestoneLine,
                    unlocked && styles.milestoneLineUnlocked,
                  ]} />
                )}
                {/* Icon circle */}
                <View style={[
                  styles.milestoneCircle,
                  unlocked && styles.milestoneCircleUnlocked,
                  isNext && styles.milestoneCircleNext,
                ]}>
                  {unlocked ? (
                    <Check size={14} color={colors.cream} strokeWidth={3} />
                  ) : (
                    <Text style={{ fontSize: 16 }}>{m.emoji}</Text>
                  )}
                </View>
                {/* Text */}
                <View style={styles.milestoneTextCol}>
                  <View style={styles.milestoneHeader}>
                    <Text style={[
                      styles.milestoneLabel,
                      !unlocked && styles.milestoneLabelLocked,
                    ]}>
                      {m.label}
                    </Text>
                    <Text style={[
                      styles.milestoneDayBadge,
                      unlocked && styles.milestoneDayBadgeUnlocked,
                    ]}>
                      Day {m.day}
                    </Text>
                  </View>
                  <Text style={[
                    styles.milestoneDesc,
                    !unlocked && styles.milestoneDescLocked,
                  ]}>
                    {unlocked ? m.desc : isNext
                      ? `${m.day - streak} more day${m.day - streak !== 1 ? 's' : ''} to unlock`
                      : m.desc}
                  </Text>
                </View>
                {/* Lock icon for locked items */}
                {!unlocked && (
                  <Lock size={14} color={colors.softGray} strokeWidth={2} style={{ marginLeft: 'auto' }} />
                )}
              </View>
            );
          })}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: 20, paddingBottom: 56, paddingTop: 8 },

  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  profileLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  profileAvatar: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: colors.moss,
  },
  profileAvatarPlaceholder: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.sage,
    borderWidth: 2, borderColor: colors.moss,
    alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarInitial: { fontSize: 18, color: colors.mossRich },
  profileGreet: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.cocoa,
    letterSpacing: -0.2,
  },
  backBtn: { padding: 6 },

  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 10 },
  eyebrow: { fontSize: 10, letterSpacing: 3, fontWeight: '700', color: colors.softGray, marginBottom: 2 },
  title: { fontFamily: fonts.serif, fontSize: 34, color: colors.cocoa, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.warmGray, marginBottom: 20 },

  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.amber,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 14,
  },
  streakText: { fontSize: 12, fontWeight: '700', color: colors.cocoa },

  gardenCard: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#EEF4EC',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: colors.moss,
    shadowColor: colors.mossRich,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 6,
  },
  gardenFooter: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: colors.moss + '55',
    backgroundColor: colors.sage,
  },
  gardenFooterText: { fontSize: 13, color: colors.mossRich, fontStyle: 'italic', fontWeight: '500' },

  sectionTitle: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.cocoa,
    marginBottom: 12,
  },

  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    backgroundColor: colors.paper,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: colors.cocoa,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  dotCol: { alignItems: 'center', gap: 6 },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotFull: { backgroundColor: colors.mossRich },
  dotToday: { borderWidth: 2, borderColor: colors.amberRich },
  dotCount: { fontSize: 11, fontWeight: '700', color: colors.warmGray },
  dotLabel: { fontSize: 10, color: colors.softGray },
  dotLabelToday: { color: colors.cocoa, fontWeight: '700' },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  statCard: {
    flex: 1,
    backgroundColor: colors.paper,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statNum: { fontFamily: fonts.serif, fontSize: 28, color: colors.cocoa },
  statLabel: { fontSize: 11, color: colors.warmGray, marginTop: 2 },

  legendCol: {
    backgroundColor: colors.paper,
    borderRadius: 20,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legendDot: { width: 16, height: 16, borderRadius: 8 },
  legendTitle: { fontSize: 13, fontWeight: '600', color: colors.cocoa },
  legendSub: { fontSize: 11, color: colors.warmGray, marginTop: 1 },

  milestoneCard: {
    backgroundColor: colors.paper,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    position: 'relative',
  },
  milestoneLine: {
    position: 'absolute',
    left: 17,
    top: 42,
    width: 2,
    height: 28,
    backgroundColor: colors.border,
  },
  milestoneLineUnlocked: {
    backgroundColor: colors.mossRich,
  },
  milestoneCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  milestoneCircleUnlocked: {
    backgroundColor: colors.mossRich,
    borderColor: colors.moss,
  },
  milestoneCircleNext: {
    borderColor: colors.amberRich,
    borderWidth: 2.5,
  },
  milestoneTextCol: {
    flex: 1,
  },
  milestoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  milestoneLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.cocoa,
  },
  milestoneLabelLocked: {
    color: colors.warmGray,
  },
  milestoneDayBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.softGray,
    backgroundColor: colors.border,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  milestoneDayBadgeUnlocked: {
    backgroundColor: colors.sage,
    color: colors.mossRich,
  },
  milestoneDesc: {
    fontSize: 12,
    color: colors.warmGray,
    marginTop: 2,
  },
  milestoneDescLocked: {
    fontStyle: 'italic',
  },
});
