import { type ReactNode } from 'react'

type AdminPanelProps = {
    children: ReactNode
    className?: string
}

function toClassName(...parts: Array<string | undefined>) {
    return parts.filter(Boolean).join(' ')
}

export function AdminPanel({ children, className }: AdminPanelProps) {
    return (
        <section className={toClassName('rounded-2xl border border-slate-200 bg-white shadow-sm', className)}>
            {children}
        </section>
    )
}
