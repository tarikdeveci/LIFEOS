import { View, Text } from 'react-native'
import { useLang } from '../../contexts/LangContext'
import { palette, radius, fontSize } from '../../theme/tokens'

const STATUS_CONFIG = {
  backlog:     { label: 'tasks_status_backlog',     color: palette.backlog },
  planned:     { label: 'tasks_status_planned',     color: palette.planned },
  in_progress: { label: 'tasks_status_in_progress', color: palette.inProgress },
  blocked:     { label: 'tasks_status_blocked',     color: palette.blocked },
  done:        { label: 'tasks_status_done',        color: palette.done },
  deferred:    { label: 'tasks_status_deferred',    color: palette.deferred },
} as const

interface Props {
  status: keyof typeof STATUS_CONFIG
}

export function StatusBadge({ status }: Props) {
  const { t } = useLang()
  const cfg = STATUS_CONFIG[status]
  return (
    <View
      style={{
        backgroundColor: `${cfg.color}18`,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: `${cfg.color}35`,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <Text style={{ fontSize: fontSize.xs, fontWeight: '600', color: cfg.color }}>
        {t[cfg.label]}
      </Text>
    </View>
  )
}

interface PillProps {
  label: string
  color?: string
}

export function Pill({ label, color = palette.accent }: PillProps) {
  return (
    <View
      style={{
        backgroundColor: `${color}18`,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: `${color}30`,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text style={{ fontSize: fontSize.xs, fontWeight: '600', color }}>{label}</Text>
    </View>
  )
}
