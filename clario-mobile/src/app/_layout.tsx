import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { syncSubscription, getSubscriptionStatus } from '@/lib/subscription';
import { getPendingCheckout, clearPendingCheckout, writeSubCache } from '@/lib/subCache';
import { emitSubRefreshNeeded } from '@/lib/subEvents';

/**
 * When the user returns from Stripe checkout (Safari → app), check if there's
 * a pending session ID saved before opening the browser. If so, sync it to the
 * database and refresh the subscription cache. Works on simulator AND device,
 * even when the deep link never fires.
 */
function CheckoutSyncGate() {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      const wasBackground = appState.current.match(/inactive|background/);
      appState.current = next;

      if (next === 'active' && wasBackground) {
        const sessionId = await getPendingCheckout();
        if (!sessionId) return;

        // Always clear pending so we don't retry on every foreground event
        await clearPendingCheckout();
        try {
          // Try sync with saved ID (may be checkout session or subscription ID)
          await syncSubscription(sessionId);
        } catch {
          // Sync failed — webhook may have already activated the subscription
        }
        // Fetch fresh status regardless — webhook may have fired while we were in Safari
        const fresh = await getSubscriptionStatus();
        await writeSubCache(fresh);
        emitSubRefreshNeeded();
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}

function AuthGate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

    const inTabsGroup = segments[0] === '(tabs)';
    const inPaywall = segments[0] === 'paywall';

    if (!user && !inPaywall) {
      router.replace('/paywall');
    } else if (user && inPaywall && segments[1] !== 'success') {
      router.replace('/(tabs)/daily-check');
    }
  }, [user, loading, segments]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate />
      <CheckoutSyncGate />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="paywall" />
        <Stack.Screen name="paywall/success" />
        <Stack.Screen name="daily-check-morning" />
        <Stack.Screen name="daily-check-night" />
        <Stack.Screen name="daily-check-refill" />
        <Stack.Screen name="breathe" />
        <Stack.Screen name="relief" />
        <Stack.Screen name="meditation-session" />
        <Stack.Screen name="meditation" options={{ headerShown: false }} />
        <Stack.Screen name="garden" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
