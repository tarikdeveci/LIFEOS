import { useMemo, useState } from 'react'
import { View, Text, type LayoutChangeEvent } from 'react-native'
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter'
import type { MuscleGroup } from '@lifeos/shared'
import { useTheme } from '../../contexts/ThemeContext'
import { palette, fontSize, spacing } from '../../theme/tokens'

/**
 * muscle_groups.name_en → figürdeki bölge. name_en değerleri 048'de sözleşme
 * olarak sabitlendi. Anatomik olmayan gruplar (Full Body, Flexibility,
 * Swimming) figürde yer almaz; boyun ve kaval kemiği gibi bölgelerin karşılığı
 * olan grup yok, onlar gövde renginde kalır.
 */
const BODY_SLUGS: Readonly<Record<string, readonly Slug[]>> = {
  Chest: ['chest'],
  Back: ['upper-back'],
  Shoulder: ['deltoids'],
  Bicep: ['biceps'],
  Tricep: ['triceps'],
  Forearms: ['forearm'],
  Traps: ['trapezius'],
  Abs: ['abs'],
  Obliques: ['obliques'],
  'Lower Back': ['lower-back'],
  Glutes: ['gluteal'],
  Quadriceps: ['quadriceps'],
  Hamstrings: ['hamstring'],
  Adductors: ['adductors'],
  Calves: ['calves'],
}

/**
 * Kas olmayan bölgeler. Paketin varlıklarında her parçanın gömülü bir rengi
 * (koyu gri) var ve `defaultFill`'den önce geliyor; figürün tamamının temaya
 * uyması için bu bölgelere de dolgu açıkça verilir.
 */
const NON_MUSCLE_SLUGS: readonly Slug[] = ['head', 'hair', 'neck', 'hands', 'feet', 'knees', 'ankles', 'tibialis']

/** Paket figürü 200x400 birimle çiziyor; ölçek kart genişliğinden hesaplanır. */
const FIGURE_WIDTH = 200
const FIGURE_GAP = spacing[3]
/** Seçili kasın kontur kalınlığı (SVG viewBox birimi, figür ~724 birim genişliğinde). */
const SELECTED_STROKE_WIDTH = 8

export interface BodyMapLegendItem {
  color: string
  label: string
}

interface Props {
  muscleGroups: MuscleGroup[]
  /** Kas grubu id'si → dolgu rengi. Listede olmayan kas gövde renginde kalır. */
  fills: Readonly<Record<number, string>>
  legend: readonly BodyMapLegendItem[]
  gender: 'male' | 'female' | null
  selectedId: number | null
  /** Aynı kasa ikinci dokunuş ya da kas olmayan bölge seçimi kaldırır (null). */
  onSelect: (groupId: number | null) => void
}

/** Veri olmayan kasın rengi; lejantta "yok" rengi olarak da kullanılır. */
export function bodyBaseFill(isDark: boolean): string {
  return isDark ? '#334155' : '#E2E8F0'
}

/** Baş, el, ayak gibi kas olmayan bölgeler: kaslardan bir ton geride. */
function bodyNeutralFill(isDark: boolean): string {
  return isDark ? '#1E293B' : '#F1F5F9'
}

/**
 * Ön ve arka figür yan yana, her kas verilen renkle boyanır. Dokunulan kas
 * seçilir ve konturla vurgulanır; ayrıntıyı kartın kendisi gösterir.
 */
export function MuscleBodyMap({ muscleGroups, fills, legend, gender, selectedId, onSelect }: Props) {
  const { colors, isDark } = useTheme()
  const [width, setWidth] = useState(0)

  const slugToGroup = useMemo(() => {
    const map = new Map<Slug, number>()
    for (const group of muscleGroups) {
      for (const slug of BODY_SLUGS[group.name_en] ?? []) {
        if (!map.has(slug)) map.set(slug, group.id)
      }
    }
    return map
  }, [muscleGroups])

  const baseFill = bodyBaseFill(isDark)
  const data = useMemo(() => {
    const parts: ExtendedBodyPart[] = NON_MUSCLE_SLUGS.map((slug) => ({ slug, styles: { fill: bodyNeutralFill(isDark) } }))
    for (const slugs of Object.values(BODY_SLUGS)) {
      for (const slug of slugs) {
        const id = slugToGroup.get(slug)
        const selected = id !== undefined && id === selectedId
        parts.push({
          slug,
          styles: {
            fill: (id !== undefined ? fills[id] : undefined) ?? baseFill,
            ...(selected ? { stroke: isDark ? '#F8FAFC' : '#0F172A', strokeWidth: SELECTED_STROKE_WIDTH } : {}),
          },
        })
      }
    }
    return parts
  }, [slugToGroup, fills, selectedId, baseFill, isDark])

  function handlePress(part: ExtendedBodyPart) {
    const id = part.slug ? slugToGroup.get(part.slug) : undefined
    onSelect(id === undefined || id === selectedId ? null : id)
  }

  function handleLayout(e: LayoutChangeEvent) {
    const next = Math.floor(e.nativeEvent.layout.width)
    if (next !== width) setWidth(next)
  }

  const scale = width > 0 ? (width - FIGURE_GAP) / 2 / FIGURE_WIDTH : 0
  const figureGender = gender === 'female' ? 'female' : 'male'
  const border = isDark ? '#475569' : '#CBD5E1'

  return (
    <View onLayout={handleLayout}>
      {scale > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {(['front', 'back'] as const).map((side) => (
            <View key={side} style={{ alignItems: 'center' }}>
              <Body
                data={data}
                side={side}
                gender={figureGender}
                scale={scale}
                border={border}
                onBodyPartPress={handlePress}
              />
              <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, marginTop: spacing[1] }}>
                {side === 'front' ? 'Ön' : 'Arka'}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: spacing[4], rowGap: spacing[2], marginTop: spacing[3] }}>
        {legend.map((item) => (
          <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color, borderWidth: item.color === baseFill ? 1 : 0, borderColor: palette.backlog }} />
            <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
