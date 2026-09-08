import { Platform, View, type ViewStyle, type StyleProp } from 'react-native'
import { BlurView } from 'expo-blur'
import { useTheme } from '../../contexts/ThemeContext'
import { radius } from '../../theme/tokens'

interface Props {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  intensity?: number
  padding?: number
  borderRadius?: number
  noShadow?: boolean
}

export function GlassCard({
  children,
  style,
  intensity,
  padding = 16,
  borderRadius = radius.xl,
  noShadow = false,
}: Props) {
  const { colors, isDark } = useTheme()
  const blurIntensity = intensity ?? (isDark ? 35 : 60)

  const shadowStyle = noShadow ? {} : colors.shadowCard

  // Kenar cizgisi kaldirildi. Cizgi dis View'da, yani BlurView'in DISINDA
  // duruyordu: dolgu bulanik katmanin uzerine, cizgi ise ham arka planin
  // uzerine biniyordu. Ikisine ayni rengi vermek bu yuzden ayni pikseli
  // uretmiyor ve kartin cevresinde kontur olusuyordu. Cizginin dolguyla ayni
  // renk olmasi istendigine gore zaten gorsel bir isi yok; birakmak sadece
  // ikisinin tekrar ayrisma riski demek.
  const surface = (
    <View
      style={{
        backgroundColor: Platform.OS === 'android' ? colors.glassSolid : colors.glassFill,
        padding,
      }}
    >
      {/* Top shimmer line */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 16,
          right: 16,
          height: 1,
          backgroundColor: colors.glassShimmer,
        }}
      />
      {children}
    </View>
  )

  return (
    <View style={[{ borderRadius, overflow: 'hidden' }, shadowStyle, style]}>
      {/* Android'de BlurView hic bulanik uretmiyor (bkz. tokens.ts glassSolid),
          yalnizca duz bir katman ekliyor. Kart basina bir native view ve bir
          compositing katmani tasimamak icin orada dogrudan duz yuzey ciziyoruz;
          iOS'ta blur gercek, oldugu gibi kaliyor. */}
      {Platform.OS === 'android' ? (
        surface
      ) : (
        <BlurView intensity={blurIntensity} tint={isDark ? 'dark' : 'light'} style={{ flex: 1 }}>
          {surface}
        </BlurView>
      )}
    </View>
  )
}
