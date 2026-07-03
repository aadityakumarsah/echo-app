/**
 * Morning Energy step — tap 2 water glasses to complete.
 * SVG glass: trapezoid silhouette, thick rim, animated water fill clipped inside.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path, Rect, Circle, Defs, ClipPath, G, LinearGradient, Stop } from 'react-native-svg';
import { Zap, Brain, CheckCircle2, ArrowLeft, Droplets, Waves } from 'lucide-react-native';
import { markStepDone } from './DailyCheck';
import { colors, fonts, cardShadow } from '../lib/theme';
import { SoftGradient } from '../components/SoftGradient';

// Animated SVG primitives
const AnimatedRect   = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Palette ──────────────────────────────────────────────────────────────────
const W = {
  accent:       '#1A7CB5',
  accentLight:  '#E3F2FB',
  accentBorder: 'rgba(30,130,195,0.28)',
  accentMid:    '#A3CFEA',
  accentDark:   '#0E5A88',
};

// ─── SVG glass geometry ───────────────────────────────────────────────────────
// Canvas
const GW = 120, GH = 205;

// Rim — thick rounded bar at very top
const RIM_X = 7, RIM_Y = 5, RIM_W = 106, RIM_H = 14, RIM_RX = 7;

// Inner cavity (trapezoid — 92px wide at top, 66px at bottom)
const CAV_TOP_Y  = RIM_Y + RIM_H;          // 19
const CAV_BOT_Y  = 163;
const CAV_TOP_X1 = 14, CAV_TOP_X2 = 106;  // inner top edge  (92px wide)
const CAV_BOT_X1 = 27, CAV_BOT_X2 = 93;  // inner bottom edge (66px wide)
const CAV_H      = CAV_BOT_Y - CAV_TOP_Y; // 144

// Outer wall (a touch wider, gives the glass-wall thickness)
const WALL_TOP_X1 = 8,  WALL_TOP_X2 = 112;
const WALL_BOT_X1 = 22, WALL_BOT_X2 = 98;

// SVG path strings
const CLIP_D = `M ${CAV_TOP_X1} ${CAV_TOP_Y} L ${CAV_TOP_X2} ${CAV_TOP_Y} L ${CAV_BOT_X2} ${CAV_BOT_Y} L ${CAV_BOT_X1} ${CAV_BOT_Y} Z`;
const WALL_D = `M ${WALL_TOP_X1} ${CAV_TOP_Y} L ${WALL_TOP_X2} ${CAV_TOP_Y} L ${WALL_BOT_X2} ${CAV_BOT_Y} L ${WALL_BOT_X1} ${CAV_BOT_Y} Z`;

// Water animation
const MAX_FILL = CAV_H * 0.80;  // 115 px at 80% full

// Wave slab (much wider than cavity so translateX never reveals an edge)
const WAVE_W     = 340;
const WAVE_H     = 20;
const WAVE_CTR_X = (CAV_TOP_X1 + CAV_TOP_X2) / 2;   // 60
const WAVE_INIT_X = WAVE_CTR_X - WAVE_W / 2;         // -110

// Base
const BASE_W = 52, BASE_H = 9;
const BASE_X = (GW - BASE_W) / 2;  // 34
const BASE_Y = CAV_BOT_Y + 3;      // 166

// ─── WaterGlass ───────────────────────────────────────────────────────────────
function WaterGlass({
  index, drunk, onPress,
}: {
  index: number; drunk: boolean; onPress: () => void;
}) {
  const fillAnim  = useRef(new Animated.Value(0)).current;
  const waveAnim  = useRef(new Animated.Value(0)).current;
  const bubAnim   = useRef(new Animated.Value(0)).current;
  const checkAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Wave — perpetual left-right oscillation (JS driver, drives SVG x prop)
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(waveAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(waveAnim, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  // Bubbles — perpetual rise (JS driver, drives SVG cy prop)
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(bubAnim, { toValue: 1, duration: 2700, easing: Easing.linear, useNativeDriver: false })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    if (drunk) {
      Animated.parallel([
        Animated.timing(fillAnim, { toValue: 1, duration: 960, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.spring(checkAnim, { toValue: 1, stiffness: 340, damping: 16, delay: 650, useNativeDriver: true }),
      ]).start();
    } else {
      fillAnim.setValue(0);
      checkAnim.setValue(0);
    }
  }, [drunk]);

  const pressIn  = () => { if (!drunk) Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true }).start(); };
  const pressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();

  // ── Derived animated values for SVG props ──────────────────────────────────
  // Water rect rises from CAV_BOT_Y (empty) to CAV_BOT_Y - MAX_FILL (full)
  const waterY = fillAnim.interpolate({ inputRange: [0, 1], outputRange: [CAV_BOT_Y, CAV_BOT_Y - MAX_FILL] });
  const waterH = fillAnim.interpolate({ inputRange: [0, 1], outputRange: [0, MAX_FILL + 50] });

  // Wave sits exactly at the water surface
  const waveY  = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [CAV_BOT_Y - WAVE_H + 2, CAV_BOT_Y - MAX_FILL - WAVE_H + 7],
  });
  const waveX  = waveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [WAVE_INIT_X - 24, WAVE_INIT_X + 24],
  });

  // Bubbles: float from near-bottom to near-top, fade in and out
  const bub1Y  = bubAnim.interpolate({ inputRange: [0, 1], outputRange: [CAV_BOT_Y - 16, CAV_TOP_Y + 22] });
  const bub2Y  = bubAnim.interpolate({ inputRange: [0, 0.28, 1], outputRange: [CAV_BOT_Y - 8, CAV_BOT_Y - 52, CAV_TOP_Y + 32] });
  const bubO   = bubAnim.interpolate({ inputRange: [0, 0.12, 0.82, 1], outputRange: [0, 0.70, 0.42, 0] });

  // Unique IDs so two glasses on screen don't share SVG definitions
  const clipId = `gc${index}`, gradId = `gw${index}`, glId = `gl${index}`;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: 'center', gap: 12 }}>
      <TouchableOpacity onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} disabled={drunk} activeOpacity={1}>
        <View style={{ width: GW, height: GH }}>
          <Svg width={GW} height={GH} viewBox={`0 0 ${GW} ${GH}`}>
            <Defs>
              {/* Clip path = inner trapezoid cavity */}
              <ClipPath id={clipId}>
                <Path d={CLIP_D} />
              </ClipPath>
              {/* Water gradient: deep indigo-navy at bottom → clear sky-blue at surface */}
              <LinearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0"   stopColor="#083E72" stopOpacity="0.94" />
                <Stop offset="0.45" stopColor="#1068AA" stopOpacity="0.82" />
                <Stop offset="1"   stopColor="#3A9DD0" stopOpacity="0.62" />
              </LinearGradient>
              {/* Subtle glass-body fill when empty */}
              <LinearGradient id={glId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0"   stopColor="#B5DBF4" stopOpacity="0.22" />
                <Stop offset="0.5" stopColor="#E5F5FF" stopOpacity="0.06" />
                <Stop offset="1"   stopColor="#B5DBF4" stopOpacity="0.18" />
              </LinearGradient>
            </Defs>

            {/* ── Layer 1: empty glass inner tint ── */}
            <Path d={CLIP_D} fill={`url(#${glId})`} />

            {/* ── Layer 2: water fill + wave + bubbles (clipped to cavity) ── */}
            <G clipPath={`url(#${clipId})`}>
              {/* Water body */}
              <AnimatedRect
                x={CAV_TOP_X1 - 2}
                y={waterY}
                width={CAV_TOP_X2 - CAV_TOP_X1 + 4}
                height={waterH}
                fill={`url(#${gradId})`}
              />
              {/* Wave surface slab (light) */}
              <AnimatedRect
                x={waveX}
                y={waveY}
                width={WAVE_W}
                height={WAVE_H}
                rx={WAVE_H / 2}
                fill="rgba(68, 168, 222, 0.62)"
              />
              {/* Wave surface slab (deep — sits slightly lower) */}
              <AnimatedRect
                x={waveX}
                y={waveY}
                width={WAVE_W}
                height={WAVE_H * 0.55}
                rx={WAVE_H / 2}
                fill="rgba(16, 95, 168, 0.40)"
              />
              {/* Bubbles appear once glass is filled */}
              {drunk && (
                <>
                  <AnimatedCircle cx={CAV_BOT_X1 + 22} cy={bub1Y} r={2.5} fill="rgba(255,255,255,0.65)" opacity={bubO} />
                  <AnimatedCircle cx={CAV_BOT_X1 + 40} cy={bub2Y} r={1.8} fill="rgba(255,255,255,0.50)" opacity={bubO} />
                </>
              )}
            </G>

            {/* ── Layer 3: glass wall shell (transparent trapezoid outline) ── */}
            <Path
              d={WALL_D}
              fill="rgba(205, 238, 255, 0.07)"
              stroke="rgba(175, 222, 248, 0.78)"
              strokeWidth={2.8}
            />

            {/* ── Layer 4: rim (thick top lip — the most distinctive glass feature) ── */}
            <Rect
              x={RIM_X} y={RIM_Y} width={RIM_W} height={RIM_H} rx={RIM_RX}
              fill="rgba(222, 243, 255, 0.65)"
              stroke="rgba(162, 212, 244, 0.90)"
              strokeWidth={1.5}
            />
            {/* Rim inner highlight strip */}
            <Rect
              x={RIM_X + 5} y={RIM_Y + 3} width={RIM_W - 10} height={4} rx={2}
              fill="rgba(255,255,255,0.58)"
            />

            {/* ── Layer 5: left shine streak (glass wall highlight) ── */}
            <Path
              d={`M ${CAV_TOP_X1 + 5} ${CAV_TOP_Y + 5} L ${CAV_BOT_X1 + 3} ${CAV_BOT_Y - 14}`}
              stroke="rgba(255,255,255,0.50)"
              strokeWidth={4}
              strokeLinecap="round"
            />
            {/* Secondary shorter shine */}
            <Path
              d={`M ${CAV_TOP_X1 + 15} ${CAV_TOP_Y + 9} L ${CAV_TOP_X1 + 17} ${CAV_TOP_Y + 50}`}
              stroke="rgba(255,255,255,0.24)"
              strokeWidth={2.2}
              strokeLinecap="round"
            />

            {/* ── Layer 6: flat base ── */}
            <Rect
              x={BASE_X} y={BASE_Y} width={BASE_W} height={BASE_H} rx={5}
              fill="rgba(168, 208, 232, 0.65)"
              stroke="rgba(148, 196, 226, 0.80)"
              strokeWidth={1}
            />
          </Svg>

          {/* Check badge sits over the SVG (native Animated.View, not SVG) */}
          {drunk && (
            <Animated.View style={[glassStyles.checkBadge, { opacity: checkAnim, transform: [{ scale: checkAnim }] }]}>
              <CheckCircle2 size={22} color={W.accent} strokeWidth={2.4} />
            </Animated.View>
          )}
        </View>
      </TouchableOpacity>

      {/* Label */}
      <View style={glassStyles.labelRow}>
        <Droplets size={13} color={drunk ? W.accent : colors.softGray} strokeWidth={2.2} />
        <Text style={[glassStyles.label, { color: drunk ? W.accentDark : colors.warmGray }]}>
          Glass {index + 1}
        </Text>
      </View>
    </Animated.View>
  );
}

