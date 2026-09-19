'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Komut paletinin başka bir sayfaya taşıdığı eylemi (?task=, ?meal=, ?ask=)
 * bir kez çalıştırır ve parametreyi adresten siler; sayfa yenilenince ya da
 * geri gelinince aynı eylem tekrar çalışmasın.
 */
export function useCommandParam(name: string, run: (value: string) => void) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const value = params.get(name)
  const runRef = useRef(run)

  useEffect(() => {
    runRef.current = run
  })

  useEffect(() => {
    if (!value) return
    runRef.current(value)
    const rest = new URLSearchParams(params.toString())
    rest.delete(name)
    const query = rest.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [name, value, params, pathname, router])
}
