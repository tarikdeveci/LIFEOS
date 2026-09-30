import { View, Text, TouchableOpacity, Share, Linking, Platform, Alert } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

const IOS_APP_ID = '6789708836'
const ANDROID_PACKAGE = 'tr.lifeos.app'
// Paylaşılan bağlantı mağaza değil site: alıcı hangi platformda olursa olsun
// doğru mağazaya oradan gider.
const SHARE_URL = 'https://lifeos.tr'
// Yasal sayfalardaki iletişim adresiyle aynı (apps/web/lib/company.ts).
const FEEDBACK_EMAIL = 'info@detayinovasyon.com'

/**
 * Mağaza sayfasındaki yorum ekranı. Uygulama içi puanlama istemi
 * (src/lib/review.ts) kotalıdır ve düğmeden çağrılmamalı; kullanıcı
 * kendisi puanlamak istediğinde doğrudan mağazaya gönderilir.
 */
function storeReviewUrls(): string[] {
  if (Platform.OS === 'ios') {
    return [
      `itms-apps://apps.apple.com/app/id${IOS_APP_ID}?action=write-review`,
      `https://apps.apple.com/app/id${IOS_APP_ID}?action=write-review`,
    ]
  }
  return [
    `market://details?id=${ANDROID_PACKAGE}`,
    `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
  ]
}

/** Profildeki "Paylaş / Puanla / Geri bildirim" kartı; profile.tsx 500 satırı aştığı için ayrı dosya. */
export function SupportCard() {
  const { colors } = useTheme()
  const { t } = useLang()

  async function openFirst(urls: string[]) {
    for (const url of urls) {
      try {
        await Linking.openURL(url)
        return
      } catch {
        // Sıradaki adresi dene (market:// şeması Play Store yoksa açılmaz).
      }
    }
    Alert.alert(t.support_open_failed)
  }

  async function handleShare() {
    try {
      await Share.share({ message: t.support_share_message.replace('{url}', SHARE_URL) })
    } catch {
      // Kullanıcı paylaşım sayfasını kapattı ya da sistem reddetti: sessiz.
    }
  }

  function handleFeedback() {
    const subject = encodeURIComponent(t.support_feedback_subject.replace('{platform}', Platform.OS))
    void openFirst([`mailto:${FEEDBACK_EMAIL}?subject=${subject}`])
  }

  const rows: { icon: string; title: string; sub: string; onPress: () => void }[] = [
    { icon: 'star-outline', title: t.support_rate, sub: t.support_rate_sub, onPress: () => void openFirst(storeReviewUrls()) },
    { icon: 'share-social-outline', title: t.support_share, sub: t.support_share_sub, onPress: () => void handleShare() },
    { icon: 'chatbubble-ellipses-outline', title: t.support_feedback, sub: t.support_feedback_sub, onPress: handleFeedback },
  ]

  return (
    <GlassCard style={{ marginBottom: spacing[4] }}>
      {rows.map((row, i) => (
        <View key={row.icon}>
          {i > 0 && <View style={{ height: 1, backgroundColor: colors.border }} />}
          <TouchableOpacity
            onPress={row.onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingTop: i > 0 ? spacing[3] : 0, paddingBottom: i < rows.length - 1 ? spacing[3] : 0 }}
          >
            <Ionicons name={row.icon as never} size={18} color={palette.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{row.title}</Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{row.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
          </TouchableOpacity>
        </View>
      ))}
    </GlassCard>
  )
}
