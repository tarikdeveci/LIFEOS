import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { BODY_LIMITS, parseBodyMetrics } from '@lifeos/shared'
import type { BodyMetricField, BodyMetrics } from '@lifeos/shared'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

// Profil ekranının düzenleme sheet'leri; profile.tsx 500 satırın altında kalsın diye ayrı dosya.
// İkisi de kendi taslağında çalışır: Kaydet başarılı olmadan ekrandaki değerler değişmez,
// kapatmak taslağı atar.

export interface ProfileState {
  displayName: string; email: string
  height: string; weight: string; age: string
  gender: 'male' | 'female'
  fitnessGoal: string; activityLevel: string
}

export interface NutritionState {
  calories: string; protein: string; carbs: string; fat: string; fiber: string
}

interface PhysicalInfoSheetProps {
  visible: boolean
  onClose: () => void
  profile: ProfileState
  goals: { key: string; label: string; icon: string }[]
  levels: { key: string; label: string; sub: string }[]
  saving: boolean
  /** Başarılıysa true döner; false dönerse sheet açık kalır ve kayıt hatası gösterilir. */
  onSave: (draft: ProfileState, metrics: BodyMetrics) => Promise<boolean>
}

function SaveError({ text }: { text: string }) {
  return <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, color: palette.danger, textAlign: 'center' }}>{text}</Text>
}

export function PhysicalInfoSheet({ visible, onClose, profile, goals, levels, saving, onSave }: PhysicalInfoSheetProps) {
  const { colors } = useTheme()
  const { t } = useLang()
  const [draft, setDraft] = useState(profile)
  const [invalid, setInvalid] = useState<BodyMetricField[]>([])
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    if (!visible) return
    setDraft(profile)
    setInvalid([])
    setSaveFailed(false)
  }, [visible, profile])

  function editMetric(field: BodyMetricField, value: string) {
    setDraft((d) => ({ ...d, [field]: value }))
    setInvalid((list) => list.filter((f) => f !== field))
  }

  function metricError(field: BodyMetricField, text: string, limits: { min: number; max: number }) {
    if (!invalid.includes(field)) return undefined
    return text.replace('{min}', String(limits.min)).replace('{max}', String(limits.max))
  }

  async function handleSave() {
    const { values, invalid: bad } = parseBodyMetrics(draft)
    setInvalid(bad)
    setSaveFailed(false)
    if (bad.length > 0) return
    if (!(await onSave(draft, values))) setSaveFailed(true)
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Fiziksel Bilgiler" scrollable>
      <View style={{ gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <Input label="Boy (cm)" value={draft.height} onChangeText={(v) => editMetric('height', v)} error={metricError('height', t.profile_err_height, BODY_LIMITS.heightCm)} keyboardType="decimal-pad" placeholder="175" containerStyle={{ flex: 1 }} returnKeyType="next" />
          <Input label="Kilo (kg)" value={draft.weight} onChangeText={(v) => editMetric('weight', v)} error={metricError('weight', t.profile_err_weight, BODY_LIMITS.weightKg)} keyboardType="decimal-pad" placeholder="75" containerStyle={{ flex: 1 }} returnKeyType="next" />
        </View>
        <Input label="Yaş" value={draft.age} onChangeText={(v) => editMetric('age', v)} error={metricError('age', t.profile_err_age, BODY_LIMITS.age)} keyboardType="number-pad" placeholder="22" returnKeyType="done" />

        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginTop: spacing[2] }}>Cinsiyet</Text>
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          {(['male', 'female'] as const).map((gender) => (
            <TouchableOpacity
              key={gender}
              onPress={() => setDraft((p) => ({ ...p, gender }))}
              style={{ flex: 1, paddingVertical: spacing[3], borderRadius: radius.lg, alignItems: 'center', backgroundColor: draft.gender === gender ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: draft.gender === gender ? palette.accent : colors.border }}
            >
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: draft.gender === gender ? '#fff' : colors.textMuted }}>
                {gender === 'female' ? t.profile_gender_female : t.profile_gender_male}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginTop: spacing[2] }}>Fitness Hedefi</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {goals.map((g) => (
            <TouchableOpacity key={g.key} onPress={() => setDraft((p) => ({ ...p, fitnessGoal: g.key }))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[3], paddingVertical: 8, borderRadius: radius.lg, backgroundColor: draft.fitnessGoal === g.key ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: draft.fitnessGoal === g.key ? palette.accent : colors.border }}>
              <Ionicons name={g.icon as never} size={14} color={draft.fitnessGoal === g.key ? '#fff' : colors.textMuted} />
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: draft.fitnessGoal === g.key ? '#fff' : colors.textMuted }}>{g.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginTop: spacing[2] }}>Aktivite Seviyesi</Text>
        <View style={{ gap: spacing[2] }}>
          {levels.map((a) => (
            <TouchableOpacity key={a.key} onPress={() => setDraft((p) => ({ ...p, activityLevel: a.key }))}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing[4], borderRadius: radius.lg, backgroundColor: draft.activityLevel === a.key ? `${palette.accent}12` : colors.glassInner, borderWidth: 1, borderColor: draft.activityLevel === a.key ? palette.accent : colors.border }}>
              <View>
                <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{a.label}</Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{a.sub}</Text>
              </View>
              {draft.activityLevel === a.key && <Ionicons name="checkmark-circle" size={20} color={palette.accent} />}
            </TouchableOpacity>
          ))}
        </View>

        {saveFailed && <SaveError text={t.profile_save_failed} />}
        <Button label={saving ? 'Kaydediliyor...' : 'Kaydet'} onPress={() => void handleSave()} loading={saving} fullWidth style={{ marginTop: spacing[3] }} />
      </View>
    </BottomSheet>
  )
}

