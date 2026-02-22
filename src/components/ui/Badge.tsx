import React from 'react'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'outline'

interface BadgeProps {
    children: React.ReactNode
    variant?: BadgeVariant
    className?: string
}

function toClassName(...parts: Array<string | undefined>) {
    return parts.filter(Boolean).join(' ')
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
    const variants: Record<BadgeVariant, string> = {
        default: 'bg-primary/10 text-primary-dark',
        success: 'bg-green-100 text-green-800',
        warning: 'bg-yellow-100 text-yellow-800',
        error: 'bg-red-100 text-red-800',
        outline: 'border border-gray-200 text-gray-800',
    }

    return (
        <span className={toClassName('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', variants[variant], className)}>
            {children}
        </span>
    )
}
