import { useMemo, useState } from 'react'
import { View, Text, Alert } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import Ionicons from '@expo/vector-icons/Ionicons'
import { parseImportCsv, findExerciseMatch, useWorkoutStore } from '@lifeos/shared'
import type { CsvParseResult } from '@lifeos/shared'
import { importCsvWorkouts, type CsvImportOutcome } from '@lifeos/shared/supabase'
import { BottomSheet } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { supabase } from '../../lib/supabase'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface Props {
  visible: boolean
  onClose: () => void
  userId: string
}

const SOURCE_LABELS: Record<CsvParseResult['source'], string> = {
  strong: 'Strong',
  hevy: 'Hevy',
  fitnotes: 'FitNotes',
}

/**
 * Strong/Hevy/FitNotes CSV dışa aktarımını okur, önizler ve onaylandığında
 * içe aktarır. Ayrıştırma saf fonksiyon (parseImportCsv); DB yazımı
 * importCsvWorkouts içinde, iki adım arasında kullanıcı önizlemeyi görüp
 * vazgeçebiliyor.
 */
export function CsvImportSheet({ visible, onClose, userId }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const exercises = useWorkoutStore((s) => s.exercises)
  const fetchLibrary = useWorkoutStore((s) => s.fetchLibrary)
  const fetchHistory = useWorkoutStore((s) => s.fetchHistory)
  const fetchAnalytics = useWorkoutStore((s) => s.fetchAnalytics)

  const [picking, setPicking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [parsed, setParsed] = useState<CsvParseResult | null>(null)
  const [outcome, setOutcome] = useState<CsvImportOutcome | null>(null)

  function reset() {
    setParsed(null)
    setOutcome(null)
  }

  function handleClose() {
    if (picking || importing) return
    reset()
    onClose()
  }

  async function handlePick() {
    if (picking) return
    setPicking(true)
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
      if (result.canceled) return
      const asset = result.assets[0]
      if (!asset || !asset.name.toLowerCase().endsWith('.csv')) {
        Alert.alert(t.error, t.wk_csv_pick_csv)
        return
      }
      const text = await new File(asset.uri).text()
      const result2 = parseImportCsv(text)
      if (!result2 || result2.workouts.length === 0) {
        Alert.alert(t.error, t.wk_csv_unknown)
        return
      }
      if (exercises.length === 0) await fetchLibrary(supabase)
      setParsed(result2)
    } catch (err) {
      Alert.alert(t.error, err instanceof Error ? err.message : t.wk_csv_read_error)
    } finally {
      setPicking(false)
    }
  }

  async function handleConfirm() {
    if (!parsed || importing) return
    setImporting(true)
    try {
      const result = await importCsvWorkouts(supabase, userId, parsed.workouts, exercises)
      if (result.exercisesCreated > 0) await fetchLibrary(supabase, { force: true })
      // Kas haritası da içe aktarılan geçmişi hemen göstersin.
      await Promise.all([fetchHistory(supabase, userId), fetchAnalytics(supabase, userId)])
      setOutcome(result)
    } catch (err) {
      Alert.alert(t.error, err instanceof Error ? err.message : t.wk_csv_import_error)
    } finally {
      setImporting(false)
    }
  }

  const totalSets = parsed?.workouts.reduce((sum, w) => sum + w.sets.length, 0) ?? 0
  // Eşleştirme her adı tüm katalogla kıyaslıyor; her render'da tekrar etmesin.
  const { unmatchedNames, approximate } = useMemo(() => {
    const names = parsed ? [...new Set(parsed.workouts.flatMap((w) => w.sets.map((s) => s.exerciseName)))] : []
    const unmatched: string[] = []
    const approx: string[] = []
    for (const name of names) {
      const match = findExerciseMatch(name, exercises)
      if (!match) unmatched.push(name)
      else if (match.approximate) approx.push(`${name} → ${lang === 'en' ? (match.exercise.name_en ?? match.exercise.name) : match.exercise.name}`)
    }
    return { unmatchedNames: unmatched, approximate: approx }
  }, [parsed, exercises, lang])

  return (
    <BottomSheet visible={visible} onClose={handleClose} title={t.wk_csv_title} scrollable>
      <View style={{ gap: spacing[4] }}>
        {!parsed && !outcome && (
          <>
            <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
              {t.wk_csv_intro}
            </Text>
            <Button
              label={picking ? t.wk_csv_reading : t.wk_csv_choose}
              onPress={() => void handlePick()}
              loading={picking}
              fullWidth
            />
          </>
        )}

        {parsed && !outcome && (
          <>
            <View style={{ gap: spacing[2], padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}>
              <Row label={t.wk_csv_source} value={SOURCE_LABELS[parsed.source]} />
              <Row label={t.wk_csv_days} value={String(parsed.workouts.length)} />
              <Row label={t.wk_csv_sets} value={String(totalSets)} />
              {parsed.warmupSets > 0 && <Row label={t.wk_csv_warmups} value={String(parsed.warmupSets)} />}
              {parsed.skippedRows > 0 && <Row label={t.wk_csv_skipped_rows} value={String(parsed.skippedRows)} color={palette.warning} />}
              {unmatchedNames.length > 0 && (
                <Row label={t.wk_csv_new_exercises} value={t.wk_csv_auto_created.replace('{n}', String(unmatchedNames.length))} color={palette.info} />
              )}
            </View>

            {unmatchedNames.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] }}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textSubtle} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, flex: 1 }}>
                  {t.wk_csv_unmatched.replace('{names}', unmatchedNames.slice(0, 5).join(', '))}
                  {unmatchedNames.length > 5 ? '…' : ''}
                </Text>
              </View>
            )}

            {approximate.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] }}>
                <Ionicons name="git-compare-outline" size={16} color={colors.textSubtle} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, flex: 1 }}>
                  {t.wk_csv_approx.replace('{names}', approximate.slice(0, 5).join(', '))}
                  {approximate.length > 5 ? t.wk_csv_more.replace('{n}', String(approximate.length - 5)) : ''}
                </Text>
              </View>
            )}

            <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
              {t.wk_csv_existing_days}
            </Text>

            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <View style={{ flex: 1 }}>
                <Button label={t.cancel} variant="secondary" onPress={reset} disabled={importing} fullWidth />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={importing ? t.wk_csv_importing : t.wk_csv_import}
                  onPress={() => void handleConfirm()}
                  loading={importing}
                  fullWidth
                />
              </View>
            </View>
          </>
        )}

        {outcome && (
          <>
            <View style={{ alignItems: 'center', gap: spacing[2], paddingVertical: spacing[3] }}>
              <Ionicons name="checkmark-circle" size={40} color={palette.success} />
              <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                {t.wk_csv_done.replace('{w}', String(outcome.workoutsImported)).replace('{s}', String(outcome.setsImported))}
              </Text>
              {outcome.exercisesCreated > 0 && (
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{t.wk_csv_created.replace('{n}', String(outcome.exercisesCreated))}</Text>
              )}
              {outcome.daysSkipped > 0 && (
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                  {t.wk_csv_days_skipped.replace('{n}', String(outcome.daysSkipped))}
                </Text>
              )}
            </View>
            <Button label={t.close} onPress={handleClose} fullWidth />
          </>
        )}
      </View>
    </BottomSheet>
  )
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  const { colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{label}</Text>
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: color ?? colors.textPrimary }}>{value}</Text>
    </View>
  )
}
