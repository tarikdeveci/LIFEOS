import React from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { T } from '@/src/theme'

interface GlassCardProps {
  children: React.ReactNode
  style?: ViewStyle
  padding?: number
  marginBottom?: number
  noPadding?: boolean
  accent?: boolean   // adds a subtle left accent bar
}

/**
 * Premium card — clean white surface floating on lavender background.
 * Indigo-tinted shadow gives depth without tricks.
 * Optional left accent bar for section emphasis.
 */
export function GlassCard({
  children,
  style,
  padding = T.card.padding,
  marginBottom = 16,
  noPadding = false,
  accent = false,
}: GlassCardProps) {
  return (
    <View style={[styles.card, { borderRadius: T.card.radius, marginBottom }, style]}>
      {accent && <View style={styles.accentBar} />}
      <View style={noPadding ? undefined : { padding }}>
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.card.bg,
    borderWidth:     1,
    borderColor:     T.card.border,
    shadowColor:     T.card.shadowColor,
    shadowOffset:    T.card.shadowOffset as { width: number; height: number },
    shadowOpacity:   T.card.shadowOpacity,
    shadowRadius:    T.card.shadowRadius,
    elevation:       T.card.elevation,
    overflow:        'hidden',
  },
  accentBar: {
    position:        'absolute',
    top:             12,
    bottom:          12,
    left:            0,
    width:           3,
    borderRadius:    2,
    backgroundColor: T.accent,
  },
})
