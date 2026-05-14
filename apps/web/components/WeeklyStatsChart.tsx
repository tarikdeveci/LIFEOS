'use client'

import type { WeeklyDayStat } from '@lifeos/shared'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'

interface WeeklyStatsChartProps {
  data: WeeklyDayStat[]
  calorieTarget: number
}

interface TooltipPayloadItem {
  name: string
  value: number
  color: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}

function getCalorieDotColor(calories: number, target: number): string {
  if (target === 0 || calories === 0) return '#E5E7EB'
  const ratio = calories / target
  if (ratio > 1.2) return '#EF4444'  // >120%: kırmızı
  if (ratio > 1.0) return '#F59E0B'  // 100-120%: amber
  if (ratio > 0.8) return '#34A853'  // 80-100%: yeşil
  return '#4A90D9'                   // <80%: mavi (kalori açığı)
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="mb-1 font-semibold text-primary">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-medium">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

export function WeeklyStatsChart({ data, calorieTarget }: WeeklyStatsChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="text-xs text-muted">Bu hafta henüz veri yok</p>
      </div>
    )
  }

  const chartData = data.map((d) => ({
    day: d.dayLabel,
    'Görev %': d.taskPercent,
    'Kalori': d.calories,
    workoutStatus: d.workoutStatus,
    caloriesBurned: d.caloriesBurned,
    _full: d,
  }))

  const kcalDomainMax = Math.max(calorieTarget * 1.3, 100)

  return (
    <div className="space-y-1">
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: '#9CA3AF' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="percent"
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#9CA3AF' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />
          <YAxis
            yAxisId="kcal"
            orientation="right"
            domain={[0, kcalDomainMax]}
            tick={{ fontSize: 10, fill: '#9CA3AF' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
            iconSize={7}
          />

          {/* Kalori hedef referans çizgisi */}
          {calorieTarget > 0 && (
            <ReferenceLine
              yAxisId="kcal"
              y={calorieTarget}
              stroke="#9CA3AF"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          )}

          {/* Görev tamamlama % */}
          <Bar yAxisId="percent" dataKey="Görev %" fill="#34A853" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={entry['Görev %'] >= 80 ? '#34A853' : entry['Görev %'] >= 40 ? '#F59E0B' : '#E5E7EB'}
              />
            ))}
          </Bar>

          {/* Kalori tüketim çizgisi — nokta rengi kalori/hedef oranını gösterir */}
          <Line
            yAxisId="kcal"
            type="monotone"
            dataKey="Kalori"
            stroke="#4A90D9"
            strokeWidth={2}
            dot={(props) => {
              const { cx = 0, cy = 0, index = 0 } = props as { cx?: number; cy?: number; index?: number }
              const d = chartData[index]
              const color = d ? getCalorieDotColor(d['Kalori'], calorieTarget) : '#9CA3AF'
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={5}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              )
            }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Kalori durum renk açıklaması */}
      <div className="flex flex-wrap gap-3 px-1 text-[10px] text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
          %120+ aşıldı
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#F59E0B' }} />
          %100–120
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
          %80–100
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#4A90D9' }} />
          %80 altı açık
        </span>
        <span className="ml-auto opacity-60">--- hedef</span>
      </div>
    </div>
  )
}
