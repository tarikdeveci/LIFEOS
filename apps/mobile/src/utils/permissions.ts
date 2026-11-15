/** Expo izin modüllerinin (bildirim, takvim) ortak yanıt biçimi. */
export interface PermissionResponse {
  status: string
  canAskAgain: boolean
}

/**
 * İzni ister; kullanıcı izni bir kez kalıcı reddettiyse sistem diyaloğu bir
 * daha açılmaz ve istek sessizce "denied" döner (#15). O durumda düğme hiçbir
 * şey yapmıyormuş gibi görünmesin diye uygulamanın sistem ayarları açılır.
 * Kullanıcı ayarlardan dönünce ekran izni yeniden okumalı (`useOnAppActive`).
 */
export async function requestOrOpenSettings(
  request: () => Promise<PermissionResponse>,
  openSettings: () => Promise<void>,
): Promise<boolean> {
  const res = await request()
  if (res.status === 'granted') return true
  if (!res.canAskAgain) await openSettings()
  return false
}
