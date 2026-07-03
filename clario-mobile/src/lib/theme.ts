/**
 * Clario design system — warm "cream + cocoa" palette.
 * Ported from the echo-app style guide: minimal, calm, light.
 * Never pure white canvas, never pure black, never clinical blue.
 */

export const colors = {
  // canvas & structure
  cream: '#FAF6F1',     // app canvas — never pure white
  paper: '#FFFFFF',     // raised cards, list items
  border: '#E8DED2',    // 0.5–1px separators / card outlines
  footer: '#F5EFE7',    // bottom tab bar background

  // text
  cocoa: '#3A2E2A',     // primary text + primary buttons (never black)
  warmGray: '#8A7468',  // secondary text, inactive tab labels
  softGray: '#A69585',  // tertiary text, timestamps, placeholders

  // emotional palette
  blush: '#F2E6DD',     // grief surfaces, AI incoming bubbles
  rose: '#C88E7A',      // accents inside blush — progress fills, active dots
  roseDeep: '#993356',  // errors / destructive (instead of red)
  sage: '#DDE4E0',      // calm / success surfaces
  moss: '#8FA87C',      // completed rituals, check marks, streak dots
  mossRich: '#6F9A6E',  // "done / finish" CTAs, progress fill
  lavender: '#D8C7DB',  // AI avatar, mic button
  lavenderDeep: '#B79BBF', // richer lavender — Echo/AI dot
  amber: '#F0D9A8',     // morning intention, warmth
  amberRich: '#E0A94A', // morning accent text/icon
  sand: '#E8E4D5',      // neutral stat cards
} as const;

export const fonts = {
  serif: 'Georgia',
  sans: 'System',
} as const;

export const tabBar = {
  surface: colors.footer,
  borderTop: colors.border,
  activeTint: colors.cocoa,
  inactiveTint: colors.warmGray,
} as const;

/**
 * Per-step / per-emotion gradient stops.
 * Each accent maps to a soft 2-stop gradient (light → accent) for cards.
 */
export const gradients: Record<string, [string, string]> = {
  morning: ['#FBEFD6', '#E8C98A'], // amber warmth
  refill:  ['#E4EDE2', '#9FBE93'], // sage → moss
  night:   ['#EDE4F0', '#C3A9CB'], // blush lavender
  ai:      [colors.lavender, colors.lavenderDeep],
  rose:    [colors.blush, colors.rose],
  neutral: [colors.paper, colors.sand],
};

/** Soft warm shadow (never black) — for raised cards. */
export const cardShadow = {
  shadowColor: colors.cocoa,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.1,
  shadowRadius: 14,
  elevation: 4,
};
