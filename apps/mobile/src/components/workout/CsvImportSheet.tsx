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
        Alert.alert('Hata', 'Lütfen bir .csv dosyası seç.')
        return
      }
      const text = await new File(asset.uri).text()
      const result2 = parseImportCsv(text)
      if (!result2 || result2.workouts.length === 0) {
        Alert.alert('Hata', 'Dosya tanınmadı. Strong, Hevy veya FitNotes dışa aktarımı olduğundan emin ol.')
        return
      }
      if (exercises.length === 0) await fetchLibrary(supabase)
      setParsed(result2)
    } catch (err) {
      Alert.alert('Hata', err instanceof Error ? err.message : 'Dosya okunamadı')
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
      Alert.alert('Hata', err instanceof Error ? err.message : 'İçe aktarma başarısız oldu')
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
      else if (match.approximate) approx.push(`${name} → ${match.exercise.name}`)
    }
    return { unmatchedNames: unmatched, approximate: approx }
  }, [parsed, exercises])

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Antrenman Verisi İçe Aktar" scrollable>
      <View style={{ gap: spacing[4] }}>
        {!parsed && !outcome && (
          <>
            <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
              Strong, Hevy veya FitNotes uygulamasından dışa aktardığın .csv dosyasını seç. Antrenmanların ve setlerin buraya aktarılır.
            </Text>
            <Button
              label={picking ? 'Okunuyor...' : 'Dosya Seç'}
              onPress={() => void handlePick()}
              loading={picking}
              fullWidth
            />
          </>
        )}

        {parsed && !outcome && (
          <>
            <View style={{ gap: spacing[2], padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}>
              <Row label="Kaynak" value={SOURCE_LABELS[parsed.source]} />
              <Row label="Antrenman günü" value={String(parsed.workouts.length)} />
              <Row label="Set sayısı" value={String(totalSets)} />
              {parsed.warmupSets > 0 && <Row label="Isınma seti (alınmayacak)" value={String(parsed.warmupSets)} />}
              {parsed.skippedRows > 0 && <Row label="Atlanan satır" value={String(parsed.skippedRows)} color={palette.warning} />}
              {unmatchedNames.length > 0 && (
                <Row label="Yeni egzersiz" value={`${unmatchedNames.length} (otomatik oluşturulacak)`} color={palette.info} />
              )}
            </View>

            {unmatchedNames.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] }}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textSubtle} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, flex: 1 }}>
                  Katalogda eşleşmeyen isimler kendi egzersizin olarak eklenir: {unmatchedNames.slice(0, 5).join(', ')}
                  {unmatchedNames.length > 5 ? '…' : ''}
                </Text>
              </View>
            )}

            {approximate.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] }}>
                <Ionicons name="git-compare-outline" size={16} color={colors.textSubtle} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, flex: 1 }}>
                  Yakın adla eşleşenler: {approximate.slice(0, 5).join(', ')}
                  {approximate.length > 5 ? ` ve ${approximate.length - 5} tane daha` : ''}
                </Text>
              </View>
            )}

            <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
              Zaten antrenman kaydın olan günler atlanır, üzerine yazılmaz.
            </Text>

            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <View style={{ flex: 1 }}>
                <Button label="Vazgeç" variant="secondary" onPress={reset} disabled={importing} fullWidth />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={importing ? 'Aktarılıyor...' : 'İçe Aktar'}
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
                {outcome.workoutsImported} antrenman, {outcome.setsImported} set aktarıldı
              </Text>
              {outcome.exercisesCreated > 0 && (
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{outcome.exercisesCreated} yeni egzersiz oluşturuldu</Text>
              )}
              {outcome.daysSkipped > 0 && (
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                  {outcome.daysSkipped} gün zaten kayıtlı olduğu için atlandı
                </Text>
              )}
            </View>
            <Button label="Kapat" onPress={handleClose} fullWidth />
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
