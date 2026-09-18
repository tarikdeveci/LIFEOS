import { View } from 'react-native'
import { radius } from '../../theme/tokens'

interface Props {
  /** 0..1 arası doluluk oranı. Sınırların dışı otomatik kırpılır. */
  fraction: number
  color: string
  trackColor: string
  height?: number
}

/**
 * View tabanlı doluluk çubuğu.
 *
 * Yeni native bağımlılık (react-native-svg dahil) eklenmeyeceği için kas
 * dengesi/toparlanma görselleştirmesi burada basit bir dolgu çubuğuyla
 * yapılıyor: dış track sabit renk, iç View yüzde genişlikle dolduruluyor.
 */
export function MuscleLevelBar({ fraction, color, trackColor, height = 6 }: Props) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100

  return (
    <View style={{ height, borderRadius: radius.full, backgroundColor: trackColor, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${pct}%`, borderRadius: radius.full, backgroundColor: color }} />
    </View>
  )
}
