import { useEffect, useRef } from "react";
import { Platform, StyleSheet, UIManager, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

// ─── Lottie gate ─────────────────────────────────────────────────────────────
let LottieView: any = null;
try {
  LottieView = require("lottie-react-native").default ?? require("lottie-react-native");
} catch {}

const LOTTIE_OK =
  LottieView != null &&
  !!(
    (UIManager as any).getViewManagerConfig?.("LottieAnimationView") ||
    (UIManager as any).hasViewManagerConfig?.("LottieAnimationView")
  );

const FLOWER_SOURCES = [
  require("../../assets/nc-flower-grow-a.json"),
  require("../../assets/nc-flower-grow-b.json"),
];
const FLOWER_END_FRAME = 59;

type Props = {
  variant: 0 | 1;
  idle: boolean;
  growGeneration?: number;
  layoutScale: number;
  swayDelayMs?: number;
};

export function NcFlowerSpot({ variant, idle, growGeneration = 0, layoutScale, swayDelayMs = 0 }: Props) {
  const lottieRef = useRef<any>(null);
  const rot   = useSharedValue(0);
  const swayX = useSharedValue(0);

  useEffect(() => {
    if (!idle) return;
    const t = setTimeout(() => {
      rot.value = withRepeat(withSequence(
        withTiming( 5, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
        withTiming(-5, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
      ), -1, true);
      swayX.value = withRepeat(withSequence(
        withTiming( 3, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
        withTiming(-3, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
      ), -1, true);
    }, swayDelayMs);
    return () => clearTimeout(t);
  }, [idle, rot, swayDelayMs, swayX]);

  const swayStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swayX.value }, { rotate: `${rot.value}deg` }],
  }));

  const baseW = 135 * layoutScale;
  const baseH = 184 * layoutScale;

  // If Lottie isn't linked yet, render nothing — no crash
  if (!LOTTIE_OK || !LottieView) return null;

  const animationNode = idle ? (
    <LottieView
      ref={lottieRef}
      source={FLOWER_SOURCES[variant]}
      style={{ width: baseW, height: baseH }}
      resizeMode="contain"
      loop={false}
      autoPlay={false}
      {...(Platform.OS === "web"
        ? {
            onAnimationLoaded: () => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  lottieRef.current?.play(FLOWER_END_FRAME, FLOWER_END_FRAME);
                  lottieRef.current?.pause();
                });
              });
            },
          }
        : { progress: 1 })}
      renderMode={Platform.OS === "android" ? "SOFTWARE" : "AUTOMATIC"}
    />
  ) : (
    <LottieView
      key={`grow-${growGeneration}`}
      ref={lottieRef}
      source={FLOWER_SOURCES[variant]}
      style={{ width: baseW, height: baseH }}
      resizeMode="contain"
      autoPlay
      loop={false}
      renderMode={Platform.OS === "android" ? "SOFTWARE" : "AUTOMATIC"}
    />
  );

  return (
    <View style={styles.clip}>
      {idle ? (
        <Animated.View style={[styles.swayOrigin, swayStyle]}>{animationNode}</Animated.View>
      ) : (
        <View style={styles.swayOrigin}>{animationNode}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clip:       { overflow: "visible", alignItems: "center", justifyContent: "flex-end" },
  swayOrigin: { alignItems: "center", justifyContent: "flex-end" },
});
