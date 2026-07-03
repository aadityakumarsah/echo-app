import { supabase } from './supabase';

const BASE = 'https://echo-yg4t.onrender.com';

/** Fetch with one automatic retry on network failure (handles Render cold-start drops). */
async function fetchWithRetry(url: string, options?: RequestInit, retries = 1): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 2000));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
}

async function headers(): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    h['Authorization'] = `Bearer ${session.access_token}`;
  }
  return h;
}

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text || !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface SettingsData {
  user_id: string;
  name: string;
  email: string;
  daily_reminder: boolean;
  streak_notifications: boolean;
  weekly_digest: boolean;
  reminder_time: string;
  updated_at: string;
}

export interface SettingsUpdate {
  name?: string;
  daily_reminder?: boolean;
  streak_notifications?: boolean;
  weekly_digest?: boolean;
  reminder_time?: string;
}

export async function getSettings(): Promise<SettingsData> {
  const res = await fetchWithRetry(`${BASE}/settings`, { headers: await headers() });
  const json = await safeJson(res);
  if (!json.success) throw new Error(json.message ?? 'Failed to load settings');
  return json.data as SettingsData;
}

export async function patchSettings(updates: SettingsUpdate): Promise<SettingsData> {
  const res = await fetchWithRetry(`${BASE}/settings`, {
    method: 'PATCH',
    headers: await headers(),
    body: JSON.stringify(updates),
  });
  const json = await safeJson(res);
  if (!json.success) {
    const firstError = json.errors?.[0];
    throw new Error(firstError?.detail ?? json.message ?? 'Failed to save settings');
  }
  return json.data as SettingsData;
}

// ── Voice sessions ────────────────────────────────────────────────────────────

export interface VoiceSessionStart {
  session_id: string;
  user_id: string;
  created_at: string;
}

export async function startVoiceSession(): Promise<VoiceSessionStart> {
  const res = await fetchWithRetry(`${BASE}/sessions/start`, {
    method: 'POST',
    headers: await headers(),
  }).catch((err) => {
    throw new Error(`Cannot reach backend: ${err.message}`);
  });
  const json = await safeJson(res);
  if (!json.success || !json.data?.session_id) {
    throw new Error(json.message ?? `Backend error ${res.status} on /sessions/start`);
  }
  return json.data as VoiceSessionStart;
}

export type MoodLabel =
  | 'anxious'
  | 'calm'
  | 'hopeful'
  | 'reflective'
  | 'frustrated'
  | 'overwhelmed'
  | 'grateful'
  | 'sad'
  | 'excited'
  | 'angry'
  | 'disappointed'
  | 'happy'
  | 'surprised'
  | 'confused'
  | 'bored'
  | 'neutral';

export interface CallReportMoodPoint {
  score: number;
  label: MoodLabel;
}

export interface CallReportTheme {
  label: string;
  summary: string;
}

