/**
 * SoftGradient — LinearGradient that degrades gracefully.
 *
 * expo-linear-gradient is a native module; if the running binary doesn't have it
 * registered yet (JS hot-loaded into an older build), rendering <LinearGradient>
 * shows a redbox "Unimplemented component" overlay. This wrapper probes the
 * native view-manager registry and falls back to a solid tinted View instead.
 */
import React from 'react';
import { View, UIManager, ViewStyle, StyleProp } from 'react-native';

let LinearGradient: React.ComponentType<any> | null = null;
try {
  LinearGradient = require('expo-linear-gradient').LinearGradient;
} catch {
  LinearGradient = null;
}

// True only when the native side actually registered the gradient view.
const GRADIENT_AVAILABLE =
  LinearGradient != null &&
  !!(UIManager.getViewManagerConfig?.('ExpoLinearGradient') ||
     (UIManager as any).hasViewManagerConfig?.('ExpoLinearGradient'));

interface Props {
  colors: readonly [string, string, ...string[]];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function SoftGradient({ colors, start, end, style, children }: Props) {
  if (GRADIENT_AVAILABLE && LinearGradient) {
    return (
      <LinearGradient colors={colors} start={start} end={end} style={style}>
        {children}
      </LinearGradient>
    );
  }
  // Fallback: solid fill using the gradient's mid/last tone.
  const fallback = colors[colors.length - 1];
  return <View style={[style, { backgroundColor: fallback }]}>{children}</View>;
}
