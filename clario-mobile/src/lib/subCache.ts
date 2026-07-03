/**
 * Subscription status cache — pure AsyncStorage helpers with no React imports.
 * Kept separate so AuthContext can import clearSubCache without creating a
 * require cycle with useAccess.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SubscriptionStatus } from './subscription';

export const SUB_CACHE_KEY = 'clario_sub';
export const SUB_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const PENDING_CHECKOUT_KEY = 'clario_pending_checkout';

export async function readSubCache(): Promise<SubscriptionStatus | null> {
  try {
    const raw = await AsyncStorage.getItem(SUB_CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: SubscriptionStatus; ts: number };
    if (Date.now() - ts > SUB_CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

export async function writeSubCache(s: SubscriptionStatus): Promise<void> {
  try {
    await AsyncStorage.setItem(SUB_CACHE_KEY, JSON.stringify({ data: s, ts: Date.now() }));
  } catch {}
}

export async function clearSubCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SUB_CACHE_KEY);
  } catch {}
}

export async function savePendingCheckout(sessionId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_CHECKOUT_KEY, sessionId);
  } catch {}
}

export async function getPendingCheckout(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PENDING_CHECKOUT_KEY);
  } catch {
    return null;
  }
}

export async function clearPendingCheckout(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_CHECKOUT_KEY);
  } catch {}
}
