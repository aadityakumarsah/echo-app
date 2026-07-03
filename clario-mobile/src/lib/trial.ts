// Trial is based on Supabase user.created_at — server-side, cannot be faked
// by clearing AsyncStorage.

const TRIAL_DAYS = 3;

export function isTrialActive(userCreatedAt: string | null | undefined): boolean {
  if (!userCreatedAt) return false;
  const expiry = new Date(new Date(userCreatedAt).getTime() + TRIAL_DAYS * 864e5);
  return Date.now() < expiry.getTime();
}

export function getTrialDaysLeft(userCreatedAt: string | null | undefined): number {
  if (!userCreatedAt) return 0;
  const expiry = new Date(new Date(userCreatedAt).getTime() + TRIAL_DAYS * 864e5);
  const ms = expiry.getTime() - Date.now();
  return ms <= 0 ? 0 : Math.min(TRIAL_DAYS, Math.ceil(ms / 864e5));
}
