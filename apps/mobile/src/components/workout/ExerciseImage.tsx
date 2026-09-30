import { useState, type ReactNode } from 'react'
import { Image } from 'react-native'
import type { ImageStyle, StyleProp } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'

interface Props {
  uri: string | null | undefined
  style: StyleProp<ImageStyle>
  /** Görsel yoksa ya da yüklenemezse bunun yerine çizilir; verilmezse alan boş kalır. */
  fallback?: ReactNode
}

/**
 * Hareketin fotoğrafı. Görsel yoksa ya da yüklenemezse (ağ yok, dosya
 * silinmiş) yerine fallback çizilir, o da yoksa alan boş kalır; kırık görsel
 * kutusu bırakılmaz. Hata adrese bağlı tutulur: kart başka harekete geçince
 * yeni görsel yeniden denenir.
 */
export function ExerciseImage({ uri, style, fallback = null }: Props) {
  const { colors } = useTheme()
  const [failedUri, setFailedUri] = useState<string | null>(null)
  if (!uri || failedUri === uri) return <>{fallback}</>
  return (
    <Image
      source={{ uri }}
      onError={() => setFailedUri(uri)}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
      style={[{ backgroundColor: colors.glassInner }, style]}
    />
  )
}
