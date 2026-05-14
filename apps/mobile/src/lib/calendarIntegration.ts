import * as AuthSession from 'expo-auth-session'
import * as Calendar from 'expo-calendar'
import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'

WebBrowser.maybeCompleteAuthSession()

export type CalendarProvider = 'google' | 'outlook'
export type CalendarSource = 'local' | CalendarProvider
type PermissionStatus = 'granted' | 'denied' | 'undetermined'

interface ProviderToken {
  accessToken: string
  refreshToken?: string
  expiresAt: number
}

interface CalendarConfig {
  autoImportEnabled: boolean
  selectedLocalCalendarIds: string[]
}

export interface CalendarIntegrationState {
  autoImportEnabled: boolean
  selectedLocalCalendarIds: string[]
  localPermission: PermissionStatus
  googleConnected: boolean
  outlookConnected: boolean
}

export interface LocalCalendarSummary {
  id: string
  title: string
  source: string
  color?: string
  selected: boolean
}

export interface CalendarEventRecord {
  source: CalendarSource
  externalId: string
  title: string
  startsAt: string
  endsAt: string
  allDay: boolean
}

const CONFIG_KEY = 'lifeos.calendar.config'
const GOOGLE_TOKEN_KEY = 'lifeos.calendar.google'
const OUTLOOK_TOKEN_KEY = 'lifeos.calendar.outlook'

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
}

const OUTLOOK_DISCOVERY = {
  authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  revocationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/logout',
}

const GOOGLE_SCOPES = ['openid', 'profile', 'email', 'https://www.googleapis.com/auth/calendar.readonly']
const OUTLOOK_SCOPES = ['offline_access', 'openid', 'profile', 'User.Read', 'Calendars.Read']

function getRedirectUri(): string {
  return AuthSession.makeRedirectUri({ scheme: 'lifeos', path: 'calendar-auth' })
}

function getProviderClientId(provider: CalendarProvider): string {
  const value = provider === 'google'
    ? process.env['EXPO_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID']
    : process.env['EXPO_PUBLIC_OUTLOOK_CALENDAR_CLIENT_ID']

  if (!value) {
    throw new Error(provider === 'google'
      ? 'EXPO_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID eksik'
      : 'EXPO_PUBLIC_OUTLOOK_CALENDAR_CLIENT_ID eksik')
  }

  return value
}

async function readConfig(): Promise<CalendarConfig> {
  const raw = await SecureStore.getItemAsync(CONFIG_KEY)
  if (!raw) {
    return { autoImportEnabled: false, selectedLocalCalendarIds: [] }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CalendarConfig>
    return {
      autoImportEnabled: parsed.autoImportEnabled ?? false,
      selectedLocalCalendarIds: Array.isArray(parsed.selectedLocalCalendarIds) ? parsed.selectedLocalCalendarIds : [],
    }
  } catch {
    return { autoImportEnabled: false, selectedLocalCalendarIds: [] }
  }
}

async function writeConfig(config: CalendarConfig): Promise<void> {
  await SecureStore.setItemAsync(CONFIG_KEY, JSON.stringify(config))
}

async function readProviderToken(provider: CalendarProvider): Promise<ProviderToken | null> {
  const raw = await SecureStore.getItemAsync(provider === 'google' ? GOOGLE_TOKEN_KEY : OUTLOOK_TOKEN_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as ProviderToken
  } catch {
    return null
  }
}

async function writeProviderToken(provider: CalendarProvider, token: ProviderToken): Promise<void> {
  await SecureStore.setItemAsync(provider === 'google' ? GOOGLE_TOKEN_KEY : OUTLOOK_TOKEN_KEY, JSON.stringify(token))
}

async function clearProviderToken(provider: CalendarProvider): Promise<void> {
  await SecureStore.deleteItemAsync(provider === 'google' ? GOOGLE_TOKEN_KEY : OUTLOOK_TOKEN_KEY)
}

function toPermissionStatus(status: string): PermissionStatus {
  return status === 'granted' || status === 'denied' ? status : 'undetermined'
}

