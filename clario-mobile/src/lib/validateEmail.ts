/**
 * Client-side email sanity checks — blocks obviously fake / suspicious
 * addresses before they ever reach Supabase.
 *
 * Note: this cannot prove an inbox exists (only a confirmation email can),
 * but it filters out garbage, disposable domains, and malformed input.
 */

// Basic structure: one @, sane local part, domain with a real TLD (2+ letters)
const EMAIL_RE =
  /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;

// Common disposable / throwaway email domains
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com',
  'sharklasers.com', 'getnada.com', 'maildrop.cc', 'dispostable.com',
  'trashmail.com', 'fakeinbox.com', 'mintemail.com', 'mytemp.email',
  'tempinbox.com', 'mohmal.com', 'emailondeck.com', 'spamgourmet.com',
  'mail-temp.com', 'tempmailo.com', 'burnermail.io', 'mailnesia.com',
  'mailcatch.com', 'inboxkitten.com', 'tmpmail.org', 'tmpmail.net',
  'example.com', 'test.com', 'email.com',
]);

// Obviously fake local parts people type to get past forms
const FAKE_LOCAL_PARTS = new Set([
  'test', 'fake', 'asdf', 'qwerty', 'abc', 'aaa', 'xxx', 'noemail', 'none',
]);

export interface EmailCheck {
  valid: boolean;
  reason?: string;
}

export function validateEmail(raw: string): EmailCheck {
  const email = raw.trim().toLowerCase();

  if (!email) return { valid: false, reason: 'Please enter your email.' };
  if (email.length > 100) {
    return { valid: false, reason: 'Email is too long.' };
  }
  if (!EMAIL_RE.test(email)) {
    return { valid: false, reason: 'Please enter a valid email address.' };
  }

  const [local, domain] = email.split('@');

  if (local.length > 64) {
    return { valid: false, reason: 'Email is too long.' };
  }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: 'Temporary email addresses are not allowed. Please use your real email.' };
  }
  if (FAKE_LOCAL_PARTS.has(local)) {
    return { valid: false, reason: 'Please use your real email address.' };
  }
  // Repeated single character (aaaa@, bbbbbb@) — classic keyboard mash
  if (local.length >= 4 && /^(.)\1+$/.test(local)) {
    return { valid: false, reason: 'Please use your real email address.' };
  }

  return { valid: true };
}
