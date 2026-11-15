import { Text, TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import type { AccountStage } from '@/src/auth/accountStage'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

interface AccountCardsProps {
  stage: AccountStage | null
}

/**
 * Profilde hesap durumu: misafire "hesabını kaydet" kartı, yarım kalan yükseltmede kaldığı adımın kartı.
 * Hazır hesapta hiçbir şey göstermez. Bugün ekranında banner yok, hatırlatma yalnızca burada durur.
 */
export function AccountCards({ stage }: AccountCardsProps) {
  const { colors } = useTheme()
  const { t } = useLang()

  if (stage === 'guest') {
    return (
      <GlassCard style={{ marginBottom: spacing[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[2] }}>
          <Ionicons name="cloud-upload-outline" size={19} color={palette.accent} />
          <Text style={{ flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.backup_card_title}</Text>
        </View>
        <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing[4] }}>{t.backup_card_body}</Text>
        <Button label={t.gate_create} onPress={() => router.push('/(auth)/register' as never)} fullWidth />
      </GlassCard>
    )
  }

  if (stage === 'pending_email' || stage === 'needs_password') {
    return (
      <GlassCard style={{ marginBottom: spacing[4] }}>
        <TouchableOpacity
          onPress={() => router.push('/(auth)/register' as never)}
          accessibilityRole="button"
          activeOpacity={0.75}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 44 }}
        >
          <Ionicons name={stage === 'pending_email' ? 'mail-outline' : 'key-outline'} size={19} color={palette.accent} />
          <Text style={{ flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
            {stage === 'pending_email' ? t.upgrade_pending_card : t.setpw_card}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
        </TouchableOpacity>
      </GlassCard>
    )
  }

  return null
}
