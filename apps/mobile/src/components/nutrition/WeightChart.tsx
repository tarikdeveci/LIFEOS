import { useMemo, useState } from 'react'
import { View, Text, Pressable, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native'
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg'
import { daysBetween, formatWeightKg, relativeDateLabel, shiftIsoDate, shortDateLabel, todayDate } from '@lifeos/shared'
import type { WeightPoint } from '@lifeos/shared/supabase'
import { useTheme } from '../../contexts/ThemeContext'
import { palette, fontSize, spacing } from '../../theme/tokens'

interface Props {
  /** Tartılar, tarihe göre artan. */
  points: readonly WeightPoint[]
  /** Gün gün filtrelenmiş trend kilo (computeAdaptiveTdee). */
  trend: ReadonlyArray<{ date: string; weightKg: number }>
  /** Gösterilen aralık (gün), `endDate` dahil. */
  days: number
  endDate: string
}

const HEIGHT = 160
const PAD_Y = 14
const PAD_X = 8
/** Sağdaki kg etiketlerinin alanı. */
const AXIS_WIDTH = 40
/** Dikey eksen en az bu kadar kg kapsar; yoksa 0,2 kg'lık oynama uçurum gibi görünür. */
const MIN_SPAN_KG = 2

/**
 * Kilo grafiği: noktalar tartılar, çizgi trend. Tartı günlük su ve tuzla bir
 * kilo oynayabildiği için asıl okunacak şey çizgi; noktalar onun etrafına
 * saçılır. Dokunulan noktanın tarihi ve kilosu grafiğin üstünde yazar.
 */
export function WeightChart({ points, trend, days, endDate }: Props) {
  const { colors } = useTheme()
  const [width, setWidth] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)

  const start = shiftIsoDate(endDate, -(days - 1))
  const raw = useMemo(() => points.filter((p) => p.date >= start && p.date <= endDate), [points, start, endDate])

  const chart = useMemo(() => {
    const first = raw[0]
    if (!first || width === 0) return null
    const line = trend.filter((p) => p.date >= start && p.date <= endDate)
    const origin = line[0] && line[0].date < first.date ? line[0].date : first.date
    const span = Math.max(1, daysBetween(origin, endDate))

    const values = [...raw, ...line].map((p) => p.weightKg)
    let lo = Math.min(...values)
    let hi = Math.max(...values)
    if (hi - lo < MIN_SPAN_KG) {
      const mid = (hi + lo) / 2
      lo = mid - MIN_SPAN_KG / 2
      hi = mid + MIN_SPAN_KG / 2
    } else {
      const pad = (hi - lo) * 0.1
      lo -= pad
      hi += pad
    }

    const plotWidth = width - AXIS_WIDTH
    const x = (date: string) => PAD_X + (daysBetween(origin, date) / span) * (plotWidth - 2 * PAD_X)
    const y = (kg: number) => PAD_Y + ((hi - kg) / (hi - lo)) * (HEIGHT - 2 * PAD_Y)

    const trendPath = line.length > 1
      ? line.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.weightKg).toFixed(1)}`).join(' ')
      : null
    const last = line[line.length - 1]
    const areaPath = trendPath && last && line[0]
      ? `${trendPath} L${x(last.date).toFixed(1)},${HEIGHT} L${x(line[0].date).toFixed(1)},${HEIGHT} Z`
      : null
    const ticks = [hi, (hi + lo) / 2, lo]
    return { origin, x, y, trendPath, areaPath, ticks, plotWidth }
  }, [raw, trend, start, endDate, width])

  function handleLayout(e: LayoutChangeEvent) {
    const next = Math.floor(e.nativeEvent.layout.width)
    if (next !== width) setWidth(next)
  }

  function handlePress(e: GestureResponderEvent) {
    if (!chart) return
    const tapX = e.nativeEvent.locationX
    let nearest: string | null = null
    let distance = Number.POSITIVE_INFINITY
    for (const p of raw) {
      const d = Math.abs(chart.x(p.date) - tapX)
      if (d < distance) {
        distance = d
        nearest = p.date
      }
    }
    const date = nearest
    if (date !== null) setSelected((current) => (current === date ? null : date))
  }

  const lastPoint = raw[raw.length - 1] ?? null
  const shown = (selected !== null ? raw.find((p) => p.date === selected) : undefined) ?? null
  const surface = colors.bgSurface

  return (
    <View>
      <Text style={{ fontSize: fontSize.xs, color: shown ? colors.textPrimary : colors.textSubtle, marginBottom: spacing[1] }}>
        {shown ? `${relativeDateLabel(shown.date)}: ${formatWeightKg(shown.weightKg)} kg` : 'Ayrıntı için bir noktaya dokun'}
      </Text>

      <View onLayout={handleLayout} style={{ height: HEIGHT, justifyContent: 'center' }}>
        {raw.length === 0 && (
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' }}>
            Son {days} günde tartı yok.
          </Text>
        )}
        {chart && (
          <Pressable onPress={handlePress}>
            <Svg width={width} height={HEIGHT}>
              <Defs>
                <LinearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={palette.accent} stopOpacity={0.22} />
                  <Stop offset="1" stopColor={palette.accent} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              {chart.ticks.map((kg) => (
                <Line key={`g${kg}`} x1={0} x2={chart.plotWidth} y1={chart.y(kg)} y2={chart.y(kg)} stroke={colors.border} strokeWidth={1} />
              ))}
              {chart.ticks.map((kg) => (
                <SvgText key={`t${kg}`} x={width} y={chart.y(kg) + 4} fontSize={10} fill={colors.textSubtle} textAnchor="end">
                  {formatWeightKg(kg)}
                </SvgText>
              ))}

              {chart.areaPath && <Path d={chart.areaPath} fill="url(#weightArea)" />}
              {chart.trendPath && (
                <Path d={chart.trendPath} stroke={palette.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              )}

              {shown && (
                <Line
                  x1={chart.x(shown.date)}
                  x2={chart.x(shown.date)}
                  y1={PAD_Y / 2}
                  y2={HEIGHT - PAD_Y / 2}
                  stroke={colors.borderStrong}
                  strokeWidth={1}
                  strokeDasharray="3,3"
                />
              )}
              {raw.map((p) => {
                const isLast = p === lastPoint
                const isShown = shown !== null && p.date === shown.date
                return (
                  <Circle
                    key={p.date}
                    cx={chart.x(p.date)}
                    cy={chart.y(p.weightKg)}
                    r={isShown ? 6 : isLast ? 5 : 3.5}
                    fill={isShown || isLast ? palette.accent : colors.textSubtle}
                    stroke={surface}
                    strokeWidth={isShown || isLast ? 2 : 1}
                  />
                )
              })}
            </Svg>
          </Pressable>
        )}
      </View>

      {chart && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing[1], paddingRight: AXIS_WIDTH }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{shortDateLabel(chart.origin)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textSubtle }} />
              <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>Tartı</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: palette.accent }} />
              <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>Trend</Text>
            </View>
          </View>
          <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
            {endDate === todayDate() ? 'Bugün' : shortDateLabel(endDate)}
          </Text>
        </View>
      )}
    </View>
  )
}
