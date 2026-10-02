// Cron'dan (pg_cron, service_role anahtarı) gelen çağrıyı ayırır. Deno API'si kullanmaz:
// tests/ altından Node ile test edilir.
//
// İmzayı Supabase gateway'i doğrular (verify_jwt; config.toml'da bu fonksiyonlar için
// kapatılmadı). Ama anon anahtarı ve her kullanıcı oturumu da geçerli JWT'dir: "geçerli
// JWT" tek başına yetki değildir, rol iddiasına bakılır.

export function isServiceRole(req: Request): boolean {
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]
  const payload = token?.split('.')[1]
  if (!payload) return false
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown }
    return claims.role === 'service_role'
  } catch {
    return false
  }
}
