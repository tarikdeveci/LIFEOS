// Design tokens — Light & Dark, 2026 liquid glass language

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  full: 9999,
}

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
}

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 34,
}

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
}

// Accent & semantic colors (same for both modes)
export const palette = {
  accent:    '#6366F1',
  accent2:   '#818CF8',
  success:   '#10B981',
  warning:   '#F59E0B',
  danger:    '#EF4444',
  info:      '#3B82F6',

  // Block type colors
  task:      '#6366F1',
  routine:   '#10B981',
  break:     '#94A3B8',
  focus:     '#F59E0B',
  meal:      '#EC4899',
  workout:   '#EF4444',

  // Task status
  backlog:    '#94A3B8',
  planned:    '#6366F1',
  inProgress: '#F59E0B',
  blocked:    '#EF4444',
  done:       '#10B981',
  deferred:   '#8B5CF6',
}

export const light = {
  // Backgrounds
  bg:         '#F1F3F9',
  bgSurface:  '#FFFFFF',
  bgElevated: '#FFFFFF',

  // Glass surfaces
  glass:        'rgba(255,255,255,0.65)',
  glassBorder:  'rgba(255,255,255,0.90)',
  glassInner:   'rgba(255,255,255,0.30)',
  glassShimmer: 'rgba(255,255,255,0.50)',

  // Text
  textPrimary:   '#0F172A',
  textSecondary: '#334155',
  textMuted:     '#64748B',
  textSubtle:    '#94A3B8',
  textInverse:   '#FFFFFF',

  // Borders
  border:        'rgba(15,23,42,0.08)',
  borderStrong:  'rgba(15,23,42,0.16)',

  // Input
  inputBg:          'rgba(255,255,255,0.80)',
  inputBorder:      'rgba(15,23,42,0.12)',
  inputPlaceholder: '#94A3B8',
  inputText:        '#0F172A',

  // Tab bar
  tabBg:     'rgba(255,255,255,0.75)',
  tabBorder: 'rgba(255,255,255,0.90)',
  tabActive:  '#6366F1',
  tabInactive:'#94A3B8',

  // Shadow
  shadowColor: '#1E293B',
  shadowSoft:  { shadowColor: '#1E293B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.10, shadowRadius: 24, elevation: 8 },
  shadowCard:  { shadowColor: '#1E293B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },

  // Gradient (bg)
  gradientColors: ['#E8ECFA', '#F1F3F9', '#EEF0FB'] as string[],
}

export const dark = {
  // Backgrounds
  bg:         '#0A0E1A',
  bgSurface:  '#111827',
  bgElevated: '#1E2336',

  // Glass surfaces
  glass:        'rgba(30,35,54,0.70)',
  glassBorder:  'rgba(255,255,255,0.10)',
  glassInner:   'rgba(255,255,255,0.05)',
  glassShimmer: 'rgba(255,255,255,0.08)',

  // Text
  textPrimary:   '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted:     '#94A3B8',
  textSubtle:    '#64748B',
  textInverse:   '#0F172A',

  // Borders
  border:        'rgba(255,255,255,0.08)',
  borderStrong:  'rgba(255,255,255,0.16)',

  // Input
  inputBg:          'rgba(255,255,255,0.06)',
  inputBorder:      'rgba(255,255,255,0.12)',
  inputPlaceholder: '#64748B',
  inputText:        '#F8FAFC',

  // Tab bar
  tabBg:     'rgba(15,20,35,0.85)',
  tabBorder: 'rgba(255,255,255,0.10)',
  tabActive:  '#818CF8',
  tabInactive:'#64748B',

  // Shadow
  shadowColor: '#000000',
  shadowSoft:  { shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.40, shadowRadius: 24, elevation: 8 },
  shadowCard:  { shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.30, shadowRadius: 12, elevation: 3 },

  // Gradient (bg)
  gradientColors: ['#0A0E1A', '#0D1220', '#0A0E1A'] as string[],
}

export type ColorScheme = typeof light
