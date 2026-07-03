import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isTrialActive, getTrialDaysLeft } from '../lib/trial';
import { getSubscriptionStatus, refreshSubscription, SubscriptionStatus } from '../lib/subscription';
import { readSubCache, writeSubCache } from '../lib/subCache';
import { onSubRefreshNeeded } from '../lib/subEvents';

export { clearSubCache } from '../lib/subCache';

// In-flight promise shared across instances
let _inflight: Promise<SubscriptionStatus> | null = null;

function fetchSub(): Promise<SubscriptionStatus> {
  if (!_inflight) {
    _inflight = getSubscriptionStatus()
      .then((s) => {
        writeSubCache(s);
        return s;
      })
      .catch(() => ({ active: false, plan: null, expires_at: null, started_at: null }))
      .finally(() => {
        _inflight = null;
      });
  }
  return _inflight;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface AccessState {
  hasAccess: boolean;
  isPremium: boolean;
  trialDaysLeft: number;
  plan: string | null;
  expiresAt: string | null;
  startedAt: string | null;
  loading: boolean;
  /** Force-refresh subscription status from server, bypassing cache. */
  refresh: () => Promise<void>;
}

const EMPTY_SUB: SubscriptionStatus = { active: false, plan: null, expires_at: null, started_at: null };

export function useAccess(): AccessState {
  const { user, loading: authLoading } = useAuth();
  const [sub, setSub] = useState<SubscriptionStatus>(EMPTY_SUB);
  const [subLoading, setSubLoading] = useState(true);
  const initialised = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setSub(EMPTY_SUB);
      setSubLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      // Try cache first for instant render
      const cached = await readSubCache();
      if (cached && !cancelled) {
        setSub(cached);
        setSubLoading(false);
        initialised.current = true;
      }

      // Always fetch fresh in background
      const fresh = await fetchSub();
      if (!cancelled) {
        setSub(fresh);
        setSubLoading(false);
        initialised.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading]);

  const refresh = useCallback(async () => {
    if (!user) return;
    _inflight = null; // bust any in-flight so next fetch is fresh
    const fresh = await refreshSubscription();
    writeSubCache(fresh);
    setSub(fresh);
  }, [user?.id]);

  // Re-fetch whenever CheckoutSyncGate signals a background payment completed
  useEffect(() => {
    return onSubRefreshNeeded(() => { refresh(); });
  }, [refresh]);

  const createdAt = user?.created_at ?? null;
  const trialActive = isTrialActive(createdAt);
  const trialDaysLeft = getTrialDaysLeft(createdAt);
  const isPremium = sub.active;

  return {
    hasAccess: trialActive || isPremium,
    isPremium,
    trialDaysLeft,
    plan: sub.plan,
    expiresAt: sub.expires_at,
    startedAt: sub.started_at,
    loading: authLoading || subLoading,
    refresh,
  };
}
