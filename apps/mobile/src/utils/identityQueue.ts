// Kimlik eşitleme kuyruğu: çağrılar sırayla çalışır ve görev çalışmaya başladığında EN SON hedef okunur.
// Hızlı hesap değişiminde (A çıkar, B girer) ara hedefler atlanır, son hedef uygulanır; hata kuyruğu bozmaz.

export function createLatestTargetQueue<T>(apply: (target: T) => Promise<void>): (target: T) => Promise<void> {
  let latest: T
  let chain: Promise<void> = Promise.resolve()
  return (target: T) => {
    latest = target
    chain = chain.then(() => apply(latest)).catch(() => {})
    return chain
  }
}
