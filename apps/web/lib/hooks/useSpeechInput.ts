'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Web Speech API'nin kullandığımız kadarı. Chrome ve Edge `webkitSpeechRecognition`,
// Safari `SpeechRecognition` sunar; Firefox'ta yok, o zaman sadece textarea kalır.
interface RecognitionResultEvent {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecognitionResultEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

type RecognitionCtor = new () => Recognition

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Türkçe konuşmayı yazıya çevirir; her kesinleşen cümle onFinal ile gelir. Tanıma tarayıcıda yapılır. */
export function useSpeechInput(onFinal: (text: string) => void, lang = 'tr-TR') {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recRef = useRef<Recognition | null>(null)
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  useEffect(() => { setSupported(getCtor() !== null) }, [])
  useEffect(() => () => recRef.current?.stop(), [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor || recRef.current) return
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r?.isFinal) {
          const text = r[0].transcript.trim()
          if (text) onFinalRef.current(text)
        }
      }
    }
    rec.onend = () => { recRef.current = null; setListening(false) }
    rec.onerror = () => { recRef.current = null; setListening(false) }
    recRef.current = rec
    rec.start()
    setListening(true)
  }, [lang])

  const stop = useCallback(() => { recRef.current?.stop() }, [])

  return { supported, listening, start, stop }
}