function buildTokenFromResponse(response: { access_token: string; refresh_token?: string; expires_in?: number }): ProviderToken {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: Date.now() + Math.max((response.expires_in ?? 3600) - 60, 60) * 1000,
  }
}

async function exchangeCodeForToken(
  provider: CalendarProvider,
  code: string,
  codeVerifier: string,
): Promise<ProviderToken> {
  const discovery = provider === 'google' ? GOOGLE_DISCOVERY : OUTLOOK_DISCOVERY
  const clientId = getProviderClientId(provider)
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: getRedirectUri(),
  })

  const response = await fetch(discovery.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!response.ok) {
    throw new Error('Token exchange failed')
  }

  const data = (await response.json()) as { access_token: string; refresh_token?: string; expires_in?: number }
  return buildTokenFromResponse(data)
}

async function refreshProviderToken(provider: CalendarProvider, refreshToken: string): Promise<ProviderToken> {
  const discovery = provider === 'google' ? GOOGLE_DISCOVERY : OUTLOOK_DISCOVERY
  const clientId = getProviderClientId(provider)
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const response = await fetch(discovery.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!response.ok) {
    throw new Error('Token refresh failed')
  }

  const data = (await response.json()) as { access_token: string; expires_in?: number }
  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + Math.max((data.expires_in ?? 3600) - 60, 60) * 1000,
  }
}

async function getValidProviderToken(provider: CalendarProvider): Promise<ProviderToken | null> {
  const existing = await readProviderToken(provider)
  if (!existing) return null
  if (existing.expiresAt > Date.now()) return existing
  if (!existing.refreshToken) {
    await clearProviderToken(provider)
    return null
  }

  try {
    const refreshed = await refreshProviderToken(provider, existing.refreshToken)
    await writeProviderToken(provider, refreshed)
    return refreshed
  } catch {
    await clearProviderToken(provider)
    return null
  }
}

function getRequestConfig(provider: CalendarProvider): AuthSession.AuthRequestConfig {
  return {
    clientId: getProviderClientId(provider),
    responseType: AuthSession.ResponseType.Code,
    scopes: provider === 'google' ? GOOGLE_SCOPES : OUTLOOK_SCOPES,
    redirectUri: getRedirectUri(),
    usePKCE: true,
    extraParams: provider === 'google'
      ? { access_type: 'offline', prompt: 'consent' }
      : { prompt: 'select_account' },
  }
}

export async function getCalendarIntegrationState(): Promise<CalendarIntegrationState> {
  const [config, permission, googleToken, outlookToken] = await Promise.all([
    readConfig(),
    Calendar.getCalendarPermissionsAsync(),
    getValidProviderToken('google'),
    getValidProviderToken('outlook'),
  ])

  return {
    autoImportEnabled: config.autoImportEnabled,
    selectedLocalCalendarIds: config.selectedLocalCalendarIds,
    localPermission: toPermissionStatus(permission.status),
    googleConnected: !!googleToken,
    outlookConnected: !!outlookToken,
  }
}

export async function setCalendarAutoImport(enabled: boolean): Promise<CalendarIntegrationState> {
  const current = await readConfig()
  await writeConfig({ ...current, autoImportEnabled: enabled })
  return getCalendarIntegrationState()
}

export async function requestLocalCalendarAccess(): Promise<CalendarIntegrationState> {
  const permission = await Calendar.requestCalendarPermissionsAsync()
  if (permission.status === 'granted') {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
    const config = await readConfig()
    await writeConfig({
      ...config,
      autoImportEnabled: true,
      selectedLocalCalendarIds: config.selectedLocalCalendarIds.length > 0
        ? config.selectedLocalCalendarIds
        : calendars.map((calendar) => calendar.id),
    })
  }

  return getCalendarIntegrationState()
}

