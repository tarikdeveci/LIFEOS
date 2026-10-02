import { callbackUri } from './oauth'

export { newPkce } from './oauth'

/**
 * Google Calendar OAuth ayarları. Kapsamlar en dar hâlinde: kendi açtığımız "LifeOS"
 * takvimini yönetmek ve dolu/boş bilgisi. Etkinlik başlıkları okunmaz.
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.freebusy',
]

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
export const GOOGLE_CAL_API = 'https://www.googleapis.com/calendar/v3'

/** OAuth bitince dönülecek yerler; başka adrese yönlendirme kabul edilmez. */
export const GOOGLE_RETURN = {
  web: '/settings',
  mobile: 'lifeos://integrations/google',
} as const
export type GoogleReturn = keyof typeof GOOGLE_RETURN

export function googleCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env['GOOGLE_CLIENT_ID']
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET']
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

/** Yönlendirme adresi Google Cloud Console'da kayıtlı olanla birebir aynı olmalı. */
export function googleRedirectUri(req: Request): string {
  return callbackUri(req, 'google')
}
