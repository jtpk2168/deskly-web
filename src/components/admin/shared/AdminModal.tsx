import { type ReactNode } from 'react'
import { X } from 'lucide-react'

type AdminModalProps = {
    open: boolean
    onClose: () => void
    eyebrow?: string
    title: string
    maxWidth?: string
    children: ReactNode
}

function toClassName(...parts: Array<string | undefined>) {
    return parts.filter(Boolean).join(' ')
}

export function AdminModal({
    open,
    onClose,
    eyebrow,
    title,
    maxWidth = 'max-w-4xl',
    children,
}: AdminModalProps) {
    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/55 p-4 backdrop-blur-sm md:p-8">
            <div className={toClassName('mx-auto w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl', maxWidth)}>
                <div className="border-b border-slate-200 bg-linear-to-r from-slate-50 via-white to-slate-50 px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            {eyebrow ? (
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-subtext-light">
                                    {eyebrow}
                                </p>
                            ) : null}
                            <h2 className="mt-1 text-3xl font-bold tracking-tight text-text-light">{title}</h2>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full border border-slate-200 bg-white p-2 text-subtext-light transition-colors hover:border-slate-300 hover:text-text-light"
                            aria-label="Close dialog"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>
                <div className="max-h-[calc(100vh-13rem)] overflow-y-auto px-6 py-6">
                    {children}
                </div>
            </div>
        </div>
    )
}
