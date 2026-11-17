import { useEffect } from 'react'
import { View, Text } from 'react-native'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Segmented } from '../ui/Segmented'
import { Celebration, celebrate } from '../Celebration'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'
import type { FinishSummary, UnfinishedChoice } from '../../hooks/useWorkoutSession'
import { exerciseName } from './labels'

interface Props {
  /** Tamamlanmamış set sayısı; 0 ise seçim satırı hiç görünmez. */
  unfinishedCount: number
  choice: UnfinishedChoice
  onChoice: (choice: UnfinishedChoice) => void
  duration: string
  onChangeDuration: (value: string) => void
  saving: boolean
  error: string | null
  onSave: () => void
  /** Kayıt başarılıysa dolu: sheet'in içeriği özete döner. */
  summary: FinishSummary | null
  onDone: () => void
}

/** Bitir sheet'inin içeriği: süre, yapılmayan set seçimi, kayıttan sonra antrenman özeti. */
export function FinishWorkoutView({ unfinishedCount, choice, onChoice, duration, onChangeDuration, saving, error, onSave, summary, onDone }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()

  return (
    <View style={{ gap: spacing[4] }}>
      <Celebration scope="modal" />
      {summary ? (
        <SummaryBody summary={summary} onDone={onDone} />
      ) : (
        <>
          <Input
            label={t.wk_total_minutes}
            value={duration}
            onChangeText={onChangeDuration}
            keyboardType="number-pad"
            autoFocus
          />
          {unfinishedCount > 0 && (
            <View style={{ gap: spacing[2] }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                {t.wkf_unfinished_n.replace('{n}', String(unfinishedCount))}
              </Text>
              <Segmented<UnfinishedChoice>
                options={[{ key: 'delete', label: t.wkf_unfinished_delete }, { key: 'complete', label: t.wkf_unfinished_complete }]}
                value={choice}
                onChange={onChoice}
                style={{ marginBottom: 0 }}
              />
            </View>
          )}
          {error && (
            <Text accessibilityRole="alert" style={{ fontSize: fontSize.sm, color: palette.danger }}>{error}</Text>
          )}
          <Button label={saving ? t.wk_saving : t.wk_finish} onPress={onSave} loading={saving} fullWidth />
        </>
      )}
    </View>
  )
}

function SummaryBody({ summary, onDone }: { summary: FinishSummary; onDone: () => void }) {
  const { colors } = useTheme()
  const { t, lang } = useLang()

  useEffect(() => { celebrate('modal') }, [])

  const stats: { label: string; value: string }[] = [
    { label: t.wkf_sum_sets, value: String(summary.setCount) },
    { label: t.wkf_sum_volume, value: `${summary.volumeKg} kg` },
    { label: t.wkf_sum_duration, value: `${summary.durationMin} ${t.wkf_minutes_unit}` },
  ]

  return (
    <View style={{ gap: spacing[4] }}>
      <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.wkf_summary_title}</Text>
      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        {stats.map((s) => (
          <View key={s.label} style={{ flex: 1, gap: 4, padding: spacing[3], borderRadius: radius.md, backgroundColor: `${palette.workout}14`, borderWidth: 1, borderColor: `${palette.workout}28` }}>
            <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{s.label}</Text>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{s.value}</Text>
          </View>
        ))}
      </View>
      {summary.records.length > 0 && (
        <View style={{ gap: spacing[2] }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.wkf_sum_records}</Text>
          {summary.records.map((r) => {
            const ex = summary.exercises.find((e) => e.id === r.exerciseId)
            const name = ex ? exerciseName(ex, lang, t) : t.wk_workout
            return (
              <Text key={r.exerciseId} style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
                {t.wkf_sum_record_row.replace('{name}', name).replace('{value}', String(r.value))}
              </Text>
            )
          })}
        </View>
      )}
      <Button label={t.wkf_done} onPress={onDone} fullWidth />
    </View>
  )
}
