'use client'

import type { Meal } from '@lifeos/shared'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ICONS } from '@lifeos/shared'

interface MealCardProps {
  meal: Meal
  onEdit?: (meal: Meal) => void
  onDelete?: (mealId: string) => void
}

export function MealCard({ meal, onEdit, onDelete }: MealCardProps) {
  return (
    <div className="group rounded-xl border border-gray-100 bg-white p-4 transition-all hover:border-gray-200 hover:shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{MEAL_TYPE_ICONS[meal.meal_type]}</span>
          <span className="text-sm font-semibold text-primary">{MEAL_TYPE_LABELS[meal.meal_type]}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-primary">{meal.total_calories} kcal</span>
          {onEdit && (
            <button
              onClick={() => onEdit(meal)}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted opacity-0 transition-all group-hover:opacity-100 hover:bg-accent/10 hover:text-accent"
            >
              Düzenle
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(meal.id) }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-lg font-bold text-muted/40 transition-all hover:bg-red-50 hover:text-danger group-hover:text-muted"
              title="Öğünü sil"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {meal.items.length > 0 && (
        <div className="mt-2 space-y-1">
          {meal.items.slice(0, 4).map((item, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-muted">{item.amount} {item.unit} {item.name}</span>
              <span className="text-muted">{item.calories} kcal</span>
            </div>
          ))}
          {meal.items.length > 4 && (
            <p className="text-xs text-muted">+{meal.items.length - 4} daha...</p>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-3 text-[10px]">
        <span className="text-muted">P: <b className="text-primary">{Math.round(meal.total_protein)}g</b></span>
        <span className="text-muted">K: <b className="text-primary">{Math.round(meal.total_carbs)}g</b></span>
        <span className="text-muted">Y: <b className="text-primary">{Math.round(meal.total_fat)}g</b></span>
        <span className="text-muted">L: <b className="text-primary">{Math.round(meal.total_fiber)}g</b></span>
      </div>
    </div>
  )
}