export async function getLocalCalendars(): Promise<LocalCalendarSummary[]> {
  const permission = await Calendar.getCalendarPermissionsAsync()
  if (permission.status !== 'granted') return []

  const [calendars, config] = await Promise.all([
    Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT),
    readConfig(),
  ])

  return calendars.map((calendar) => ({
    id: calendar.id,
    title: calendar.title,
    source: calendar.source?.name ?? 'Cihaz',
    color: calendar.color,
    selected: config.selectedLocalCalendarIds.includes(calendar.id),
  }))
}

export async function setSelectedLocalCalendars(ids: string[]): Promise<CalendarIntegrationState> {
  const config = await readConfig()
  await writeConfig({ ...config, selectedLocalCalendarIds: ids })
  return getCalendarIntegrationState()
}

export async function connectCalendarProvider(provider: CalendarProvider): Promise<CalendarIntegrationState> {
  const discovery = provider === 'google' ? GOOGLE_DISCOVERY : OUTLOOK_DISCOVERY
  const request = new AuthSession.AuthRequest(getRequestConfig(provider))
  const result = await request.promptAsync(discovery)

  if (result.type !== 'success' || !result.params.code || !request.codeVerifier) {
    throw new Error('OAuth cancelled')
  }

  const token = await exchangeCodeForToken(provider, result.params.code, request.codeVerifier)
  await writeProviderToken(provider, token)
  return getCalendarIntegrationState()
}

export async function disconnectCalendarProvider(provider: CalendarProvider): Promise<CalendarIntegrationState> {
  await clearProviderToken(provider)
  return getCalendarIntegrationState()
}

function toDayBounds(date: string): { start: Date; end: Date } {
  return {
    start: new Date(`${date}T00:00:00.000`),
    end: new Date(`${date}T23:59:59.999`),
  }
}

function normalizeDateRange(start: string | undefined, end: string | undefined, fallbackDate: string): { startsAt: string; endsAt: string; allDay: boolean } | null {
  if (!start) return null
  const allDay = !start.includes('T')
  const startsAt = allDay ? `${fallbackDate}T09:00:00.000` : start
  const endsAt = end
    ? (end.includes('T') ? end : `${fallbackDate}T10:00:00.000`)
    : `${fallbackDate}T10:00:00.000`
  return { startsAt, endsAt, allDay }
}

async function fetchGoogleEvents(date: string, token: ProviderToken): Promise<CalendarEventRecord[]> {
  const { start, end } = toDayBounds(date)
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${token.accessToken}` } },
  )
  if (!response.ok) throw new Error('Google calendar fetch failed')

  const data = (await response.json()) as {
    items?: Array<{ id?: string; summary?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }>
  }

  return (data.items ?? []).flatMap((item) => {
    const normalized = normalizeDateRange(item.start?.dateTime ?? item.start?.date, item.end?.dateTime ?? item.end?.date, date)
    if (!normalized) return []
    return [{
      source: 'google' as const,
      externalId: item.id ?? `${normalized.startsAt}-${item.summary ?? 'google-event'}`,
      title: item.summary?.trim() || 'Google Etkinliği',
      startsAt: normalized.startsAt,
      endsAt: normalized.endsAt,
      allDay: normalized.allDay,
    }]
  })
}

async function fetchOutlookEvents(date: string, token: ProviderToken): Promise<CalendarEventRecord[]> {
  const { start, end } = toDayBounds(date)
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(start.toISOString())}&endDateTime=${encodeURIComponent(end.toISOString())}`,
    {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    },
  )
  if (!response.ok) throw new Error('Outlook calendar fetch failed')

  const data = (await response.json()) as {
    value?: Array<{ id?: string; subject?: string; isAllDay?: boolean; start?: { dateTime?: string }; end?: { dateTime?: string } }>
  }

  return (data.value ?? []).flatMap((item) => {
    if (!item.start?.dateTime || !item.end?.dateTime) return []
    return [{
      source: 'outlook' as const,
      externalId: item.id ?? `${item.start.dateTime}-${item.subject ?? 'outlook-event'}`,
      title: item.subject?.trim() || 'Outlook Etkinliği',
      startsAt: item.start.dateTime,
      endsAt: item.end.dateTime,
      allDay: item.isAllDay ?? false,
    }]
  })
}

