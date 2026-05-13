'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantStyles: Record<Variant, string> = {
  primary:   'bg-accent text-white hover:bg-accent/90 shadow-sm',
  secondary: 'bg-border/50 text-primary hover:bg-border dark:bg-surface dark:hover:bg-border',
  ghost:     'text-muted hover:bg-border/50 hover:text-primary dark:hover:bg-border/30',
  danger:    'bg-danger text-white hover:bg-danger/90',
  outline:   'border border-border text-primary hover:bg-border/30 dark:hover:bg-border/20',
}

const sizeStyles: Record<Size, string> = {
  sm:   'px-3 py-1.5 text-xs rounded-md gap-1.5',
  md:   'px-4 py-2 text-sm rounded-lg gap-2',
  lg:   'px-6 py-2.5 text-base rounded-lg gap-2',
  icon: 'p-2 rounded-lg',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {loading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
export { Button }
export type { ButtonProps }
