// Raporun veri dışı hâlleri: yükleniyor, açılamadı, kayıtsız gün. Ayrıca ortak geri düğmesi.
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Button } from '@/src/components/ui/Button'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

interface BackButtonProps { onPress: () => void }
interface SkeletonProps { onBack: () => void }
interface ErrorProps {
  onBack: () => void
  onRetry: () => void
  retrying: boolean
}

/** Üst çubuğun yüksekliği; kaydırma içeriği bu kadar aşağıdan başlar. */
export const BAR_HEIGHT = 48

export function BackButton({ onPress }: BackButtonProps) {
  const { colors } = useTheme()
  const { t } = useLang()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t.report_back}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing[2] }}
    >
      <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
    </TouchableOpacity>
  )
}

/** Yüklenirken raporun iskeleti: açılışın yerleşimiyle aynı, böylece veri gelince ekran zıplamaz. */
export function ReportSkeleton({ onBack }: SkeletonProps) {
  const { colors } = useTheme()
  const { t } = useLang()
  const bar = (width: `${number}%`, height: number) => (
    <View style={{ width, height, borderRadius: radius.xs, backgroundColor: colors.border }} />
  )

  return (
    <View style={{ flex: 1, paddingHorizontal: spacing[5] }}>
      <View style={{ height: BAR_HEIGHT, justifyContent: 'center' }}>
        <BackButton onPress={onBack} />
      </View>
      <View accessible accessibilityRole="progressbar" accessibilityLabel={t.report_loading} accessibilityState={{ busy: true }} style={{ gap: spacing[5], paddingTop: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{t.report_loading}</Text>
        </View>
        <View style={{ gap: spacing[3] }}>
          {bar('92%', 26)}
          {bar('70%', 26)}
        </View>
        <GlassCard padding={spacing[4]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
            <View style={{ width: 104, height: 104, borderRadius: 52, borderWidth: 10, borderColor: colors.border }} />
            <View style={{ flex: 1, gap: spacing[3] }}>
              {bar('80%', 14)}
              {bar('60%', 14)}
              {bar('70%', 14)}
            </View>
          </View>
        </GlassCard>
        <View style={{ gap: spacing[3] }}>
          {bar('40%', 12)}
          {bar('100%', 16)}
          {bar('86%', 16)}
        </View>
      </View>
    </View>
  )
}

/** Rapor açılamadı ve gösterilecek eski hâl de yok. Suçlamasız metin, tek eylem: tekrar dene. */
export function ReportError({ onBack, onRetry, retrying }: ErrorProps) {
  const { colors } = useTheme()
  const { t } = useLang()

  return (
    <View style={{ flex: 1, paddingHorizontal: spacing[5] }}>
      <View style={{ height: BAR_HEIGHT, justifyContent: 'center' }}>
        <BackButton onPress={onBack} />
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[3], paddingBottom: spacing[12] }}>
        <Ionicons name="cloud-offline-outline" size={36} color={colors.textSubtle} />
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.textPrimary, textAlign: 'center' }}>
          {t.report_error_title}
        </Text>
        <Text style={{ fontSize: fontSize.base, lineHeight: 22, color: colors.textSecondary, textAlign: 'center' }}>{t.report_error_body}</Text>
        <Button label={t.report_retry} onPress={onRetry} loading={retrying} style={{ alignSelf: 'center', marginTop: spacing[2] }} />
      </View>
    </View>
  )
}

/** Geçmiş gün için rapor satırı yok: hata değil, sakin bir boş durum ve bugüne dönüş. */
export function ReportMissing({ onBack, onToday }: { onBack: () => void; onToday: () => void }) {
  const { colors } = useTheme()
  const { t } = useLang()

  return (
    <View style={{ flex: 1, paddingHorizontal: spacing[5] }}>
      <View style={{ height: BAR_HEIGHT, justifyContent: 'center' }}>
        <BackButton onPress={onBack} />
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[3], paddingBottom: spacing[12] }}>
        <Ionicons name="calendar-clear-outline" size={36} color={colors.textSubtle} />
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.textPrimary, textAlign: 'center' }}>
          {t.report_missing_title}
        </Text>
        <Button label={t.report_missing_today} onPress={onToday} style={{ alignSelf: 'center', marginTop: spacing[2] }} />
      </View>
    </View>
  )
}

/** Günün hiçbir kaydı yok: boş ekran yerine ne olacağını söyleyen kart. */
export function EmptyDay() {
  const { colors } = useTheme()
  const { t } = useLang()

  return (
    <GlassCard padding={spacing[5]}>
      <View style={{ gap: spacing[2] }}>
        <Ionicons name="calendar-clear-outline" size={24} color={colors.textSubtle} />
        <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.report_empty_title}</Text>
        <Text style={{ fontSize: fontSize.base, lineHeight: 22, color: colors.textSecondary }}>{t.report_empty_body}</Text>
      </View>
    </GlassCard>
  )
}
