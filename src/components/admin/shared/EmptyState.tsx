import { type ReactNode } from 'react'
import { AdminPanel } from '@/components/admin/shared/AdminPanel'

type EmptyStateProps = {
    title: string
    description: string
    action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
    return (
        <AdminPanel className="p-10 text-center">
            <h3 className="text-lg font-semibold text-text-light">{title}</h3>
            <p className="mt-2 text-sm text-subtext-light">{description}</p>
            {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
        </AdminPanel>
    )
}
