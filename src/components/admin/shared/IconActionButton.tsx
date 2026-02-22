import { type LucideIcon } from 'lucide-react'

type IconActionButtonTone = 'default' | 'danger'

type IconActionButtonProps = {
    label: string
    onClick: () => void
    icon: LucideIcon
    disabled?: boolean
    tone?: IconActionButtonTone
}

export function IconActionButton({
    label,
    onClick,
    icon: Icon,
    disabled = false,
    tone = 'default',
}: IconActionButtonProps) {
    const toneClass = tone === 'danger'
        ? 'hover:border-red-300 hover:bg-red-50 hover:text-red-600'
        : 'hover:border-primary/40 hover:text-primary'

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-subtext-light transition disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
            aria-label={label}
            title={label}
        >
            <Icon className="h-4 w-4" />
        </button>
    )
}
