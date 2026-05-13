import type { ReactNode } from 'react'
import { View } from 'react-native'
import { T } from '@/src/theme'

interface Props {
  children: ReactNode
}

export function GradientBackground({ children }: Props) {
  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {children}
    </View>
  )
}