const glassStyles = StyleSheet.create({
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 14,
    padding: 2,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label: { fontSize: 13, fontWeight: '600' },
});

// ─── Tip pill ─────────────────────────────────────────────────────────────────
function TipPill({ Icon, text }: { Icon: React.ComponentType<any>; text: string }) {
  return (
    <View style={tipStyles.pill}>
      <Icon size={14} color={W.accent} strokeWidth={2.2} />
      <Text style={tipStyles.text}>{text}</Text>
    </View>
  );
}
const tipStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: W.accentLight, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: W.accentBorder,
  },
  text: { fontSize: 12, color: W.accentDark, fontWeight: '600' },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DailyCheckMorning() {
  const router = useRouter();
  const [drunk, setDrunk] = useState([false, false]);

  const ctaFade     = useRef(new Animated.Value(0)).current;
  const ctaSlide    = useRef(new Animated.Value(16)).current;
  const headerFade  = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(14)).current;

  const tap = (i: number) => {
    if (drunk[i]) return;
    setDrunk((prev) => prev.map((v, idx) => (idx === i ? true : v)));
  };

  const drank = drunk.filter(Boolean).length;
  const both  = drunk.every(Boolean);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade,  { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (both) {
      Animated.parallel([
        Animated.timing(ctaFade,  { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(ctaSlide, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
    }
  }, [both]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={16} color={colors.warmGray} strokeWidth={2} />
          <Text style={styles.backText}>back</Text>
        </TouchableOpacity>

        {/* Hero card */}
        <Animated.View style={[styles.heroCard, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
          <SoftGradient
            colors={['#C8E6F5', '#DFF0FA', '#F2F8FD']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroBadge}>
              <Droplets size={22} color={W.accent} strokeWidth={2} />
            </View>
            <Text style={styles.eyebrow}>01 · MORNING ENERGY</Text>
            <Text style={styles.heroTitle}>Morning{'\n'}Hydration</Text>
            <Text style={styles.heroSub}>
              Two glasses of water in the morning activates your metabolism and clears mental fog.
            </Text>
            <View style={styles.progressRow}>
              {[0, 1].map((i) => (
                <View key={i} style={[styles.progressSeg, { backgroundColor: drunk[i] ? W.accent : W.accentMid + '55' }]} />
              ))}
              <Text style={styles.progressLabel}>{drank} of 2</Text>
            </View>
          </SoftGradient>
        </Animated.View>

        {/* Glasses */}
        <View style={styles.stage}>
          <View style={styles.glassesRow}>
            {drunk.map((d, i) => (
              <WaterGlass key={i} index={i} drunk={d} onPress={() => tap(i)} />
            ))}
          </View>

          {both ? (
            <Animated.View style={[styles.completionBanner, { opacity: ctaFade }]}>
              <View style={styles.completionIconWrap}>
                <Waves size={20} color={W.accent} strokeWidth={2.2} />
              </View>
              <View>
                <Text style={styles.completionTitle}>Well hydrated!</Text>
                <Text style={styles.completionSub}>Your body thanks you.</Text>
              </View>
            </Animated.View>
          ) : (
            <Text style={styles.tapHint}>tap each glass once you've drunk it</Text>
          )}
        </View>

        {/* Tips */}
        <View style={styles.tipsRow}>
          <TipPill Icon={Zap}   text="Boosts metabolism" />
          <TipPill Icon={Brain} text="Clears mental fog"  />
        </View>

        {/* CTA */}
        {both ? (
          <Animated.View style={{ opacity: ctaFade, transform: [{ translateY: ctaSlide }] }}>
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => { markStepDone('morning'); router.back(); }}
              activeOpacity={0.82}
            >
              <CheckCircle2 size={18} color="#fff" strokeWidth={2.5} />
              <Text style={styles.doneBtnText}>Done — back to daily check</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <View style={styles.waitingBtn}>
            <Droplets size={15} color={colors.softGray} strokeWidth={2} />
            <Text style={styles.waitingText}>drink both glasses to complete</Text>
          </View>
        )}

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

  heroCard: {
    borderRadius: 26, overflow: 'hidden', marginBottom: 36,
    borderWidth: 1, borderColor: W.accentBorder,
    ...cardShadow,
  },
  heroGradient: { padding: 24, paddingBottom: 22 },
  heroBadge: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1, borderColor: W.accentBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  eyebrow: { fontSize: 10, letterSpacing: 3.5, fontWeight: '700', color: W.accent, marginBottom: 8, opacity: 0.9 },
  heroTitle: { fontFamily: fonts.serif, fontSize: 34, color: colors.cocoa, letterSpacing: -0.6, lineHeight: 40, marginBottom: 10 },
  heroSub: { fontSize: 13, color: colors.warmGray, lineHeight: 19, marginBottom: 20 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressSeg: { flex: 1, height: 5, borderRadius: 999 },
  progressLabel: { fontSize: 11, fontWeight: '700', color: W.accentDark, marginLeft: 4 },

  stage: { alignItems: 'center', gap: 28, marginBottom: 28 },
  glassesRow: {
    flexDirection: 'row', gap: 36,
    alignItems: 'flex-end', justifyContent: 'center',
  },

  tapHint: { fontSize: 12, color: colors.softGray, textAlign: 'center' },

  completionBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: W.accentLight, borderRadius: 18,
    paddingHorizontal: 18, paddingVertical: 14,
    width: '100%', borderWidth: 1, borderColor: W.accentBorder,
  },
  completionIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#fff', borderWidth: 1, borderColor: W.accentBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  completionTitle: { fontFamily: fonts.serif, fontSize: 17, color: colors.cocoa },
  completionSub: { fontSize: 12, color: colors.warmGray, marginTop: 2 },

  tipsRow: { flexDirection: 'row', gap: 10, marginBottom: 28, flexWrap: 'wrap' },

  doneBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    width: '100%', paddingVertical: 17, borderRadius: 18,
    backgroundColor: W.accent,
    shadowColor: W.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 6,
  },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.1 },

  waitingBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', paddingVertical: 17, borderRadius: 18,
    backgroundColor: colors.paper, borderWidth: 1.5, borderColor: colors.border,
  },
  waitingText: { fontSize: 13, fontWeight: '500', color: colors.softGray },
});
