/**
 * Clario local notification scheduling.
 * Uses expo-notifications for daily check-in reminders.
 * Gracefully no-ops when native module is unavailable (Expo Go).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ReminderKey = 'morning' | 'refill' | 'night';

const STORAGE_KEY = 'clario-notif-prefs';

export interface NotifPrefs {
  morning: boolean;
  refill:  boolean;
  night:   boolean;
  morningHour: number; morningMin: number;
  refillHour:  number; refillMin:  number;
  nightHour:   number; nightMin:   number;
}

const DEFAULTS: NotifPrefs = {
  morning: false, refill: false, night: false,
  morningHour: 8,  morningMin: 0,
  refillHour:  12, refillMin:  0,
  nightHour:   21, nightMin:   0,
};

const REMINDER_CONFIG: Record<ReminderKey, { title: string; body: string }> = {
  morning: {
    title: '🌅 Good morning, Clario is waiting',
    body:  'Start your morning check-in — breathe, set intentions, begin well.',
  },
  refill: {
    title: '💪 Day Refill time!',
    body:  'Do your 10 squats and recharge your body for the afternoon.',
  },
  night: {
    title: '🌙 End your day with reflection',
    body:  'Your voice agent is ready for your night summary. Let it go.',
  },
};

// Lazy-load expo-notifications so the module doesn't crash in Expo Go
// where the native ExpoPushTokenManager module is absent.
let N: typeof import('expo-notifications') | null = null;
try {
  N = require('expo-notifications');
  N!.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge:  false,
      shouldShowBanner: true,
      shouldShowList:  true,
    }),
  });
} catch {
  // expo-notifications native module not available (Expo Go dev session)
  // All scheduling calls will silently no-op.
}

const ID: Record<ReminderKey, string> = {
  morning: 'clario-morning',
  refill:  'clario-refill',
  night:   'clario-night',
};

// ── Permission ────────────────────────────────────────────────────────────────

export async function requestNotifPermission(): Promise<boolean> {
  if (!N) return false;
  try {
    const { status: existing } = await N.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await N.requestPermissionsAsync();
    return status === 'granted';
  } catch { return false; }
}

export async function getNotifPermission(): Promise<boolean> {
  if (!N) return false;
  try {
    const { status } = await N.getPermissionsAsync();
    return status === 'granted';
  } catch { return false; }
}

// ── Prefs persistence ─────────────────────────────────────────────────────────

export async function loadNotifPrefs(): Promise<NotifPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveNotifPrefs(prefs: NotifPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

// ── Scheduling ────────────────────────────────────────────────────────────────

export async function cancelReminder(key: ReminderKey): Promise<void> {
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(ID[key]);
  } catch { /* not scheduled — ignore */ }
}

export async function scheduleReminder(
  key: ReminderKey,
  hour: number,
  minute: number,
): Promise<void> {
  if (!N) return;
  try {
    await cancelReminder(key);
    await N.scheduleNotificationAsync({
      identifier: ID[key],
      content: {
        title: REMINDER_CONFIG[key].title,
        body:  REMINDER_CONFIG[key].body,
        sound: true,
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } catch { /* silently ignore in Expo Go */ }
}

/** Apply current prefs: schedule enabled reminders, cancel disabled ones. */
export async function applyNotifPrefs(prefs: NotifPrefs): Promise<void> {
  if (!N) return;
  const granted = await getNotifPermission();
  if (!granted) {
    await Promise.all((Object.keys(ID) as ReminderKey[]).map(cancelReminder));
    return;
  }

  const tasks: Promise<void>[] = [];
  if (prefs.morning) tasks.push(scheduleReminder('morning', prefs.morningHour, prefs.morningMin));
  else tasks.push(cancelReminder('morning'));

  if (prefs.refill)  tasks.push(scheduleReminder('refill', prefs.refillHour, prefs.refillMin));
  else tasks.push(cancelReminder('refill'));

  if (prefs.night)   tasks.push(scheduleReminder('night', prefs.nightHour, prefs.nightMin));
  else tasks.push(cancelReminder('night'));

  await Promise.all(tasks);
}
