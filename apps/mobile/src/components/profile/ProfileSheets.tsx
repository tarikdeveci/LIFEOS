import type { Dispatch, SetStateAction } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

// Profil ekranının düzenleme sheet'leri; profile.tsx 500 satırın altında kalsın diye ayrı dosya.

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
  setProfile: Dispatch<SetStateAction<ProfileState>>
  goals: { key: string; label: string; icon: string }[]
  levels: { key: string; label: string; sub: string }[]
  saving: boolean
  onSave: () => Promise<void>
}

export function PhysicalInfoSheet({ visible, onClose, profile, setProfile, goals, levels, saving, onSave }: PhysicalInfoSheetProps) {
  const { colors } = useTheme()
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Fiziksel Bilgiler" scrollable>
      <View style={{ gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <Input label="Boy (cm)" value={profile.height} onChangeText={(v) => setProfile((p) => ({ ...p, height: v }))} keyboardType="decimal-pad" placeholder="175" containerStyle={{ flex: 1 }} returnKeyType="next" />
          <Input label="Kilo (kg)" value={profile.weight} onChangeText={(v) => setProfile((p) => ({ ...p, weight: v }))} keyboardType="decimal-pad" placeholder="75" containerStyle={{ flex: 1 }} returnKeyType="next" />
        </View>
        <Input label="Yaş" value={profile.age} onChangeText={(v) => setProfile((p) => ({ ...p, age: v }))} keyboardType="number-pad" placeholder="22" returnKeyType="done" />

        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginTop: spacing[2] }}>Cinsiyet</Text>
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          {(['male', 'female'] as const).map((gender) => (
            <TouchableOpacity
              key={gender}
              onPress={() => setProfile((p) => ({ ...p, gender }))}
              style={{ flex: 1, paddingVertical: spacing[3], borderRadius: radius.lg, alignItems: 'center', backgroundColor: profile.gender === gender ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: profile.gender === gender ? palette.accent : colors.border }}
            >
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: profile.gender === gender ? '#fff' : colors.textMuted }}>
                {gender === 'female' ? 'Kadin' : 'Erkek'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginTop: spacing[2] }}>Fitness Hedefi</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {goals.map((g) => (
            <TouchableOpacity key={g.key} onPress={() => setProfile((p) => ({ ...p, fitnessGoal: g.key }))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[3], paddingVertical: 8, borderRadius: radius.lg, backgroundColor: profile.fitnessGoal === g.key ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: profile.fitnessGoal === g.key ? palette.accent : colors.border }}>
              <Ionicons name={g.icon as never} size={14} color={profile.fitnessGoal === g.key ? '#fff' : colors.textMuted} />
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: profile.fitnessGoal === g.key ? '#fff' : colors.textMuted }}>{g.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginTop: spacing[2] }}>Aktivite Seviyesi</Text>
        <View style={{ gap: spacing[2] }}>
          {levels.map((a) => (
            <TouchableOpacity key={a.key} onPress={() => setProfile((p) => ({ ...p, activityLevel: a.key }))}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing[4], borderRadius: radius.lg, backgroundColor: profile.activityLevel === a.key ? `${palette.accent}12` : colors.glassInner, borderWidth: 1, borderColor: profile.activityLevel === a.key ? palette.accent : colors.border }}>
              <View>
                <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{a.label}</Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{a.sub}</Text>
              </View>
              {profile.activityLevel === a.key && <Ionicons name="checkmark-circle" size={20} color={palette.accent} />}
            </TouchableOpacity>
          ))}
        </View>

        <Button label={saving ? 'Kaydediliyor...' : 'Kaydet'} onPress={onSave} loading={saving} fullWidth style={{ marginTop: spacing[3] }} />
      </View>
    </BottomSheet>
  )
}

interface NutritionTargetsSheetProps {
  visible: boolean
  onClose: () => void
  nutrition: NutritionState
  setNutrition: Dispatch<SetStateAction<NutritionState>>
  saving: boolean
  onCalculate: () => void
  onOpenUrl: (url: string) => Promise<void>
  onSave: () => Promise<void>
}

export function NutritionTargetsSheet({ visible, onClose, nutrition, setNutrition, saving, onCalculate, onOpenUrl, onSave }: NutritionTargetsSheetProps) {
  const { colors } = useTheme()
  const { lang } = useLang()
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Beslenme Hedefleri" scrollable>
      <View style={{ gap: spacing[3] }}>
        <View style={{ padding: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.accent}10`, borderWidth: 1, borderColor: `${palette.accent}20` }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>
            Fiziksel bilgilerinden kalori ve makro hedefi hesaplayabilir, sonra gerekirse elle duzenleyebilirsin.
          </Text>
        </View>
        <Button label="Otomatik Hesapla" onPress={onCalculate} variant="secondary" fullWidth />

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
        <Input label="Günlük Kalori (kcal)" value={nutrition.calories} onChangeText={(v) => setNutrition((n) => ({ ...n, calories: v }))} keyboardType="number-pad" placeholder="2500" returnKeyType="next" />
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <Input label="Protein (g)" value={nutrition.protein} onChangeText={(v) => setNutrition((n) => ({ ...n, protein: v }))} keyboardType="number-pad" placeholder="150" containerStyle={{ flex: 1 }} returnKeyType="next" />
          <Input label="Karb (g)" value={nutrition.carbs} onChangeText={(v) => setNutrition((n) => ({ ...n, carbs: v }))} keyboardType="number-pad" placeholder="250" containerStyle={{ flex: 1 }} returnKeyType="next" />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <Input label="Yağ (g)" value={nutrition.fat} onChangeText={(v) => setNutrition((n) => ({ ...n, fat: v }))} keyboardType="number-pad" placeholder="70" containerStyle={{ flex: 1 }} returnKeyType="next" />
          <Input label="Lif (g)" value={nutrition.fiber} onChangeText={(v) => setNutrition((n) => ({ ...n, fiber: v }))} keyboardType="number-pad" placeholder="30" containerStyle={{ flex: 1 }} returnKeyType="done" />
        </View>
        <Button label={saving ? 'Kaydediliyor...' : 'Kaydet'} onPress={onSave} loading={saving} fullWidth style={{ marginTop: spacing[3] }} />
      </View>
    </BottomSheet>
  )
}
