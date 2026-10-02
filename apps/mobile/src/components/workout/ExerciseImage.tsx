import { useState, type ReactNode } from 'react'
import { Image, View } from 'react-native'
import type { ImageStyle, StyleProp, ViewStyle } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'

interface Props {
  /** Bitiş (tepe) pozu; tek pozlu harekette tek görsel. */
  uri: string | null | undefined
  /** Başlangıç pozu. Verilirse iki poz yan yana çizilir: solda başlangıç, sağda bitiş. */
  startUri?: string | null
  style: StyleProp<ImageStyle>
  /** Görsel yoksa ya da yüklenemezse bunun yerine çizilir; verilmezse alan boş kalır. */
  fallback?: ReactNode
}

/**
 * Hareketin çizimi. Çizimler kare (RepDB, 512x512), kutu kare değilse
 * kırpılmasın diye contain. İki poz varsa yan yana durur ve hareketin nereden
 * nereye gittiği tek bakışta görünür. Bitiş pozu yüklenemezse yerine fallback,
 * yalnızca başlangıç yüklenemezse tek görsele düşülür; kırık görsel kutusu
 * bırakılmaz. Hata adrese bağlı tutulur: kart başka harekete geçince yeni
 * görsel yeniden denenir.
 */
export function ExerciseImage({ uri, startUri, style, fallback = null }: Props) {
  const { colors } = useTheme()
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())
  const markFailed = (u: string) => setFailed((prev) => new Set(prev).add(u))

  if (!uri || failed.has(uri)) return <>{fallback}</>
  const background = { backgroundColor: colors.glassInner }

  if (!startUri || failed.has(startUri)) {
    return (
      <Image
        source={{ uri }}
        onError={() => markFailed(uri)}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        style={[background, style]}
      />
    )
  }

  const pose = (u: string) => (
    <Image
      source={{ uri: u }}
      onError={() => markFailed(u)}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      style={{ flex: 1, height: '100%' }}
    />
  )
  return (
    <View style={[background, style as StyleProp<ViewStyle>, { flexDirection: 'row', overflow: 'hidden' }]}>
      {pose(startUri)}
      {pose(uri)}
    </View>
  )
}
