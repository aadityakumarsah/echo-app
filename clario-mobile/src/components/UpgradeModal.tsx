import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Animated, Linking, ActivityIndicator,
} from 'react-native';
import { Sparkles, X, Zap, Mic, Heart, BarChart2, Leaf } from 'lucide-react-native';
import { useAccess } from '../hooks/useAccess';
import { createCheckoutSession } from '../lib/subscription';
import { savePendingCheckout } from '../lib/subCache';
import { colors, fonts, cardShadow } from '../lib/theme';

type Plan = 'weekly' | 'monthly' | 'yearly';

const PLANS: { id: Plan; label: string; price: string; period: string; highlight: boolean }[] = [
  { id: 'weekly',  label: 'Weekly',  price: '$3',   period: '/wk',  highlight: false },
  { id: 'monthly', label: 'Monthly', price: '$10',  period: '/mo',  highlight: true  },
  { id: 'yearly',  label: 'Yearly',  price: '$199', period: '/yr',  highlight: false },
];

const INTERVAL_MS = 6 * 60 * 1000; // 6 minutes

export default function UpgradeModal() {
  const { isPremium, loading } = useAccess();
  const [visible, setVisible]         = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetY          = useRef(new Animated.Value(80)).current;
  const sheetOpacity    = useRef(new Animated.Value(0)).current;

  // Show the modal on mount (after a short warm-up) and then every 6 min
  useEffect(() => {
    if (loading || isPremium) return;

    const show = () => {
      setVisible(true);
    };

    // First appearance: 8 seconds after mount so the user has time to settle
    const first = setTimeout(show, 8000);
    // Subsequent: every 6 minutes
    const repeat = setInterval(show, INTERVAL_MS);

    return () => {
      clearTimeout(first);
      clearInterval(repeat);
    };
  }, [loading, isPremium]);

  // Animate in when visible becomes true
  useEffect(() => {
    if (visible) {
      backdropOpacity.setValue(0);
      sheetY.setValue(80);
      sheetOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(sheetY,          { toValue: 0, tension: 70, friction: 11, useNativeDriver: true }),
        Animated.timing(sheetOpacity,    { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(sheetY,          { toValue: 80, duration: 220, useNativeDriver: true }),
      Animated.timing(sheetOpacity,    { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setVisible(false));
  };

  const handleUpgrade = async (plan: Plan) => {
    setLoadingPlan(plan);
    setCheckoutError(null);
    try {
      const { url, sessionId } = await createCheckoutSession(plan);
      await savePendingCheckout(sessionId);
      await Linking.openURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      const isFetch = msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network');
      setCheckoutError(
        isFetch ? 'Could not reach the server. Check your connection and try again.' : msg
      );
    } finally {
      setLoadingPlan(null);
    }
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={dismiss}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { opacity: sheetOpacity, transform: [{ translateY: sheetY }] },
        ]}
        pointerEvents="box-none"
      >
        {/* Dismiss button */}
        <TouchableOpacity style={styles.closeBtn} onPress={dismiss} hitSlop={12} activeOpacity={0.7}>
          <X size={16} color={colors.warmGray} strokeWidth={2} />
        </TouchableOpacity>

        {/* Icon + heading */}
        <View style={styles.iconRing}>
          <Sparkles size={22} color={colors.amberRich} strokeWidth={2} />
        </View>

        <Text style={styles.eyebrow}>UPGRADE YOUR PLAN</Text>
        <Text style={styles.heading}>Unlock everything in Clario</Text>
        <Text style={styles.subheading}>
          Voice journaling, guided meditations, mood tracking and more — unlimited.
        </Text>

        {/* Feature pills */}
        <View style={styles.pills}>
          {[
            { Icon: Mic,      label: 'Voice sessions' },
            { Icon: Heart,    label: 'Meditations' },
            { Icon: BarChart2,label: 'Mood insights' },
            { Icon: Leaf,     label: 'Habit tracking' },
          ].map(({ Icon, label }) => (
            <View key={label} style={styles.pill}>
              <Icon size={12} color={colors.cocoa} strokeWidth={2} />
              <Text style={styles.pillText}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Plan cards */}
        <View style={styles.plans}>
          {PLANS.map(p => (
            <TouchableOpacity
              key={p.id}
              style={[styles.planCard, p.highlight && styles.planCardHL]}
              onPress={() => handleUpgrade(p.id)}
              disabled={loadingPlan !== null}
              activeOpacity={0.85}
            >
              {p.highlight && (
                <View style={styles.popularBadge}>
                  <Zap size={9} color={colors.cream} strokeWidth={2.5} />
                  <Text style={styles.popularText}>POPULAR</Text>
                </View>
              )}
              <Text style={[styles.planPrice, p.highlight && styles.planPriceHL]}>{p.price}</Text>
              <Text style={[styles.planPeriod, p.highlight && styles.planPeriodHL]}>{p.period}</Text>
              <Text style={[styles.planLabel, p.highlight && styles.planLabelHL]}>{p.label}</Text>

              {loadingPlan === p.id ? (
                <ActivityIndicator size="small" color={p.highlight ? colors.cream : colors.cocoa} style={{ marginTop: 8 }} />
              ) : (
                <View style={[styles.planBtn, p.highlight && styles.planBtnHL]}>
                  <Text style={[styles.planBtnText, p.highlight && styles.planBtnTextHL]}>Select</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {checkoutError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{checkoutError}</Text>
            <TouchableOpacity onPress={() => setCheckoutError(null)}>
              <Text style={styles.errorDismiss}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.footer}>Cancel anytime · Secure payment via Stripe</Text>

        {/* Not now */}
        <TouchableOpacity style={styles.notNowBtn} onPress={dismiss} activeOpacity={0.7}>
          <Text style={styles.notNowText}>Not right now</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(58,46,42,0.55)',
  },

  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.cream,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 44,
    alignItems: 'center',
    ...cardShadow,
  },

  closeBtn: {
    position: 'absolute',
    top: 18,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.amberRich + '44',
  },

  eyebrow: {
    fontSize: 10,
    letterSpacing: 3,
    fontWeight: '700',
    color: colors.amberRich,
    marginBottom: 6,
  },

  heading: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.cocoa,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },

  subheading: {
    fontSize: 13,
    color: colors.warmGray,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
    maxWidth: 300,
  },

  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 24,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillText: { fontSize: 11, color: colors.cocoa, fontWeight: '500' },

  errorBox: {
    width: '100%',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  errorText:    { fontSize: 12, color: '#B91C1C', textAlign: 'center', lineHeight: 18 },
  errorDismiss: { fontSize: 11, color: '#DC2626', textDecorationLine: 'underline' },

  // plans row
  plans: { flexDirection: 'row', gap: 10, width: '100%', marginBottom: 16 },

  planCard: {
    flex: 1,
    backgroundColor: colors.paper,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 6,
  },
  planCardHL: {
    backgroundColor: colors.cocoa,
    borderColor: colors.cocoa,
  },

  popularBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.amberRich,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  popularText: { fontSize: 8, fontWeight: '800', color: colors.cream, letterSpacing: 1 },

  planPrice:   { fontFamily: fonts.serif, fontSize: 24, color: colors.cocoa, fontWeight: '700' },
  planPriceHL: { color: colors.cream },
  planPeriod:  { fontSize: 10, color: colors.softGray, marginBottom: 2 },
  planPeriodHL:{ color: colors.cream + '99' },
  planLabel:   { fontSize: 11, color: colors.warmGray, fontWeight: '600', marginBottom: 10 },
  planLabelHL: { color: colors.cream + 'CC' },

  planBtn: {
    backgroundColor: colors.border,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  planBtnHL:   { backgroundColor: colors.amberRich },
  planBtnText: { fontSize: 12, fontWeight: '600', color: colors.cocoa },
  planBtnTextHL:{ color: colors.cream },

  footer: {
    fontSize: 10,
    color: colors.softGray,
    textAlign: 'center',
    marginBottom: 14,
  },

  notNowBtn: { paddingVertical: 6 },
  notNowText: { fontSize: 12, color: colors.softGray, textDecorationLine: 'underline' },
});
