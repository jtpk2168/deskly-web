import { type ReactNode } from 'react'

type AdminPageHeaderProps = {
    eyebrow: string
    title: string
    description: string
    actions?: ReactNode
    decorative?: boolean
}

export function AdminPageHeader({
    eyebrow,
    title,
    description,
    actions,
    decorative = true,
}: AdminPageHeaderProps) {
    return (
        <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {decorative ? (
                <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
            ) : null}
            <div className="relative flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">{eyebrow}</p>
                    <h1 className="mt-1 text-2xl font-bold text-text-light">{title}</h1>
                    <p className="mt-1 text-sm text-subtext-light">{description}</p>
                </div>
                {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
        </section>
    )
}
