function getOrdinalDay(day: number) {
    const mod100 = day % 100
    if (mod100 >= 11 && mod100 <= 13) return `${day}th`

    const mod10 = day % 10
    if (mod10 === 1) return `${day}st`
    if (mod10 === 2) return `${day}nd`
    if (mod10 === 3) return `${day}rd`

    return `${day}th`
}

function toDate(value: string | null) {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
}

function formatLongDate(parsed: Date) {
    const day = getOrdinalDay(parsed.getDate())
    const month = parsed.toLocaleString('en-US', { month: 'long' })
    const year = parsed.getFullYear()
    return `${day} ${month} ${year}`
}

export function formatShortId(value: string, size = 8) {
    const normalized = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    return normalized.slice(0, size)
}

export function formatInitials(name: string, fallback = 'U') {
    const chunks = name.trim().split(/\s+/).filter(Boolean)
    if (chunks.length === 0) return fallback
    if (chunks.length === 1) return chunks[0].slice(0, 1).toUpperCase()
    return `${chunks[0].slice(0, 1)}${chunks[1].slice(0, 1)}`.toUpperCase()
}

export function formatDate(value: string | null) {
    const parsed = toDate(value)
    if (!parsed) return '-'
    return formatLongDate(parsed)
}

export function formatDateTime(value: string | null) {
    const parsed = toDate(value)
    if (!parsed) return '-'
    const time = parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return `${formatLongDate(parsed)}, ${time}`
}

export function formatCurrency(value: number | null, currency = 'RM', fallback = '-') {
    if (value == null) return fallback
    return `${currency.toUpperCase()} ${value.toFixed(2)}`
}

export function toTitleStatus(status: string | null) {
    if (!status) return '-'
    return status
        .split('_')
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
        .join(' ')
}

export function shorten(value: string | null, size = 12) {
    if (!value) return '-'
    if (value.length <= size) return value
    return `${value.slice(0, size)}...`
}

export function formatAddress(value: string | null) {
    if (!value || value.trim().length === 0) return '-'
    return value
}

export function formatAddressParts(
    line1: string | null | undefined,
    city: string | null | undefined,
    postal: string | null | undefined,
) {
    const parts = [
        line1?.trim(),
        [city?.trim(), postal?.trim()].filter(Boolean).join(' ').trim(),
    ].filter((entry) => entry && entry.length > 0) as string[]
    return parts.length > 0 ? parts.join(', ') : '-'
}

export function formatInvoicePeriod(periodStartAt: string | null, periodEndAt: string | null) {
    if (!periodStartAt && !periodEndAt) return '-'

    const start = formatDateTime(periodStartAt)
    const end = formatDateTime(periodEndAt)

    if (start === '-' && end === '-') return '-'
    if (start === end) return start
    if (start === '-') return end
    if (end === '-') return start

    return `${start} -> ${end}`
}

export function formatSstRate(rate: number) {
    return `${(rate * 100).toFixed(2)}%`
}

export function formatSyncAction(action: 'skipped' | 'created') {
    if (action === 'created') return 'Created in Stripe'
    return 'Already up to date'
}

export function formatRelativeTime(value: Date | null) {
    if (!value) return 'Not synced yet'
    return `Updated ${value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}
