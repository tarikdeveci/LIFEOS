import { createHash, randomBytes } from 'node:crypto'

/** OAuth akışlarının ortak parçaları: PKCE ve sağlayıcıda kayıtlı dönüş adresi. */

export function newPkce(): { state: string; verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url')
  return {
    state: randomBytes(24).toString('base64url'),
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  }
}

/** Yönlendirme adresi sağlayıcının konsolunda kayıtlı olanla birebir aynı olmalı. */
export function callbackUri(req: Request, slug: string): string {
  const base = process.env['NEXT_PUBLIC_SITE_URL'] ?? new URL(req.url).origin
  return `${base.replace(/\/$/, '')}/api/integrations/${slug}/callback`
}

/** OAuth bitince dönülecek yerler; başka adrese yönlendirme kabul edilmez. */
export function returnTarget(platform: 'web' | 'mobile', slug: string): string {
  return platform === 'mobile' ? `lifeos://integrations/${slug}` : '/settings'
}
