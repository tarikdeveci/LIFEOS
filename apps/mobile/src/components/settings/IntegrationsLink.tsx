import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

/** Profildeki "Entegrasyonlar" satırı; profile.tsx zaten 500 satırı aştığı için ayrı dosya. */
export function IntegrationsLink() {
  const { colors } = useTheme()
  const { t } = useLang()
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <TouchableOpacity onPress={() => router.push('/(tabs)/settings/integrations' as any)} activeOpacity={0.7}>
      <GlassCard style={{ marginBottom: spacing[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Ionicons name="git-network-outline" size={18} color={palette.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.integ_title}</Text>
            <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{t.integ_link_sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
        </View>
      </GlassCard>
    </TouchableOpacity>
  )
}
