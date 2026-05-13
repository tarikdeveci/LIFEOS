'use client'

import type { MacroProgress as MacroProgressType } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'

interface MacroProgressProps {
  label: string
  emoji: string
  unit: string
  progress: MacroProgressType
}

const STATUS_COLORS = {
  low: { bar: 'bg-warning', text: 'text-warning' },
  ok: { bar: 'bg-success', text: 'text-success' },
  over: { bar: 'bg-danger', text: 'text-danger' },
}

export function MacroProgress({ label, emoji, unit, progress }: MacroProgressProps) {
  const colors = STATUS_COLORS[progress.status]

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          {emoji} {label}
        </span>
        <span className="text-xs">
          <span className="font-semibold text-primary">{Math.round(progress.current)}</span>
          <span className="text-muted">/{progress.target}{unit}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-border/40">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${colors.bar}`}
          style={{ width: `${Math.min(progress.percentage, 100)}%` }}
        />
      </div>
      <div className="text-right">
        <span className={`text-[10px] font-medium ${colors.text}`}>
          {progress.percentage}%
        </span>
      </div>
    </div>
  )
}

interface MacroDashboardProps {
  calories: MacroProgressType
  protein: MacroProgressType
  carbs: MacroProgressType
  fat: MacroProgressType
  fiber: MacroProgressType
}

export function MacroDashboard({ calories, protein, carbs, fat, fiber }: MacroDashboardProps) {
  const { t } = useLang()

  return (
    <div className="space-y-4">
      {/* Kalori — büyük gösterim */}
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-accent/5 to-accent/10 p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-primary">🔥 {t.nutr_calories}</span>
          <span className={`text-xs font-medium ${STATUS_COLORS[calories.status].text}`}>
            {calories.percentage}%
          </span>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-primary">{Math.round(calories.current)}</span>
          <span className="mb-1 text-sm text-muted">/ {calories.target} kcal</span>
        </div>
        <div className="mt-3 h-2.5 rounded-full bg-surface/60">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${STATUS_COLORS[calories.status].bar}`}
            style={{ width: `${Math.min(calories.percentage, 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          {t.nutr_remaining_label}: {Math.max(0, calories.target - Math.round(calories.current))} kcal
        </p>
      </div>

      {/* Makrolar — grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/60 bg-surface p-3">
          <MacroProgress label={t.nutr_protein} emoji="🥩" unit="g" progress={protein} />
        </div>
        <div className="rounded-xl border border-border/60 bg-surface p-3">
          <MacroProgress label={t.nutr_carbs} emoji="🌾" unit="g" progress={carbs} />
        </div>
        <div className="rounded-xl border border-border/60 bg-surface p-3">
          <MacroProgress label={t.nutr_fat} emoji="🥑" unit="g" progress={fat} />
        </div>
        <div className="rounded-xl border border-border/60 bg-surface p-3">
          <MacroProgress label={t.nutr_fiber} emoji="🥦" unit="g" progress={fiber} />
        </div>
      </div>
    </div>
  )
}
