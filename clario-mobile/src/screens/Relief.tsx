import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Pencil, Layers, Sprout, ChevronLeft, ChevronRight, Clock } from 'lucide-react-native';
import { colors, fonts, cardShadow } from '../lib/theme';
import { SoftGradient } from '../components/SoftGradient';

const ACTIVITIES = [
  {
    key: 'drawing',
    number: '01',
    title: 'Air Drawing',
    subtitle: 'release tension',
    description: 'Trace shapes with your finger to release tension and calm the mind.',
    Icon: Pencil,
    accent: colors.lavenderDeep,
    gradient: ['#EDE4F0', '#C3A9CB'] as [string, string],
    route: '/relief/drawing',
    tag: 'anytime',
    available: true,
  },
  {
    key: 'blocks',
    number: '02',
    title: 'Space Blocks',
    subtitle: 'focus replaces anxiety',
    description: 'Stack falling blocks with perfect timing — focus replaces anxiety.',
    Icon: Layers,
    accent: colors.mossRich,
    gradient: ['#E4EDE2', '#9FBE93'] as [string, string],
    route: '/relief/blocks',
    tag: 'anytime',
    available: true,
  },
  {
    key: 'more',
    number: '03',
    title: 'More Coming',
    subtitle: 'crafted with care',
    description: 'New relief activities are being crafted for you. Check back soon.',
    Icon: Sprout,
    accent: colors.amberRich,
    gradient: ['#FBEFD6', '#E8C98A'] as [string, string],
    route: null,
    tag: 'soon',
    available: false,
  },
];

// ─── Card ─────────────────────────────────────────────────────────────────────
function ActivityCard({ activity, index }: { activity: typeof ACTIVITIES[number]; index: number }) {
  const router = useRouter();
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(20)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 420, delay: index * 80, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 420, delay: index * 80, useNativeDriver: true }),
    ]).start();
  }, []);

  const { Icon } = activity;

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }, { scale }] }}>
      <TouchableOpacity
        activeOpacity={activity.available ? 0.9 : 0.7}
        disabled={!activity.available}
        onPress={() => activity.available && activity.route && router.push(activity.route as any)}
        onPressIn={() => activity.available && Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
      >
        <SoftGradient
          colors={activity.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.card, cardShadow, !activity.available && styles.cardDisabled]}
        >
          <View style={styles.cardInner}>
            {/* Icon */}
            <View style={[styles.iconCircle, { backgroundColor: activity.accent + '22', borderColor: activity.accent + '44' }]}>
              <Icon size={26} color={activity.available ? activity.accent : colors.softGray} strokeWidth={2} />
            </View>

            {/* Text */}
            <View style={styles.cardText}>
              <View style={styles.cardMeta}>
                <Text style={[styles.stepNum, { color: activity.available ? activity.accent : colors.softGray }]}>{activity.number}</Text>
                <Text style={styles.stepSub}>{activity.subtitle.toUpperCase()}</Text>
              </View>
              <Text style={[styles.cardTitle, !activity.available && { color: colors.warmGray }]}>{activity.title}</Text>
              <Text style={styles.cardDesc}>{activity.description}</Text>
            </View>

            {/* Right */}
            <View style={styles.cardRight}>
              {activity.available ? (
                <>
                  <View style={[styles.tagPill, { backgroundColor: activity.accent + '18', borderColor: activity.accent + '33' }]}>
                    <Clock size={9} color={activity.accent} strokeWidth={2.5} />
                    <Text style={[styles.tagText, { color: activity.accent }]}>{activity.tag}</Text>
                  </View>
                  <ChevronRight size={20} color={colors.softGray} strokeWidth={2.2} style={{ marginTop: 8 }} />
                </>
              ) : (
                <View style={styles.soonBadge}>
                  <Text style={styles.soonText}>soon</Text>
                </View>
              )}
            </View>
          </View>
        </SoftGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Relief() {
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

        {/* Header with back button */}
        <Animated.View style={[styles.header, { opacity: fade, transform: [{ translateY: slide }] }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
            <ChevronLeft size={22} color={colors.cocoa} strokeWidth={2.2} />
          </TouchableOpacity>
          <Text style={styles.eyebrow}>RELIEF ACTIVITIES</Text>
          <Text style={styles.title}>need a{'\n'}moment?</Text>
          <Text style={styles.subtitle}>simple activities to reset, refocus, and find calm.</Text>
        </Animated.View>

        {/* Cards */}
        <View style={styles.cards}>
          {ACTIVITIES.map((a, i) => (
            <ActivityCard key={a.key} activity={a} index={i} />
          ))}
        </View>

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
  backBtn:  { marginBottom: 12, alignSelf: 'flex-start', padding: 4 },
  eyebrow:  { fontSize: 10, letterSpacing: 3, fontWeight: '700', color: colors.softGray, marginBottom: 6 },
  title:    { fontFamily: fonts.serif, fontSize: 34, color: colors.cocoa, letterSpacing: -0.5, lineHeight: 40 },
  subtitle: { marginTop: 6, fontSize: 13, color: colors.warmGray },

  cards: { gap: 14 },

  card:         { borderRadius: 22, padding: 3 },
  cardDisabled: { opacity: 0.65 },
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

  cardText:  { flex: 1 },
  cardMeta:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  stepNum:   { fontSize: 10, fontWeight: '700' },
  stepSub:   { fontSize: 9, color: colors.softGray, letterSpacing: 1.5, fontWeight: '600' },
  cardTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.cocoa, lineHeight: 24 },
  cardDesc:  { fontSize: 12, color: colors.warmGray, marginTop: 3, lineHeight: 17 },

  cardRight: { alignItems: 'center', flexShrink: 0 },
  tagPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  tagText: { fontSize: 10, fontWeight: '700' },

  soonBadge: {
    backgroundColor: colors.sand,
    borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.border,
  },
  soonText: { fontSize: 10, fontWeight: '700', color: colors.warmGray, letterSpacing: 0.5 },
});
