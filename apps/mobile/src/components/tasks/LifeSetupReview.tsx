import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { LifeSetupProposal, SetupGoal, SetupRoutine } from '@lifeos/shared'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'
import { ruleKeysOf, type RuleKey, type Selection, type Written } from './useLifeSetup'

interface Props {
  proposal: LifeSetupProposal
  selection: Selection
  written: Written
  disabled: boolean
  onToggle: (group: 'routines' | 'goals' | 'tasks', index: number) => void
  onToggleRule: (key: RuleKey) => void
}

type T = Record<string, string>

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((acc, [key, value]) => acc.replace(`{${key}}`, String(value)), template)
}

function routineMeta(r: SetupRoutine, t: T): string {
  const days = t['routines_day_names']!.split(',')
  const freq = r.times_per_day ? fill(t['setup_freq_day']!, { n: r.times_per_day })
    : r.times_per_week ? fill(t['setup_freq_week']!, { n: r.times_per_week })
      : !r.days_of_week || r.days_of_week.length === 0 || r.days_of_week.length === 7 ? t['setup_freq_daily']!
        : r.days_of_week.map((d) => days[d] ?? '').join(' ')
  return [
    r.area ? t[`setup_area_${r.area}`] : null,
    freq,
    r.start_time ? (r.end_time ? `${r.start_time} - ${r.end_time}` : r.start_time) : null,
    r.estimated_minutes ? fill(t['setup_minutes']!, { n: r.estimated_minutes }) : null,
    r.target_count ? fill(t['setup_program_days']!, { n: r.target_count }) : null,
    r.target_count && r.start_count ? fill(t['setup_program_start']!, { n: r.start_count }) : null,
  ].filter(Boolean).join(' · ')
}

function goalMeta(g: SetupGoal, t: T): string {
  return [
    t[`setup_horizon_${g.horizon}`],
    g.target ? fill(t['setup_goal_target']!, { n: g.target, unit: g.unit ?? '' }).trim() : null,
    g.steps && g.steps.length > 0 ? fill(t['setup_steps']!, { n: g.steps.length }) : null,
  ].filter(Boolean).join(' · ')
}

function ruleText(proposal: LifeSetupProposal, key: RuleKey, t: T): string {
  const rules = proposal.rules
  if (key === 'max_deep_tasks') return fill(t['setup_rule_max_deep_tasks']!, { n: rules.max_deep_tasks ?? '' })
  if (key === 'buffer_minutes') return fill(t['setup_rule_buffer_minutes']!, { n: rules.buffer_minutes ?? '' })
  if (key === 'rollover') return t[`setup_rule_rollover_${rules.rollover}`] ?? ''
  return fill(t['setup_rule_about']!, { text: rules.about ?? '' })
}

function Badge({ label, tone }: { label: string; tone: 'accent' | 'success' | 'warning' }) {
  const color = tone === 'accent' ? palette.accent : tone === 'success' ? palette.success : palette.warning
  return (
    <View style={{ borderRadius: radius.full, borderWidth: 1, borderColor: color, paddingHorizontal: spacing[2], paddingVertical: 1 }}>
      <Text style={{ fontSize: fontSize.xs, color, fontWeight: fontWeight.medium }}>{label}</Text>
    </View>
  )
}

interface RowProps {
  title: string
  meta?: string
  checked: boolean
  locked: boolean
  onPress: () => void
  badges?: Array<{ label: string; tone: 'accent' | 'success' | 'warning' }>
}

function Row({ title, meta, checked, locked, onPress, badges = [] }: RowProps) {
  const { colors } = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={locked}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: locked }}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], borderRadius: radius.md, backgroundColor: colors.glassInner, padding: spacing[2], opacity: locked ? 0.7 : 1 }}
    >
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={20} color={checked ? palette.accent : colors.textSubtle} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: checked ? colors.textPrimary : colors.textSubtle }}>{title}</Text>
        {meta ? <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{meta}</Text> : null}
        {badges.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], marginTop: 2 }}>
            {badges.map((b) => <Badge key={b.label} label={b.label} tone={b.tone} />)}
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme()
  const { lang } = useLang()
  return (
    <View style={{ gap: spacing[2] }}>
      <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textMuted, letterSpacing: 0.5 }}>{title.toLocaleUpperCase(lang)}</Text>
      {children}
    </View>
  )
}