async function fetchLocalEvents(date: string): Promise<CalendarEventRecord[]> {
  const permission = await Calendar.getCalendarPermissionsAsync()
  if (permission.status !== 'granted') return []

  const [config, calendars] = await Promise.all([
    readConfig(),
    Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT),
  ])
  const selectedIds = config.selectedLocalCalendarIds.length > 0
    ? config.selectedLocalCalendarIds
    : calendars.map((calendar) => calendar.id)

  if (selectedIds.length === 0) return []

  const { start, end } = toDayBounds(date)
  const events = await Calendar.getEventsAsync(selectedIds, start, end)

  return events.map((event) => ({
    source: 'local' as const,
    externalId: event.id,
    title: event.title?.trim() || 'Yerel Etkinlik',
    startsAt: new Date(event.startDate).toISOString(),
    endsAt: new Date(event.endDate).toISOString(),
    allDay: event.allDay,
  }))
}

export async function getCalendarEventsForDate(date: string): Promise<CalendarEventRecord[]> {
  const [googleToken, outlookToken, localEvents] = await Promise.all([
    getValidProviderToken('google'),
    getValidProviderToken('outlook'),
    fetchLocalEvents(date),
  ])

  const providerTasks: Array<Promise<CalendarEventRecord[]>> = [Promise.resolve(localEvents)]
  if (googleToken) providerTasks.push(fetchGoogleEvents(date, googleToken))
  if (outlookToken) providerTasks.push(fetchOutlookEvents(date, outlookToken))

  const results = await Promise.allSettled(providerTasks)
  return results.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
}

export interface ImportCalendarResult {
  imported: number
  skipped: number
}

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function importCalendarEventsForDate(supabase: any, userId: string, date: string): Promise<ImportCalendarResult> {
  const state = await getCalendarIntegrationState()
  const hasAnySource = state.localPermission === 'granted' || state.googleConnected || state.outlookConnected
  if (!hasAnySource) throw new Error('Bağlı takvim yok')

  const events = await getCalendarEventsForDate(date)
  if (events.length === 0) return { imported: 0, skipped: 0 }

  const { data: existingBlocks, error } = await supabase
    .from('time_blocks')
    .select('id, start_time, end_time, label')
    .eq('user_id', userId)
    .eq('date', date)
  if (error) throw error

  type ExistingBlock = { id: string; start_time: string; end_time: string; label: string | null }
  const blocks: ExistingBlock[] = existingBlocks ?? []
  // Only deduplicate by signature — do NOT skip based on time overlap
  const existingSigs = new Set(
    blocks
      .filter((b) => (b.label ?? '').startsWith('📅 '))
      .map((b) => `${b.start_time.slice(0, 5)}-${b.end_time.slice(0, 5)}-${b.label ?? ''}`),
  )

  const sourceLabel: Record<CalendarSource, string> = {
    local: 'Yerel',
    google: 'Google',
    outlook: 'Outlook',
  }

  let imported = 0
  let skipped = 0
  for (const event of events) {
    const startDate = new Date(event.startsAt)
    const endDate = new Date(event.endsAt)
    const start = event.allDay ? 9 * 60 : startDate.getHours() * 60 + startDate.getMinutes()
    const endRaw = event.allDay ? 10 * 60 : endDate.getHours() * 60 + endDate.getMinutes()
    const end = Math.max(start + 30, Math.min(endRaw, 23 * 60))

    const startStr = `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`
    const endStr = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
    const label = `📅 ${sourceLabel[event.source]} · ${event.title}`
    const sig = `${startStr}-${endStr}-${label}`
    if (existingSigs.has(sig)) {
      skipped++
      continue
    }

    const { error: insertError } = await supabase
      .from('time_blocks')
      .insert({ user_id: userId, date, start_time: startStr, end_time: endStr, block_type: 'routine', label })
    if (insertError) throw insertError

    existingSigs.add(sig)
    imported++
  }

  return { imported, skipped }
}