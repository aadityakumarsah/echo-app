/**
 * GardenScene — echo-app garden, adapted for clario daily steps.
 *
 * Plants unlock based on `dayCount` (consecutive success days), matching
 * echo-app's NC_MAJOR_MILESTONES exactly:
 *   day  1 → teapot
 *   day  4 → floral ornament
 *   day  7 → honey bee (moving)
 *   day 12 → autumn leaves
 *   day 21 → tree (wind-swaying)
 *   day 30 → birds
 *   day 45 → berry sprigs
 *   day 60 → background bees
 *   day 75 → second birds
 *   day 80 → second autumn
 *   day 90 → frog
 *
 * The tree is always shown as the base garden anchor (echo default).
 *
 * DEV: pass dayCount={65} to see a rich day-65 garden.
 */
import React, { useEffect } from "react";
import { Image, ImageBackground, Platform, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { NcFlowerSpot } from "./NcFlowerSpot";

// ─── DEV override ─────────────────────────────────────────────────────────────
// Set to a number to preview that day's garden. Set to null for production.
const DEV_DAY: number | null = null;

// ─── Lottie gate ──────────────────────────────────────────────────────────────
let LottieView: React.ComponentType<any> | null = null;
try {
  LottieView = require("lottie-react-native").default ?? require("lottie-react-native");
} catch {}

function SafeLottie({ source, style, autoPlay = true, loop = true }: {
  source: any; style: any; autoPlay?: boolean; loop?: boolean;
}) {
  if (!LottieView) return null;
  return (
    <LottieView
      source={source}
      style={style}
      resizeMode="contain"
      autoPlay={autoPlay}
      loop={loop}
      renderMode={Platform.OS === "android" ? "SOFTWARE" : "AUTOMATIC"}
    />
  );
}

// ─── Assets ───────────────────────────────────────────────────────────────────
const GARDEN_BG   = require("../../assets/nc-garden-bg.png");
const TREE_WIND   = require("../../assets/nc-tree-wind.json");
const TEAPOT      = require("../../assets/nc-teapot.json");
const HONEY_BEE   = require("../../assets/nc-honey-bee.json");
const AUTUMN      = require("../../assets/nc-autumn.json");
const FROG        = require("../../assets/nc-frog.json");
const FLORAL_IMG  = require("../../assets/nc-floral.png");
const BERRY_IMG   = require("../../assets/nc-berry.png");

// ─── Flower slots: one per clario daily step ──────────────────────────────────
const FLOWER_SLOTS = [
  { leftPct: 26, bottomPct: 9,  scale: 0.40, variant: 0 as 0|1, swayDelayMs: 0   }, // morning
  { leftPct: 42, bottomPct: 10, scale: 0.38, variant: 1 as 0|1, swayDelayMs: 500 }, // refill
  { leftPct: 55, bottomPct: 8,  scale: 0.36, variant: 0 as 0|1, swayDelayMs: 250 }, // night
];
const STEP_KEYS = ["morning", "refill", "night"] as const;

// ─── Moving bee ───────────────────────────────────────────────────────────────
function MovingBee({ w, h }: { w: number; h: number }) {
  const x   = useSharedValue(0);
  const y   = useSharedValue(0);
  const rot = useSharedValue(0);

  useEffect(() => {
    x.value = withRepeat(withSequence(
      withTiming(w * 0.30,  { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      withTiming(w * 0.55,  { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      withTiming(w * 0.15,  { duration: 1700, easing: Easing.inOut(Easing.sin) }),
      withTiming(0,         { duration: 1500, easing: Easing.inOut(Easing.sin) }),
    ), -1, false);
    y.value = withRepeat(withSequence(
      withTiming(-h * 0.08, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      withTiming( h * 0.10, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      withTiming( 0,        { duration: 1400, easing: Easing.inOut(Easing.sin) }),
    ), -1, false);
    rot.value = withRepeat(withSequence(
      withTiming( 12, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      withTiming(-12, { duration: 900, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
  }, [h, rot, w, x, y]);

  const beeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${rot.value}deg` }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, beeStyle]}>
      <SafeLottie source={HONEY_BEE} style={{ width: "100%", height: "100%" }} />
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  completedKeys: string[];
  dayCount?: number; // consecutive success days — drives milestone unlocks
  compact?: boolean;
}

export function GardenScene({ completedKeys, dayCount: dayCountProp = 1, compact = false }: Props) {
  const dayCount = DEV_DAY ?? dayCountProp;

  const height = compact ? 160 : 240;

  // milestone unlocks — matches echo-app NC_MAJOR_MILESTONES exactly
  const hasTeapot    = dayCount >= 1;
  const hasFloral    = dayCount >= 4;
  const hasBee       = dayCount >= 7;
  const hasAutumn    = dayCount >= 12;
  const hasTree      = true;              // always visible as garden base
  const hasBerry     = dayCount >= 45;
  const hasAutumn2   = dayCount >= 80;

  return (
    <ImageBackground
      source={GARDEN_BG}
      style={[styles.card, { height }]}
      imageStyle={styles.bgImage}
      resizeMode="cover"
    >
      {/* Tree — always on left, wind-swaying */}
      {hasTree && (
        <View style={{
          position: "absolute",
          left: "-2%",
          bottom: height * 0.04,
          width: "56%",
          height: height * 0.94,
          zIndex: 8,
        }}>
          <SafeLottie source={TREE_WIND} style={{ width: "100%", height: "100%" }} />
        </View>
      )}

      {/* Autumn leaves (day 12+) — upper right */}
      {hasAutumn && (
        <View style={{
          position: "absolute",
          right: "6%",
          top: height * 0.05,
          width: "22%",
          height: height * 0.24,
          zIndex: 9,
        }}>
          <SafeLottie source={AUTUMN} style={{ width: "100%", height: "100%", transform: [{ rotate: "14deg" }] }} />
        </View>
      )}

      {/* Second autumn (day 80+) — upper left */}
      {hasAutumn2 && (
        <View style={{
          position: "absolute",
          left: "6%",
          top: height * 0.05,
          width: "22%",
          height: height * 0.24,
          zIndex: 9,
        }}>
          <SafeLottie source={AUTUMN} style={{ width: "100%", height: "100%", transform: [{ rotate: "-14deg" }] }} />
        </View>
      )}

      {/* Floral ornament (day 4+) — mid left */}
      {hasFloral && (
        <View style={{
          position: "absolute",
          left: "4%",
          bottom: height * 0.25,
          width: "11%",
          height: height * 0.28,
          zIndex: 7,
        }}>
          <Image source={FLORAL_IMG} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
        </View>
      )}

      {/* Berry sprigs (day 45+) — center + far right */}
      {hasBerry && (
        <>
          <View style={{
            position: "absolute",
            left: "40%",
            bottom: height * 0.10,
            width: "18%",
            height: height * 0.26,
            zIndex: 11,
          }}>
            <Image source={BERRY_IMG} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
          </View>
          <View style={{
            position: "absolute",
            right: "2%",
            bottom: height * 0.10,
            width: "16%",
            height: height * 0.24,
            zIndex: 11,
          }}>
            <Image source={BERRY_IMG} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
          </View>
        </>
      )}

      {/* Frog (day 90+) */}
      {dayCount >= 90 && (
        <View style={{
          position: "absolute",
          right: "34%",
          bottom: height * 0.03,
          width: "28%",
          height: height * 0.30,
          zIndex: 23,
        }}>
          <SafeLottie source={FROG} style={{ width: "100%", height: "100%" }} />
        </View>
      )}

      {/* Teapot (day 1+) — bottom right */}
      {hasTeapot && (
        <View style={{
          position: "absolute",
          right: "-2%",
          bottom: "-2%",
          width: "44%",
          height: height * 0.65,
          zIndex: 20,
        }}>
          <SafeLottie source={TEAPOT} style={{ width: "100%", height: "100%" }} />
        </View>
      )}

      {/* Flowers — one per completed daily step */}
      {STEP_KEYS.map((key, idx) => {
        if (!completedKeys.includes(key)) return null;
        const slot   = FLOWER_SLOTS[idx];
        const left: `${number}%` = `${slot.leftPct}%`;
        const bottom = (height * slot.bottomPct) / 100;
        return (
          <View key={key} style={{
            position: "absolute",
            left,
            bottom,
            zIndex: 22,
            width: "22%",
            alignItems: "center",
          }}>
            <NcFlowerSpot
              variant={slot.variant}
              idle={true}
              layoutScale={slot.scale * (compact ? 0.72 : 1)}
              swayDelayMs={slot.swayDelayMs}
            />
          </View>
        );
      })}

      {/* Moving bee (day 7+) */}
      {hasBee && (
        <View style={{
          position: "absolute",
          left: "18%",
          top: height * 0.22,
          width: "16%",
          height: height * 0.16,
          zIndex: 24,
        }}>
          <MovingBee w={100} h={60} />
        </View>
      )}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#E8DFC8",
  },
  bgImage: {
    borderRadius: 0,
  },
});