/** Tek onay ekranının gövdesi: öneri okunur liste, her öğede tik. Yazılan öğeler kilitlenir. */
export function LifeSetupReview({ proposal, selection, written, disabled, onToggle, onToggleRule }: Props) {
  const { colors } = useTheme()
  const { t: tr } = useLang()
  const t = tr as unknown as T
  const ruleKeys = ruleKeysOf(proposal)
  const savedBadge = { label: t['setup_written']!, tone: 'success' as const }
  const empty = proposal.routines.length + proposal.goals.length + proposal.tasks.length + ruleKeys.length === 0

  return (
    <View style={{ gap: spacing[4] }}>
      <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 }}>{t['setup_review_hint']}</Text>
      {proposal.summary !== '' && (
        <Text style={{ fontSize: fontSize.sm, color: colors.textPrimary, lineHeight: 20 }}>{proposal.summary}</Text>
      )}
      {empty && <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{t['setup_empty']}</Text>}

      {proposal.routines.length > 0 && (
        <Section title={t['setup_sec_routines']!}>
          {proposal.routines.map((r, i) => (
            <Row
              key={`r${i}`}
              title={r.title}
              meta={routineMeta(r, t)}
              checked={selection.routines[i] ?? false}
              locked={disabled || !!written.routines[i]}
              onPress={() => onToggle('routines', i)}
              badges={[
                ...(r.is_protected ? [{ label: t['setup_protected']!, tone: 'accent' as const }] : []),
                ...(r.is_untracked ? [{ label: t['setup_untracked']!, tone: 'accent' as const }] : []),
                ...(written.routines[i] ? [savedBadge] : []),
              ]}
            />
          ))}
        </Section>
      )}

      {proposal.goals.length > 0 && (
        <Section title={t['setup_sec_goals']!}>
          {proposal.goals.map((g, i) => (
            <Row
              key={`g${i}`}
              title={g.title}
              meta={goalMeta(g, t)}
              checked={selection.goals[i] ?? false}
              locked={disabled || (written.goals[i] ?? 0) > 0}
              onPress={() => onToggle('goals', i)}
              badges={written.goals[i] === 2 ? [savedBadge] : written.goals[i] === 1 ? [{ label: t['setup_goal_partial']!, tone: 'warning' }] : []}
            />
          ))}
        </Section>
      )}

      {proposal.tasks.length > 0 && (
        <Section title={t['setup_sec_tasks']!}>
          {proposal.tasks.map((task, i) => (
            <Row
              key={`t${i}`}
              title={task.title}
              meta={[task.area ? t[`setup_area_${task.area}`] : null, task.estimated_minutes ? fill(t['setup_minutes']!, { n: task.estimated_minutes }) : null].filter(Boolean).join(' · ')}
              checked={selection.tasks[i] ?? false}
              locked={disabled || !!written.tasks[i]}
              onPress={() => onToggle('tasks', i)}
              badges={written.tasks[i] ? [savedBadge] : []}
            />
          ))}
        </Section>
      )}

      {ruleKeys.length > 0 && (
        <Section title={t['setup_sec_rules']!}>
          {ruleKeys.map((key) => (
            <Row
              key={key}
              title={ruleText(proposal, key, t)}
              checked={selection.rules[key] ?? false}
              locked={disabled || !!written.rules[key]}
              onPress={() => onToggleRule(key)}
              badges={written.rules[key] ? [savedBadge] : []}
            />
          ))}
        </Section>
      )}

      {proposal.unsupported.length > 0 && (
        <Section title={t['setup_sec_unsupported']!}>
          <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing[3], gap: spacing[1] }}>
            <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{t['setup_unsupported_note']}</Text>
            {proposal.unsupported.map((item, i) => (
              <Text key={i} style={{ fontSize: fontSize.sm, color: colors.textPrimary, lineHeight: 20 }}>{`• ${item}`}</Text>
            ))}
          </View>
        </Section>
      )}
    </View>
  )
}
