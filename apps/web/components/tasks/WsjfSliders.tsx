'use client'

import type { WsjfScores } from '@lifeos/shared'
import { calculateWsjf, WSJF_SCORE_LABELS } from '@lifeos/shared'

interface WsjfSlidersProps {
  scores: WsjfScores
  onChange: (scores: WsjfScores) => void
  readonly?: boolean
}

const SLIDER_CONFIG = [
  { key: 'value_score' as const, label: 'Değer', color: 'accent' },
  { key: 'urgency_score' as const, label: 'Aciliyet', color: 'warning' },
  { key: 'risk_score' as const, label: 'Risk', color: 'danger' },
  { key: 'effort_score' as const, label: 'Efor', color: 'purple-500' },
  { key: 'friction_score' as const, label: 'Sürtünme', color: 'gray-500' },
] as const

// Skor → renk (1-5 bar gösterimi)
function scoreToColor(index: number, value: number, maxIndex: number): string {
  if (index >= value) return 'bg-gray-200'
  if (maxIndex <= 2) return 'bg-accent' // value, urgency, risk → üst grup
  return 'bg-purple-400' // effort, friction → alt grup
}

export function WsjfSliders({ scores, onChange, readonly = false }: WsjfSlidersProps) {
  const priorityScore = calculateWsjf(scores)

  function getPriorityColor(score: number): string {
    if (score >= 2.0) return 'text-danger'
    if (score >= 1.5) return 'text-warning'
    if (score >= 1.0) return 'text-accent'
    return 'text-muted'
  }

  return (
    <div className="space-y-3">
      {/* Hesaplanan skor */}
      <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
        <span className="text-sm font-medium text-primary">Öncelik Skoru</span>
        <span className={`text-2xl font-bold ${getPriorityColor(priorityScore)}`}>
          {priorityScore.toFixed(2)}
        </span>
      </div>

      {/* Bölücü: Değer (üst) / Maliyet (alt) */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted">Değer Faktörleri ↑</p>
      </div>

      {SLIDER_CONFIG.map((config, groupIdx) => {
        const value = scores[config.key]
        const isUpperGroup = groupIdx < 3

        return (
          <div key={config.key}>
            {groupIdx === 3 && (
              <div className="mb-1 mt-3 border-t border-gray-100 pt-2">
                <p className="text-xs font-medium text-muted">Maliyet Faktörleri ↓</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="w-20 text-xs font-medium text-primary">{config.label}</span>

              {/* 5 bar */}
              <div className="flex flex-1 gap-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    type="button"
                    disabled={readonly}
                    onClick={() => onChange({ ...scores, [config.key]: level })}
                    className={`h-7 flex-1 rounded-md transition-all duration-150 ${
                      level <= value
                        ? isUpperGroup
                          ? 'bg-accent hover:bg-accent/80'
                          : 'bg-purple-400 hover:bg-purple-400/80'
                        : 'bg-gray-100 hover:bg-gray-200'
                    } ${readonly ? 'cursor-default' : 'cursor-pointer'}`}
                    title={WSJF_SCORE_LABELS[level]}
                  />
                ))}
              </div>

              <span className="w-16 text-right text-xs text-muted">
                {WSJF_SCORE_LABELS[value] ?? ''}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
