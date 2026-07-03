/**
 * Night Summary — prompt the user to open the voice agent for their nightly reflection.
 * Cream/lavender theme, concentric pulse rings, staggered entrance, no emojis.
 */
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, Mic, MessageCircle, Heart, Sparkles, ChevronRight,
} from 'lucide-react-native';
import { markStepDone } from './DailyCheck';
import { colors, fonts, cardShadow } from '../lib/theme';
import { SoftGradient } from '../components/SoftGradient';

// ─── Night palette (lavender-purple, all warm-toned) ─────────────────────────
const N = {
  accent:      '#8B6FD4',   // mid-purple
  accentDeep:  '#6B4FC4',   // pressed / deep
  accentLight: '#F0EBFF',   // tint backgrounds
  accentMid:   '#C4B0F0',   // borders, progress empty
  accentGlow:  'rgba(139,111,212,0.18)',
  ring1:       'rgba(139,111,212,0.14)',
  ring2:       'rgba(139,111,212,0.09)',
  ring3:       'rgba(139,111,212,0.05)',
};

// ─── Concentric pulse rings ───────────────────────────────────────────────────
function PulseRings() {
  const r1 = useRef(new Animated.Value(1)).current;
  const r2 = useRef(new Animated.Value(1)).current;
  const r3 = useRef(new Animated.Value(1)).current;
  const o1 = useRef(new Animated.Value(0.55)).current;
  const o2 = useRef(new Animated.Value(0.35)).current;
  const o3 = useRef(new Animated.Value(0.20)).current;

  const pulse = (scale: Animated.Value, opacity: Animated.Value, delay: number) =>
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.55, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,    duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.55, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );

  useEffect(() => {
    pulse(r1, o1, 0).start();
    pulse(r2, o2, 600).start();
    pulse(r3, o3, 1200).start();
  }, []);

  return (
    <>
      <Animated.View style={[ringStyles.ring, { transform: [{ scale: r3 }], opacity: o3, width: 200, height: 200, borderRadius: 100 }]} />
      <Animated.View style={[ringStyles.ring, { transform: [{ scale: r2 }], opacity: o2, width: 160, height: 160, borderRadius: 80  }]} />
      <Animated.View style={[ringStyles.ring, { transform: [{ scale: r1 }], opacity: o1, width: 130, height: 130, borderRadius: 65  }]} />
    </>
  );
}

const ringStyles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: N.accent,
  },
});

// ─── Orb breathing ────────────────────────────────────────────────────────────
function BreathOrb() {
  const scale = useRef(new Animated.Value(1)).current;
  const glow  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Scale on native driver
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.07, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,    duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
    // Glow on JS driver (shadowOpacity is not a native-driver prop)
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const shadowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.40] });

  // Two nested Animated.Views so native-driver (scale/transform) and
  // JS-driver (shadowOpacity) never share the same animated node.
  return (
    <Animated.View style={{
      shadowOpacity,
      shadowColor: N.accent,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
      borderRadius: 48,
    }}>
      <Animated.View style={[orbStyles.orb, { transform: [{ scale }] }]}>
        <Mic size={38} color="#fff" strokeWidth={1.6} />
      </Animated.View>
    </Animated.View>
  );
}

