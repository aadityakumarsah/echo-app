// Sends the Supabase session JWT — no separate clario-token needed.
import { supabase } from './supabase';
import { clearSubCache } from './subCache';

const BASE = 'https://echo-yg4t.onrender.com';

export interface SubscriptionStatus {
  active: boolean;
  plan: string | null;
  expires_at: string | null;
  started_at: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return headers;
}

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  try {
    const res = await fetch(`${BASE}/payments/status`, {
      headers: await authHeaders(),
    });
    if (!res.ok) return { active: false, plan: null, expires_at: null, started_at: null };
    return await res.json();
  } catch {
    return { active: false, plan: null, expires_at: null, started_at: null };
  }
}

class NoRetryError extends Error {
  constructor(msg: string) { super(msg); this.name = 'NoRetryError'; }
}

// 3 attempts × 6s = 18s max (was 8 × 6s = 48s)
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 6000): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, delayMs));
    try { return await fn(); } catch (e) {
      if (e instanceof NoRetryError) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function createCheckoutSession(
  plan: 'weekly' | 'monthly' | 'yearly',
): Promise<{ url: string; sessionId: string }> {
  return withRetry(async () => {
    const res = await fetch(`${BASE}/payments/create-checkout-session`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        plan,
        success_url: `${BASE}/payments/checkout-return`,
        cancel_url: `${BASE}/payments/checkout-cancel`,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.detail ?? `Failed to create checkout session (${res.status})`;
      // Don't retry on 4xx (bad request/auth) — only retry on server errors
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new NoRetryError(msg);
      }
      throw new Error(msg);
    }

    const data = await res.json();
    return { url: data.url as string, sessionId: data.session_id as string };
  });
}

export async function syncSubscription(sessionId: string): Promise<void> {
  await withRetry(async () => {
    const res = await fetch(
      `${BASE}/payments/sync?session_id=${encodeURIComponent(sessionId)}`,
      { method: 'POST', headers: await authHeaders() },
    );
    if (res.ok) return;
    const err = await res.json().catch(() => ({}));
    const msg = err.detail ?? `Sync failed (${res.status})`;
    // 401/403 — auth problem, no point retrying
    if (res.status === 401 || res.status === 403) throw new NoRetryError(msg);
    throw new Error(msg);
  });
}

/** Force-refresh subscription status: clears cache then fetches fresh from server. */
export async function refreshSubscription(): Promise<SubscriptionStatus> {
  await clearSubCache();
  return getSubscriptionStatus();
}
