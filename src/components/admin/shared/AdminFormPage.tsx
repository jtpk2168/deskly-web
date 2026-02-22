import Link from 'next/link'
import { type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { AdminPanel } from '@/components/admin/shared/AdminPanel'

type AdminFormPageProps = {
    backHref: string
    title: string
    subtitle?: string
    children: ReactNode
    maxWidthClassName?: string
}

export function AdminFormPage({
    backHref,
    title,
    subtitle,
    children,
    maxWidthClassName = 'max-w-3xl',
}: AdminFormPageProps) {
    return (
        <div className={`mx-auto ${maxWidthClassName}`}>
            <div className="mb-6 flex items-center gap-4">
                <Link href={backHref} className="text-subtext-light transition-colors hover:text-text-light">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-text-light">{title}</h1>
                    {subtitle ? <p className="mt-1 text-sm text-subtext-light">{subtitle}</p> : null}
                </div>
            </div>

            <AdminPanel className="space-y-6 rounded-lg border-gray-200 p-6">
                {children}
            </AdminPanel>
        </div>
    )
}