interface NutritionTargetsSheetProps {
  visible: boolean
  onClose: () => void
  nutrition: NutritionState
  saving: boolean
  /** Fiziksel bilgilerden öneri üretir; eksik bilgi varsa null döner. */
  onCalculate: () => NutritionState | null
  onOpenUrl: (url: string) => Promise<void>
  /** Başarılıysa true döner; false dönerse sheet açık kalır ve kayıt hatası gösterilir. */
  onSave: (draft: NutritionState) => Promise<boolean>
}

export function NutritionTargetsSheet({ visible, onClose, nutrition, saving, onCalculate, onOpenUrl, onSave }: NutritionTargetsSheetProps) {
  const { colors } = useTheme()
  const { lang, t } = useLang()
  const [draft, setDraft] = useState(nutrition)
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    if (!visible) return
    setDraft(nutrition)
    setSaveFailed(false)
  }, [visible, nutrition])

  function handleCalculate() {
    const suggested = onCalculate()
    if (suggested) setDraft(suggested)
  }

  async function handleSave() {
    setSaveFailed(false)
    if (!(await onSave(draft))) setSaveFailed(true)
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Beslenme Hedefleri" scrollable>
      <View style={{ gap: spacing[3] }}>
        <View style={{ padding: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.accent}10`, borderWidth: 1, borderColor: `${palette.accent}20` }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>
            Fiziksel bilgilerinden kalori ve makro hedefi hesaplayabilir, sonra gerekirse elle duzenleyebilirsin.
          </Text>
        </View>
        <Button label="Otomatik Hesapla" onPress={handleCalculate} variant="secondary" fullWidth />

        {/* Kaynak / citation — App Store Guideline 1.4.1 (sağlık bilgisi kaynağı) */}
        <View style={{ padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 }}>
            {lang === 'tr'
              ? 'Kalori ve makro değerleri Harris-Benedict (BMR) denklemi ve Atwater faktörlerine göre tahmin edilir. Yalnızca bilgilendirme amaçlıdır, tıbbi tavsiye değildir.'
              : 'Calorie and macro values are estimated using the Harris-Benedict (BMR) equation and Atwater factors. For informational purposes only, not medical advice.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing[4], marginTop: spacing[2] }}>
            <TouchableOpacity onPress={() => void onOpenUrl('https://en.wikipedia.org/wiki/Harris%E2%80%93Benedict_equation')}>
              <Text style={{ fontSize: fontSize.xs, color: palette.accent, textDecorationLine: 'underline' }}>
                {lang === 'tr' ? 'Kaynak: Harris-Benedict' : 'Source: Harris-Benedict'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void onOpenUrl('https://en.wikipedia.org/wiki/Atwater_system')}>
              <Text style={{ fontSize: fontSize.xs, color: palette.accent, textDecorationLine: 'underline' }}>
                {lang === 'tr' ? 'Atwater faktörleri' : 'Atwater factors'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <Input label="Günlük Kalori (kcal)" value={draft.calories} onChangeText={(v) => setDraft((n) => ({ ...n, calories: v }))} keyboardType="number-pad" placeholder="2500" returnKeyType="next" />
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <Input label="Protein (g)" value={draft.protein} onChangeText={(v) => setDraft((n) => ({ ...n, protein: v }))} keyboardType="number-pad" placeholder="150" containerStyle={{ flex: 1 }} returnKeyType="next" />
          <Input label="Karb (g)" value={draft.carbs} onChangeText={(v) => setDraft((n) => ({ ...n, carbs: v }))} keyboardType="number-pad" placeholder="250" containerStyle={{ flex: 1 }} returnKeyType="next" />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <Input label="Yağ (g)" value={draft.fat} onChangeText={(v) => setDraft((n) => ({ ...n, fat: v }))} keyboardType="number-pad" placeholder="70" containerStyle={{ flex: 1 }} returnKeyType="next" />
          <Input label="Lif (g)" value={draft.fiber} onChangeText={(v) => setDraft((n) => ({ ...n, fiber: v }))} keyboardType="number-pad" placeholder="30" containerStyle={{ flex: 1 }} returnKeyType="done" />
        </View>
        {saveFailed && <SaveError text={t.profile_save_failed} />}
        <Button label={saving ? 'Kaydediliyor...' : 'Kaydet'} onPress={() => void handleSave()} loading={saving} fullWidth style={{ marginTop: spacing[3] }} />
      </View>
    </BottomSheet>
  )
}
