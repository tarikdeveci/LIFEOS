import { View, Text } from 'react-native'
import { palette, radius, fontSize } from '../../theme/tokens'

const STATUS_CONFIG = {
  backlog:     { label: 'Backlog',    color: palette.backlog },
  planned:     { label: 'Planlandı', color: palette.planned },
  in_progress: { label: 'Devam',     color: palette.inProgress },
  blocked:     { label: 'Bloke',     color: palette.blocked },
  done:        { label: 'Tamamlandı',color: palette.done },
  deferred:    { label: 'Ertelendi', color: palette.deferred },
}

interface Props {
  status: keyof typeof STATUS_CONFIG
}

export function StatusBadge({ status }: Props) {
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
        {cfg.label}
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
