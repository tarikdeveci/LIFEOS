/**
 * Android ana ekran widget'ının görsel ağacı.
 *
 * react-native-android-widget primitive'leri (FlexWidget/TextWidget) kullanılır;
 * bunlar RN View/Text değil, RemoteViews'a derlenen özel bileşenler. Widget
 * arka planda (headless) render edildiği için tema tespiti güvenilir değil;
 * bu yüzden koyu kart + açık metin ile sabit, okunur bir görünüm veriyoruz.
 *
 * Android'de kilit ekranı widget'ı yoktur (API kaldırıldı) — kilit ekranı
 * öğeleri sadece iOS tarafında üretilir.
 */

import { FlexWidget, TextWidget } from 'react-native-android-widget'
import type { HexColor } from 'react-native-android-widget'
import type { WidgetSnapshot } from '@lifeos/shared'

const COLORS = {
  bg: '#171726',
  card: '#20213A',
  border: '#2E3050',
  text: '#F5F6FF',
  muted: '#A9ADC9',
  subtle: '#6E7291',
  accent: '#818CF8',
  success: '#34D399',
  warning: '#FBBF24',
} satisfies Record<string, HexColor>

const BLOCK_COLORS: Record<string, HexColor> = {
  task: '#818CF8',
  routine: '#34D399',
  break: '#94A3B8',
  focus: '#FBBF24',
  meal: '#F472B6',
  workout: '#F87171',
}

function fmtRemaining(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h === 0) return `${rem}d`
  if (rem === 0) return `${h}s`
  return `${h}s ${rem}d`
}

export function renderLifeOSWidget(snapshot: WidgetSnapshot) {
  const block = snapshot.currentBlock
  const next = snapshot.nextBlock
  const accent = block ? BLOCK_COLORS[block.blockType] ?? COLORS.accent : COLORS.accent

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: COLORS.bg,
        borderRadius: 24,
        padding: 16,
      }}
      clickAction="OPEN_APP"
    >
      {/* Üst: şu anki blok */}
      {block ? (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }} clickAction="OPEN_APP">
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }} clickAction="OPEN_APP">
            <FlexWidget style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: accent, marginRight: 8 }} clickAction="OPEN_APP" />
            <TextWidget
              text={truncate(block.label, 20)}
              style={{ fontSize: 17, fontWeight: '700', color: COLORS.text }}
            />
          </FlexWidget>
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', marginTop: 4 }} clickAction="OPEN_APP">
            <TextWidget
              text={`${block.startTime} – ${block.endTime}`}
              style={{ fontSize: 12, color: COLORS.muted }}
            />
            <TextWidget
              text={`   ${fmtRemaining(block.remainingMinutes)} kaldı`}
              style={{ fontSize: 12, fontWeight: '600', color: accent }}
            />
          </FlexWidget>
          {/* İlerleme çubuğu */}
          <FlexWidget style={{ width: 'match_parent', height: 5, borderRadius: 3, backgroundColor: COLORS.border, marginTop: 8, overflow: 'hidden' }} clickAction="OPEN_APP">
            <FlexWidget
              style={{ height: 5, borderRadius: 3, backgroundColor: accent, width: progressWidth(block.progress) }}
              clickAction="OPEN_APP"
            />
          </FlexWidget>
        </FlexWidget>
      ) : (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }} clickAction="OPEN_APP">
          <TextWidget
            text={snapshot.dayOver ? 'Bugünün planı tamam' : 'Şu an boş zaman'}
            style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}
          />
          {next ? (
            <TextWidget
              text={`Sıradaki: ${truncate(next.label, 18)} · ${fmtRemaining(next.minutesUntilStart)} sonra`}
              style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}
            />
          ) : (
            <TextWidget text="LifeOS" style={{ fontSize: 12, color: COLORS.subtle, marginTop: 4 }} />
          )}
        </FlexWidget>
      )}

      {/* Alt: özet satırı */}
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }} clickAction="OPEN_APP">
        <SummaryPill label="Görev" value={`${snapshot.pendingTasks}`} color={COLORS.accent} />
        {snapshot.calories ? (
          <SummaryPill label="kcal" value={`${snapshot.calories.consumed}/${snapshot.calories.target}`} color={COLORS.warning} />
        ) : (
          <SummaryPill label="Biten" value={`${snapshot.doneTasks}`} color={COLORS.success} />
        )}
        {snapshot.steps ? (
          <SummaryPill label="adım" value={compact(snapshot.steps.value)} color={COLORS.success} />
        ) : next && block ? (
          <SummaryPill label="Sıradaki" value={next.startTime} color={COLORS.muted} />
        ) : (
          <SummaryPill label="Biten" value={`${snapshot.doneTasks}`} color={COLORS.success} />
        )}
      </FlexWidget>
    </FlexWidget>
  )
}

function SummaryPill({ label, value, color }: { label: string; value: string; color: HexColor }) {
  return (
    <FlexWidget
      style={{ flexDirection: 'column', alignItems: 'center', flex: 1 }}
      clickAction="OPEN_APP"
    >
      <TextWidget text={value} style={{ fontSize: 15, fontWeight: '700', color }} />
      <TextWidget text={label} style={{ fontSize: 10, color: COLORS.subtle, marginTop: 1 }} />
    </FlexWidget>
  )
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function compact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return `${value}`
}

/** İlerleme çubuğu için piksel yerine yüzdeyi yaklaşık genişliğe çevir.
 *  react-native-android-widget yüzde genişlik desteklemez, sabit ölçek kullanır. */
function progressWidth(progress: number): number {
  // Orta boy widget içeriği ~250dp; %0-100'ü buna ölçekle
  const usable = 250
  return Math.max(4, Math.round(Math.min(1, Math.max(0, progress)) * usable))
}
