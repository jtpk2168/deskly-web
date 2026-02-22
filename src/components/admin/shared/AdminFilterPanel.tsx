import { type ReactNode } from 'react'
import { AdminPanel } from '@/components/admin/shared/AdminPanel'

type AdminFilterPanelProps = {
    title: string
    description?: string
    actions?: ReactNode
    children: ReactNode
    className?: string
}

export function AdminFilterPanel({
    title,
    description,
    actions,
    children,
    className,
}: AdminFilterPanelProps) {
    return (
        <AdminPanel className={className ? `p-5 ${className}` : 'p-5'}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtext-light">{title}</p>
                    {description ? <p className="mt-1 text-sm text-subtext-light">{description}</p> : null}
                </div>
                {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
            </div>
            {children}
        </AdminPanel>
    )
}
