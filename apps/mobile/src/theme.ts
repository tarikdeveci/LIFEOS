/**
 * LifeOS Mobile — Premium Design System
 *
 * Philosophy: clean, high-contrast, intentional.
 * Inspired by Things 3, Linear, Craft — not trying to be Apple visionOS.
 * Cards float above a rich lavender base. Shadows are indigo-tinted, soft.
 * Typography is dark and crisp. Accent is confident indigo.
 */

export const T = {
  // ── Background — rich enough that white cards clearly float above it ──────
  bg: '#D9DFF2',

  // ── Typography ────────────────────────────────────────────────────────────
  text: {
    primary:   '#0D1B3E',
    secondary: '#2E3E6B',
    muted:     '#63709A',
    subtle:    '#97A3C9',
    accent:    '#4A4DE0',
    success:   '#059669',
    warning:   '#B45309',
    danger:    '#DC2626',
  },

  // ── Brand ─────────────────────────────────────────────────────────────────
  accent:  '#6366F1',
  success: '#10B981',
  warning: '#F59E0B',
  danger:  '#EF4444',

  // ── Card — pure white floating on lavender ────────────────────────────────
  card: {
    bg:          '#FFFFFF',
    border:      'rgba(99, 102, 241, 0.08)',
    shadowColor: '#4048C8',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius:  20,
    elevation:     4,
    radius:        20,
    padding:       18,
  },

  // ── Input ─────────────────────────────────────────────────────────────────
  input: {
    bg:          '#F8F9FF',
    border:      'rgba(99, 102, 241, 0.18)',
    borderFocus: 'rgba(99, 102, 241, 0.50)',
    text:        '#0D1B3E',
    placeholder: '#97A3C9',
    radius:      14,
  },

  // ── Buttons ───────────────────────────────────────────────────────────────
  btn: {
    radius: 14,
    primary: {
      bg:               '#6366F1',
      text:             '#FFFFFF',
      shadow:           '#6366F1',
      paddingHorizontal: 18,
      paddingVertical:   12,
    },
    header: {
      bg:               '#6366F1',
      text:             '#FFFFFF',
      paddingHorizontal: 16,
      paddingVertical:   10,
    },
    secondary: {
      bg:               'rgba(99,102,241,0.12)',
      text:             '#6366F1',
      border:           'rgba(99,102,241,0.25)',
      paddingHorizontal: 16,
      paddingVertical:   10,
    },
    ghost: {
      bg:               'transparent',
      border:           'transparent',
      text:             '#6366F1',
      paddingHorizontal: 12,
      paddingVertical:   10,
    },
    danger: {
      bg:               'rgba(239,68,68,0.10)',
      border:           'rgba(239,68,68,0.25)',
      text:             '#DC2626',
      paddingHorizontal: 16,
      paddingVertical:   10,
    },
    pill: {
      bg:          'rgba(13,27,62,0.07)',
      text:        '#63709A',
      active_bg:   '#6366F1',
      active_text: '#FFFFFF',
      paddingHorizontal: 12,
      paddingVertical:   6,
    },
  },

  // ── Status ────────────────────────────────────────────────────────────────
  status: {
    backlog:     { bg: 'rgba(100,116,139,0.10)', text: '#64748B' },
    planned:     { bg: 'rgba(59,130,246,0.12)',  text: '#2563EB' },
    in_progress: { bg: 'rgba(245,158,11,0.12)',  text: '#B45309' },
    blocked:     { bg: 'rgba(239,68,68,0.12)',   text: '#DC2626' },
    done:        { bg: 'rgba(16,185,129,0.12)',  text: '#059669' },
    deferred:    { bg: 'rgba(100,116,139,0.07)', text: '#94A3B8' },
  },

  // ── Block types ───────────────────────────────────────────────────────────
  blockType: {
    task:    '#6366F1',
    routine: '#F59E0B',
    break:   '#10B981',
    focus:   '#EC4899',
    meal:    '#EF4444',
    workout: '#8B5CF6',
  },
} as const

// ── Card styles ───────────────────────────────────────────────────────────
export const GLASS_CARD = {
  borderRadius:    T.card.radius,
  backgroundColor: T.card.bg,
  borderWidth:     1,
  borderColor:     T.card.border,
  shadowColor:     T.card.shadowColor,
  shadowOffset:    T.card.shadowOffset,
  shadowOpacity:   T.card.shadowOpacity,
  shadowRadius:    T.card.shadowRadius,
  elevation:       T.card.elevation,
  marginBottom:    16,
  padding:         T.card.padding,
} as const

export const MODAL_SHEET = {
  borderTopLeftRadius:  28,
  borderTopRightRadius: 28,
  backgroundColor:      '#FFFFFF',
  borderTopWidth:       1,
  borderTopColor:       'rgba(99,102,241,0.10)',
  padding:              24,
  shadowColor:          '#0D1B3E',
  shadowOffset:         { width: 0, height: -6 },
  shadowOpacity:        0.08,
  shadowRadius:         24,
  elevation:            20,
} as const

export const HEADER_BTN = {
  backgroundColor:   T.btn.header.bg,
  paddingHorizontal: T.btn.header.paddingHorizontal,
  paddingVertical:   T.btn.header.paddingVertical,
  borderRadius:      T.btn.radius,
  shadowColor:       T.btn.primary.shadow,
  shadowOffset:      { width: 0, height: 3 },
  shadowOpacity:     0.22,
  shadowRadius:      8,
  elevation:         4,
} as const
