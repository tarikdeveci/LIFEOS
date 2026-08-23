/**
 * Aktif zaman bloğu için "canlı" bildirim.
 *
 * iOS  → ActivityKit Live Activity (kilit ekranı + Dynamic Island). Sayaç ve
 *        ilerleme çubuğu sistem tarafından tiklenir; uygulama kapalıyken de akar.
 * Android → kalıcı (ongoing/sticky) bildirim. Kullanıcı kaydırarak silemez,
 *        blok bitene kadar bildirim panelinde durur.
 *
 * Her iki platformda da tek bir "aktif blok" bildirimi olur; yeni blok
 * başladığında mevcut olan güncellenir, yenisi eklenmez.
 */

import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'

/** Android kalıcı bildiriminin sabit kimliği — hep aynısı güncellensin diye */
const ANDROID_ID = 'lifeos-active-block'
const ANDROID_CHANNEL = 'active-block'

export interface LiveBlockState {
  label: string
  /** task | routine | break | focus | meal | workout */
  blockType: string
  startsAt: Date
  endsAt: Date
  pendingTasks: number
  nextLabel: string | null
  /** YYYY-MM-DD */
  dayDate: string
}

interface NativeLiveActivity {
  isSupported: () => boolean
  start: (state: {
    label: string
    blockType: string
    startsAtMs: number
    endsAtMs: number
    pendingTasks: number
    nextLabel: string | null
    dayDate: string
  }) => Promise<string | null>
  update: (state: {
    label: string
    blockType: string
    startsAtMs: number
    endsAtMs: number
    pendingTasks: number
    nextLabel: string | null
    dayDate: string
  }) => Promise<boolean>
  end: () => Promise<boolean>
}

let nativeChecked = false
let native: NativeLiveActivity | null = null

/** Expo Go'da veya modül derlenmemişse null döner */
function getNative(): NativeLiveActivity | null {
  if (nativeChecked) return native
  nativeChecked = true
  if (Platform.OS !== 'ios') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireNativeModule } = require('expo-modules-core') as {
      requireNativeModule: (name: string) => NativeLiveActivity
    }
    native = requireNativeModule('LiveActivity')
  } catch {
    native = null
  }
  return native
}

function toPayload(state: LiveBlockState) {
  return {
    label: state.label,
    blockType: state.blockType,
    startsAtMs: state.startsAt.getTime(),
    endsAtMs: state.endsAt.getTime(),
    pendingTasks: state.pendingTasks,
    nextLabel: state.nextLabel,
    dayDate: state.dayDate,
  }
}

function remainingText(endsAt: Date, now: Date): string {
  const mins = Math.max(0, Math.round((endsAt.getTime() - now.getTime()) / 60_000))
  const h = Math.floor(mins / 60)
  const rem = mins % 60
  if (h === 0) return `${rem} dk kaldı`
  if (rem === 0) return `${h} sa kaldı`
  return `${h} sa ${rem} dk kaldı`
}

async function ensureAndroidChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: 'Aktif blok',
    importance: Notifications.AndroidImportance.LOW, // sessiz — sürekli açık kalacak
    sound: null,
    vibrationPattern: [0],
    enableVibrate: false,
    showBadge: false,
  })
}

/** Kalıcı bildirimi başlatır ya da açık olanı günceller */
export async function showActiveBlock(state: LiveBlockState): Promise<void> {
  if (Platform.OS === 'ios') {
    const mod = getNative()
    if (!mod || !mod.isSupported()) return
    await mod.start(toPayload(state))
    return
  }

  if (Platform.OS !== 'android') return

  await ensureAndroidChannel()
  const parts = [remainingText(state.endsAt, new Date())]
  if (state.nextLabel) parts.push(`Sıradaki: ${state.nextLabel}`)

  await Notifications.scheduleNotificationAsync({
    identifier: ANDROID_ID,
    content: {
      title: state.label,
      body: parts.join(' · '),
      sticky: true, // kaydırarak silinemez
      autoDismiss: false,
      priority: Notifications.AndroidNotificationPriority.LOW,
      sound: false, // sürekli açık kalacak, her tazelemede ses çıkarmasın
      data: { type: 'active_block' },
    },
    trigger: null, // hemen göster
  })
}

/** Blok bittiğinde / plan kalmadığında kalıcı bildirimi kaldırır */
export async function hideActiveBlock(): Promise<void> {
  if (Platform.OS === 'ios') {
    const mod = getNative()
    if (!mod) return
    await mod.end()
    return
  }

  if (Platform.OS !== 'android') return
  await Notifications.dismissNotificationAsync(ANDROID_ID).catch(() => {})
  await Notifications.cancelScheduledNotificationAsync(ANDROID_ID).catch(() => {})
}

/** Canlı bildirim bu cihazda kullanılabilir mi */
export function isLiveActivitySupported(): boolean {
  if (Platform.OS === 'android') return true
  const mod = getNative()
  return mod ? mod.isSupported() : false
}
