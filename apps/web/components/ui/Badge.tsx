'use client'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'outline'
  className?: string
  color?: { bg: string; text: string; border: string }
}

export function Badge({ children, variant = 'default', className = '', color }: BadgeProps) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition-colors'

  if (color) {
    return (
      <span className={`${base} ${color.bg} ${color.text} ${variant === 'outline' ? `border ${color.border}` : ''} ${className}`}>
        {children}
      </span>
    )
  }

  const styles = variant === 'outline'
    ? 'border border-gray-200 text-muted bg-transparent'
    : 'bg-gray-100 text-muted'

  return <span className={`${base} ${styles} ${className}`}>{children}</span>
}
