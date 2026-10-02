import { View, Text, TouchableOpacity, Linking, Alert } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

interface SourceRowProps {
  title: string
  sub: string
  url: string
  first?: boolean
}

function SourceRow({ title, sub, url, first = false }: SourceRowProps) {
  const { colors } = useTheme()
  const { lang } = useLang()

  async function open() {
    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert(lang === 'tr' ? 'Bağlantı açılamadı' : 'Could not open link', url)
    }
  }

  return (
    <>
      {!first && <View style={{ height: 1, backgroundColor: colors.border }} />}
      <TouchableOpacity onPress={() => void open()} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[3] }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{title}</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{sub}</Text>
        </View>
        <Ionicons name="open-outline" size={17} color={colors.textMuted} />
      </TouchableOpacity>
    </>
  )
}

/**
 * Veri kaynakları kartı. Open Food Facts (ODbL) ve RepDB (Free Tier License)
 * görünür atıf ŞART koşar: bu kart lisans yükümlülüğüdür, dekorasyon değil.
 * RepDB satırındaki "Exercise data by RepDB (repdb.co)" ifadesi lisansın
 * istediği metindir, çevrilmez. profile.tsx 500 satırı aştığı için ayrı dosya.
 */
export function DataSourcesCard() {
  const { colors } = useTheme()
  const { lang } = useLang()
  const tr = lang === 'tr'

  return (
    <GlassCard style={{ marginBottom: spacing[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[3] }}>
        <Ionicons name="library-outline" size={19} color={palette.accent} />
        <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
          {tr ? 'Veri Kaynakları' : 'Data Sources'}
        </Text>
      </View>
      <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 }}>
        {tr
          ? 'Besin değerleri LifeOS küratörlü sözlüğünün yanı sıra iki açık kaynaktan gelir. Küratörsüz kaynaklardan gelen eşleşmeler onayına sunulur.'
          : 'Nutrition values come from the LifeOS curated dictionary plus two open sources. Matches from uncurated sources are shown for your confirmation.'}
      </Text>
      <SourceRow
        first
        title="USDA FoodData Central"
        sub={tr ? 'Hammadde ve yemek analizleri · kamu malı' : 'Ingredient and dish analyses · public domain'}
        url="https://fdc.nal.usda.gov/"
      />
      <SourceRow
        title="Open Food Facts"
        sub={tr ? 'Paketli ürünler · Open Database License (ODbL) altında kullanılır' : 'Packaged products · used under the Open Database License (ODbL)'}
        url="https://world.openfoodfacts.org/"
      />
      <SourceRow
        title="Exercise data by RepDB (repdb.co)"
        sub={tr ? 'Egzersiz çizimleri · RepDB Free Tier License' : 'Exercise illustrations · RepDB Free Tier License'}
        url="https://repdb.co"
      />
    </GlassCard>
  )
}