export interface CallReportThing {
  narrative: string;
  label?: string;
  category: 'work' | 'social' | 'health' | 'personal' | 'other';
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface CallReportInsight {
  type: 'pattern' | 'moment' | 'suggestion';
  body: string;
}

export interface CallReportData {
  session_id: string;
  duration_seconds: number;
  user_words_spoken: number;
  session_overview: [string, string, string];
  one_word_summary: string;
  average_mood_rating: number;
  energy_level: number;
  mood_across_session: CallReportMoodPoint[];
  themes_discussed: CallReportTheme[];
  things_you_did_today: CallReportThing[];
  gratitude: string[];
  insights: CallReportInsight[];
  suggestions: string[];
  personal_reflection?: string;
}

export interface ConversationTurn {
  role: string;
  message: string;
  created_at: string;
}

export interface SessionDetailData {
  session_id: string;
  user_id: string;
  created_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  report: CallReportData | null;
  conversation: ConversationTurn[];
}

export async function listSessions(params?: {
  date?: string;
  tzOffsetMinutes?: number;
}): Promise<SessionDetailData[]> {
  try {
    const search = new URLSearchParams();
    if (params?.date) search.set('date', params.date);
    if (typeof params?.tzOffsetMinutes === 'number') {
      search.set('tz_offset_minutes', String(params.tzOffsetMinutes));
    }
    const qs = search.toString();
    const res = await fetchWithRetry(`${BASE}/sessions${qs ? `?${qs}` : ''}`, {
      headers: await headers(),
    });
    const json = await safeJson(res);
    if (!json.success) throw new Error(json.message ?? 'Failed to load sessions');
    return json.data as SessionDetailData[];
  } catch (e) {
    console.warn('listSessions:', e);
    return [];
  }
}

export async function getSession(sessionId: string): Promise<SessionDetailData> {
  const res = await fetchWithRetry(`${BASE}/sessions/${encodeURIComponent(sessionId)}`, {
    headers: await headers(),
  });
  const json = await safeJson(res);
  if (!json.success) throw new Error(json.message ?? 'Failed to load session');
  return json.data as SessionDetailData;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetchWithRetry(`${BASE}/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: await headers(),
  });
  const json = await safeJson(res);
  if (!json.success) throw new Error(json.message ?? `Server error ${res.status}`);
}

// ── Daily checks ──────────────────────────────────────────────────────────────

export type DailyStep = 'morning' | 'refill' | 'night';

export interface DailyChecksState {
  check_date: string;
  morning: boolean;
  refill: boolean;
  night: boolean;
  day_complete: boolean;
  completed_at: string | null;
  current_streak: number;
  longest_streak: number;
  last_check_date: string | null;
}

export interface DailyCheckDay {
  check_date: string;
  morning: boolean;
  refill: boolean;
  night: boolean;
  day_complete: boolean;
}

/** Returns today's local date as YYYY-MM-DD using device timezone. */
export function localDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Mark a single step complete for today. Returns the full updated state. */
export async function markCheckStep(step: DailyStep): Promise<DailyChecksState> {
  const res = await fetchWithRetry(`${BASE}/daily-checks/mark`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ step, check_date: localDateString() }),
  }).catch((err) => {
    throw new Error(`Network error: ${err.message}`);
  });
  const json = await safeJson(res);
  if (!json.success) throw new Error(json.message ?? 'Failed to mark step');
  return json.data as DailyChecksState;
}

/** Fetch today's completion state + streak from Supabase. */
export async function getDailyChecksToday(): Promise<DailyChecksState> {
  const today = localDateString();
  const res = await fetchWithRetry(`${BASE}/daily-checks/today?check_date=${encodeURIComponent(today)}`, {
    headers: await headers(),
  }).catch((err) => {
    throw new Error(`Network error: ${err.message}`);
  });
  const json = await safeJson(res);
  if (!json.success) throw new Error(json.message ?? 'Failed to load daily checks');
  return json.data as DailyChecksState;
}

/** Fetch last `days` days of completion for the weekly dots view. */
export async function getDailyChecksHistory(days = 7): Promise<DailyCheckDay[]> {
  const today = localDateString();
  const res = await fetch(
    `${BASE}/daily-checks/history?days=${days}&end_date=${encodeURIComponent(today)}`,
    { headers: await headers() },
  ).catch((err) => {
    throw new Error(`Network error: ${err.message}`);
  });
  const json = await safeJson(res);
  if (!json.success) throw new Error(json.message ?? 'Failed to load history');
  return json.data as DailyCheckDay[];
}

export async function generateSessionReport(sessionId: string): Promise<SessionDetailData> {
  if (sessionId.startsWith('local-')) throw new Error('Cannot generate report for a local session');
  const res = await fetchWithRetry(`${BASE}/sessions/${encodeURIComponent(sessionId)}/report`, {
    method: 'POST',
    headers: await headers(),
  }).catch((err) => {
    throw new Error(`Network error — is the backend running? (${err.message})`);
  });
  const json = await safeJson(res);
  if (!json.success) throw new Error(json.message ?? `Server error ${res.status}`);
  return json.data as SessionDetailData;
}
