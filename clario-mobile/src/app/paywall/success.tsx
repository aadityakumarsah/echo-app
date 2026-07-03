import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, AlertCircle } from 'lucide-react-native';
import { syncSubscription, getSubscriptionStatus } from '@/lib/subscription';
import { writeSubCache } from '@/lib/subCache';
import { emitSubRefreshNeeded } from '@/lib/subEvents';
import { colors, fonts, cardShadow } from '@/lib/theme';

export default function PaywallSuccess() {
  // Dodo Payments deep link: clariomobile://paywall/success?subscription_id=sub_xxx&status=active
  const params = useLocalSearchParams<{
    subscription_id?: string;
    session_id?: string;
    status?: string;
  }>();
  const sessionId  = params.subscription_id ?? params.session_id;
  const dodoStatus = params.status; // "active" when Dodo confirms payment
  const router = useRouter();

  const [state, setState] = useState<'syncing' | 'done' | 'error'>('syncing');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const scale = useRef(new Animated.Value(0.7)).current;
  const fade  = useRef(new Animated.Value(0)).current;

  const showDone = () => {
    setState('done');
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 65, friction: 10, useNativeDriver: true }),
      Animated.timing(fade,  { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
    setTimeout(() => router.replace('/(tabs)/dashboard'), 2500);
  };

  useEffect(() => {
    (async () => {
      // Dodo redirect with status=active is trusted proof of payment.
      // Activate locally right away — sync in background so the DB catches up.
      if (dodoStatus === 'active') {
        await writeSubCache({ active: true, plan: null, expires_at: null, started_at: null });
        emitSubRefreshNeeded();
        showDone();
        // Background sync — doesn't block the user
        if (sessionId) {
          syncSubscription(sessionId).catch((e) => console.warn('Background sync failed:', e));
        }
        return;
      }

      // No Dodo status — wait on backend sync
      try {
        if (sessionId) {
          await syncSubscription(sessionId);
        }
        const fresh = await getSubscriptionStatus();
        await writeSubCache(fresh);
        emitSubRefreshNeeded();
        showDone();
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Could not confirm your subscription. Please contact support.',
        );
        setState('error');
        Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.center}>
        {state === 'syncing' && (
          <Animated.View style={[styles.card, { opacity: fade }]}>
            <ActivityIndicator size="large" color={colors.lavenderDeep ?? '#8B6FD4'} style={{ marginBottom: 20 }} />
            <Text style={styles.heading}>Confirming your subscription…</Text>
            <Text style={styles.sub}>Just a moment while we set everything up.</Text>
          </Animated.View>
        )}

        {state === 'done' && (
          <Animated.View style={[styles.card, { opacity: fade, transform: [{ scale }] }]}>
            <View style={styles.iconRing}>
              <CheckCircle2 size={40} color="#22C55E" strokeWidth={1.8} />
            </View>
            <Text style={styles.heading}>You're all set!</Text>
            <Text style={styles.sub}>
              Your subscription is active. Welcome to Clario Premium.
            </Text>
            <Text style={styles.redirect}>Taking you to the app…</Text>
          </Animated.View>
        )}

        {state === 'error' && (
          <Animated.View style={[styles.card, { opacity: fade }]}>
            <View style={[styles.iconRing, { backgroundColor: '#FEF2F2' }]}>
              <AlertCircle size={40} color="#EF4444" strokeWidth={1.8} />
            </View>
            <Text style={styles.heading}>Something went wrong</Text>
            <Text style={styles.sub}>{errorMsg}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => router.replace('/(tabs)/dashboard')}
              activeOpacity={0.8}
            >
              <Text style={styles.retryText}>Go to dashboard anyway</Text>
            </TouchableOpacity>
            <Text style={styles.supportNote}>
              If you were charged, your subscription is active — it may just take a minute to appear.
            </Text>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },

  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.paper,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 32,
    alignItems: 'center',
    ...cardShadow,
  },

  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  heading: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.cocoa,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 14,
    color: colors.warmGray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  redirect: {
    fontSize: 12,
    color: colors.softGray,
    textAlign: 'center',
  },

  retryBtn: {
    backgroundColor: colors.cocoa,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 28,
    marginBottom: 14,
  },
  retryText: { color: colors.cream, fontWeight: '600', fontSize: 14 },

  supportNote: {
    fontSize: 11,
    color: colors.softGray,
    textAlign: 'center',
    lineHeight: 17,
  },
});
