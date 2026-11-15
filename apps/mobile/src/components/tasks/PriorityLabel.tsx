import { Text } from 'react-native'
import { wsjfToPriorityLabel } from '@lifeos/shared'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { fontSize } from '@/src/theme/tokens'

interface PriorityLabelProps {
  score: number
}

// "WSJF 1.5" kullanıcıya bir şey anlatmıyordu (#19): skoru kritik, yüksek, orta, düşük diye okutur.
export function PriorityLabel({ score }: PriorityLabelProps) {
  const { colors } = useTheme()
  const { t } = useLang()
  return (
    <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
      {t.task_priority}: {priorityWord(t, score)}
    </Text>
  )
}

export function priorityWord(t: { task_priority_critical: string; task_priority_high: string; task_priority_medium: string; task_priority_low: string }, score: number): string {
  const level = wsjfToPriorityLabel(score)
  if (level === 'critical') return t.task_priority_critical
  if (level === 'high') return t.task_priority_high
  if (level === 'medium') return t.task_priority_medium
  return t.task_priority_low
}
