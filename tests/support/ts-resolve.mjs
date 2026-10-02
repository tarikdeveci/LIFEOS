// Kaynak kod bundler çözümlemesi kullanıyor ('./date', '../types'). Node bunu çözemez:
// .ts dosyasından gelen uzantısız göreli importa önce '.ts', sonra '/index.ts' dener.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HAS_EXTENSION = /\.[cm]?[jt]sx?$/

export async function resolve(specifier, context, next) {
  const parent = context.parentURL
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../')
  if (isRelative && parent?.endsWith('.ts') && !HAS_EXTENSION.test(specifier)) {
    for (const suffix of ['.ts', '/index.ts']) {
      const url = new URL(specifier + suffix, parent)
      if (existsSync(fileURLToPath(url))) return next(url.href, context)
    }
  }
  return next(specifier, context)
}
