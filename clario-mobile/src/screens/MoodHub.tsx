/**
 * Mood Hub — cream/cocoa theme matching DailyCheck & Dashboard.
 */
import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Wind, Gamepad2, Brain, ChevronRight, Clock } from 'lucide-react-native';
import { colors, fonts, cardShadow, gradients } from '../lib/theme';
import { SoftGradient } from '../components/SoftGradient';

// ─── Activity definitions ─────────────────────────────────────────────────────
const ACTIVITIES = [
  {
    key: 'breathe',
    number: '01',
    title: 'Breathe',
    subtitle: 'what do you want to release?',
    description: 'Choose an emotion and follow a guided breathing pattern.',
    Icon: Wind,
    accent: colors.lavenderDeep,
    gradient: ['#EDE4F0', '#C3A9CB'] as [string, string],
    route: '/breathe',
    tag: '2–4 min',
  },
  {
    key: 'relief',
    number: '02',
    title: 'Relief',
    subtitle: 'need a moment?',
    description: 'Air drawing, block stacking, and more to reset your mind.',
    Icon: Gamepad2,
    accent: colors.mossRich,
    gradient: gradients.refill,
    route: '/relief',
    tag: 'anytime',
  },
  {
    key: 'meditation',
    number: '03',
    title: 'Meditation',
    subtitle: 'still your mind',
    description: 'Guided sessions from 5 to 30 minutes of mindful presence.',
    Icon: Brain,
    accent: colors.amberRich,
    gradient: gradients.morning,
    route: '/meditation-session',
    tag: '5–30 min',
  },
] as const;

// ─── Quick breathe emotions ───────────────────────────────────────────────────
const EMOTIONS = [
  { key: 'anxiety',    label: 'anxiety',    accent: colors.lavenderDeep, bg: colors.lavender },
  { key: 'anger',      label: 'anger',      accent: colors.roseDeep,     bg: colors.blush    },
  { key: 'sadness',    label: 'sadness',    accent: colors.lavenderDeep, bg: colors.lavender },
  { key: 'fear',       label: 'fear',       accent: colors.mossRich,     bg: colors.sage     },
  { key: 'worry',      label: 'worry',      accent: colors.amberRich,    bg: colors.amber    },
  { key: 'irritation', label: 'irritation', accent: colors.mossRich,     bg: colors.sage     },
  { key: 'envy',       label: 'envy',       accent: colors.lavenderDeep, bg: colors.lavender },
];

// ─── ActivityCard ─────────────────────────────────────────────────────────────
function ActivityCard({ activity, index }: { activity: typeof ACTIVITIES[number]; index: number }) {
  const router = useRouter();
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(20)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 450, delay: index * 90, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 450, delay: index * 90, useNativeDriver: true }),
    ]).start();
  }, []);

  const { Icon } = activity;

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }, { scale }] }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push(activity.route as any)}
        onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
      >
        <SoftGradient
          colors={activity.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.card, cardShadow]}
        >
          <View style={styles.cardInner}>
            {/* Icon circle */}
            <View style={[styles.iconCircle, { backgroundColor: activity.accent + '22', borderColor: activity.accent + '44' }]}>
              <Icon size={26} color={activity.accent} strokeWidth={2} />
            </View>

            {/* Text */}
            <View style={styles.cardText}>
              <View style={styles.cardMeta}>
                <Text style={[styles.stepNum, { color: activity.accent }]}>{activity.number}</Text>
                <Text style={styles.stepSubtitle}>{activity.subtitle.toUpperCase()}</Text>
              </View>
              <Text style={styles.cardTitle}>{activity.title}</Text>
              <Text style={styles.cardDesc}>{activity.description}</Text>
            </View>

            {/* Right side */}
            <View style={styles.cardRight}>
              <View style={[styles.tagPill, { backgroundColor: activity.accent + '18', borderColor: activity.accent + '33' }]}>
                <Clock size={9} color={activity.accent} strokeWidth={2.5} />
                <Text style={[styles.tagText, { color: activity.accent }]}>{activity.tag}</Text>
              </View>
              <ChevronRight size={20} color={colors.softGray} strokeWidth={2.2} style={{ marginTop: 8 }} />
            </View>
          </View>
        </SoftGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MoodHub() {
  const router = useRouter();
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <Animated.View style={[styles.header, { opacity: fade, transform: [{ translateY: slide }] }]}>
          <Text style={styles.eyebrow}>MOOD & WELLNESS</Text>
          <Text style={styles.title}>how are you{'\n'}today?</Text>
          <Text style={styles.subtitle}>choose an activity to feel more like yourself.</Text>
        </Animated.View>

        {/* Activity cards */}
        <View style={styles.cards}>
          {ACTIVITIES.map((a, i) => (
            <ActivityCard key={a.key} activity={a} index={i} />
          ))}
        </View>

        {/* Quick breathe strip */}
        <Animated.View style={{ opacity: fade }}>
          <Text style={styles.quickEyebrow}>QUICK BREATHE</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickStrip}
          >
            {EMOTIONS.map((e) => (
              <TouchableOpacity
                key={e.key}
                style={[styles.emotionPill, { backgroundColor: e.bg, borderColor: e.accent + '44' }]}
                onPress={() => router.push(`/breathe/${e.key}` as any)}
                activeOpacity={0.82}
              >
                <Text style={[styles.emotionText, { color: e.accent }]}>{e.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.cream },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 56, paddingTop: 8 },

  header:   { marginBottom: 24 },
  eyebrow:  { fontSize: 10, letterSpacing: 3, fontWeight: '700', color: colors.softGray, marginBottom: 6 },
  title:    { fontFamily: fonts.serif, fontSize: 34, color: colors.cocoa, letterSpacing: -0.5, lineHeight: 40 },
  subtitle: { marginTop: 6, fontSize: 13, color: colors.warmGray },

  cards: { gap: 14, marginBottom: 28 },

  // activity card
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
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  cardText: { flex: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  stepNum:  { fontSize: 10, fontWeight: '700' },
  stepSubtitle: { fontSize: 9, color: colors.softGray, letterSpacing: 1.5, fontWeight: '600' },
  cardTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.cocoa, lineHeight: 24 },
  cardDesc:  { fontSize: 12, color: colors.warmGray, marginTop: 3, lineHeight: 17 },

  cardRight: { alignItems: 'center', flexShrink: 0 },
  tagPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  tagText: { fontSize: 10, fontWeight: '700' },

  // quick breathe
  quickEyebrow: { fontSize: 10, letterSpacing: 3, fontWeight: '700', color: colors.softGray, marginBottom: 12 },
  quickStrip:   { gap: 8, paddingBottom: 4 },
  emotionPill: {
    borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 16, paddingVertical: 9,
  },
  emotionText: { fontSize: 13, fontWeight: '600' },
});
