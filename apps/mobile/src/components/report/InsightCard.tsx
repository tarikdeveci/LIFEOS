import { Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Button } from '@/src/components/ui/Button'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'
import { Reveal } from './motion'

interface Props {
  /** Anlatı zaten AI yorumuyla yazıldı: yeniden istenmez. */
  isAi: boolean
  isPro: boolean
  /** Abonelik durumu henüz okunuyor. */
  checking: boolean
  loading: boolean
  /** Kullanıcıya gösterilebilir hata metni. */
  error: string | null
  onAsk: () => void
}

/**
 * Raporun sonundaki AI yorumu. Şablon anlatı herkes için eksiksizdir; bu kart yalnızca
 * üstüne yorum ister. Pro olmayan kullanıcıya uygulamanın mevcut Pro yönlendirmesi açılır.
 */
export function InsightCard({ isAi, isPro, checking, loading, error, onAsk }: Props) {
  const { colors, isDark } = useTheme()
  const { t } = useLang()
  const accent = isDark ? palette.accent2 : palette.accent

  if (isAi) {
    return (
      <Reveal style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Ionicons name="sparkles-outline" size={16} color={colors.textMuted} />
        <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textMuted }}>{t.report_ai_ready}</Text>
      </Reveal>
    )
  }

  return (
    <Reveal>
      <GlassCard padding={spacing[4]}>
        <View style={{ gap: spacing[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Ionicons name="sparkles-outline" size={18} color={accent} />
            <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
              {t.report_ai_title}
            </Text>
            {!isPro && !checking && (
              <View style={{ paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: radius.full, backgroundColor: `${accent}1F` }}>
                <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: accent }}>{t.report_ai_pro}</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: fontSize.sm, lineHeight: 20, color: colors.textSecondary }}>{t.report_ai_hint}</Text>
          <Button
            label={loading ? t.report_ai_loading : t.report_ai_cta}
            onPress={onAsk}
            loading={loading}
            disabled={checking}
            fullWidth
          />
          {error !== null && (
            <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, lineHeight: 19, color: colors.textSecondary }}>{error}</Text>
          )}
        </View>
      </GlassCard>
    </Reveal>
  )
}