const orbStyles = StyleSheet.create({
  orb: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: N.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Prompt chip ─────────────────────────────────────────────────────────────
function PromptChip({ Icon, text, delay, masterFade }: {
  Icon: React.ComponentType<any>;
  text: string;
  delay: number;
  masterFade: Animated.Value;
}) {
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[chipStyles.chip, { opacity: fade, transform: [{ translateY: slide }] }]}>
      <View style={chipStyles.iconWrap}>
        <Icon size={14} color={N.accent} strokeWidth={2.2} />
      </View>
      <Text style={chipStyles.text}>{text}</Text>
    </Animated.View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: N.accentLight,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: N.accentMid + '70',
  },
  iconWrap: { /* noop — icon is inline */ },
  text: { fontSize: 12, color: N.accentDeep, fontWeight: '600' },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DailyCheckNight() {
  const router = useRouter();

  const anims = Array.from({ length: 7 }, () => ({
    fade:  useRef(new Animated.Value(0)).current,
    slide: useRef(new Animated.Value(20)).current,
  }));

  useEffect(() => {
    anims.forEach(({ fade, slide }, i) => {
      Animated.parallel([
        Animated.timing(fade,  { toValue: 1, duration: 520, delay: i * 90, useNativeDriver: true }),
        Animated.timing(slide, { toValue: 0, duration: 520, delay: i * 90, useNativeDriver: true }),
      ]).start();
    });
  }, []);

  const fs = (i: number) => ({
    opacity: anims[i].fade,
    transform: [{ translateY: anims[i].slide }],
  });

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={16} color={colors.warmGray} strokeWidth={2} />
          <Text style={styles.backText}>back</Text>
        </TouchableOpacity>

        {/* Hero — gradient card with orb + pulse rings */}
        <Animated.View style={[styles.heroCard, fs(0)]}>
          <SoftGradient
            colors={['#E8E0FF', '#F0EBFF', '#F8F5FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            {/* Rings + orb, centred */}
            <View style={styles.orbArea}>
              <PulseRings />
              <BreathOrb />
            </View>

            {/* Eyebrow */}
            <Text style={styles.eyebrow}>03 · NIGHT SUMMARY</Text>

            {/* Serif title */}
            <Text style={styles.heroTitle}>Release{'\n'}the day</Text>

            {/* Subtitle */}
            <Text style={styles.heroSub}>
              Share your whole day with your voice agent — what happened, how it felt, what's still sitting with you.
            </Text>
          </SoftGradient>
        </Animated.View>

        {/* What to say chips */}
        <Animated.View style={[styles.chipsHeader, fs(1)]}>
          <Text style={styles.chipsLabel}>WHAT YOU CAN TALK ABOUT</Text>
        </Animated.View>

        <View style={styles.chipsRow}>
          <PromptChip Icon={MessageCircle} text="What happened today"    delay={300} masterFade={anims[2].fade} />
          <PromptChip Icon={Heart}         text="How you're feeling now" delay={380} masterFade={anims[3].fade} />
          <PromptChip Icon={Sparkles}      text="What's still on your mind" delay={460} masterFade={anims[4].fade} />
        </View>

        {/* Info card */}
        <Animated.View style={[styles.infoCard, fs(3)]}>
          <View style={styles.infoRow}>
            <View style={[styles.infoIcon, { backgroundColor: N.accentLight }]}>
              <Mic size={16} color={N.accent} strokeWidth={2} />
            </View>
            <View style={styles.infoText}>
              <Text style={styles.infoTitle}>Your voice agent is ready</Text>
              <Text style={styles.infoSub}>
                Nothing is too small or too messy. Your agent listens without judgement and reflects patterns back to you.
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* CTA */}
        <Animated.View style={[styles.ctaWrap, fs(5)]}>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => {
              markStepDone('night');
              router.push({ pathname: '/(tabs)/dashboard', params: { autoStart: 'true' } });
            }}
            activeOpacity={0.84}
          >
            <SoftGradient
              colors={[N.accent, N.accentDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              <Mic size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.ctaBtnText}>Start night reflection</Text>
              <ChevronRight size={16} color="rgba(255,255,255,0.7)" strokeWidth={2.5} />
            </SoftGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Skip */}
        <Animated.View style={[styles.skipWrap, fs(6)]}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6}>
            <Text style={styles.skipText}>maybe later</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.cream },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 52 },

  backBtn: {
    paddingTop: 12, paddingBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
  },
  backText: { fontSize: 13, fontWeight: '500', color: colors.warmGray },

  // Hero card
  heroCard: {
    borderRadius: 28, overflow: 'hidden', marginBottom: 28,
    borderWidth: 1, borderColor: N.accentMid + '55',
    ...cardShadow,
  },
  heroGradient: { paddingHorizontal: 24, paddingBottom: 28, paddingTop: 10, alignItems: 'center' },

  // Orb + rings area
  orbArea: {
    width: 200, height: 200,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },

  eyebrow: {
    fontSize: 10, letterSpacing: 3.5, fontWeight: '700',
    color: N.accent, marginBottom: 10, opacity: 0.85,
    textAlign: 'center',
  },
  heroTitle: {
    fontFamily: fonts.serif, fontSize: 36,
    color: colors.cocoa, letterSpacing: -0.7, lineHeight: 42,
    marginBottom: 12, textAlign: 'center',
  },
  heroSub: {
    fontSize: 13, color: colors.warmGray,
    lineHeight: 20, textAlign: 'center',
    maxWidth: 300,
  },

  // Chips
  chipsHeader: { marginBottom: 10 },
  chipsLabel: {
    fontSize: 10, letterSpacing: 2.5, fontWeight: '700',
    color: colors.softGray,
  },
  chipsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 9,
    marginBottom: 24,
  },

  // Info card
  infoCard: {
    backgroundColor: colors.paper,
    borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    padding: 18, marginBottom: 28,
    ...cardShadow,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  infoIcon: {
    width: 42, height: 42, borderRadius: 13,
    borderWidth: 1, borderColor: N.accentMid + '60',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  infoText: { flex: 1 },
  infoTitle: { fontFamily: fonts.serif, fontSize: 16, color: colors.cocoa, marginBottom: 5 },
  infoSub:   { fontSize: 12, color: colors.warmGray, lineHeight: 18 },

  // CTA
  ctaWrap: { marginBottom: 16 },
  ctaBtn:  { borderRadius: 20, overflow: 'hidden' },
  ctaGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 18,
  },
  ctaBtnText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.1 },

  // Skip
  skipWrap: { alignItems: 'center' },
  skipText: {
    fontSize: 12, color: colors.softGray,
    textAlign: 'center', paddingVertical: 6,
  },
});
