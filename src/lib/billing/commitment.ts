function isValidDate(value: Date) {
    return !Number.isNaN(value.getTime())
}

export function parseOptionalIsoDate(value: unknown, fieldName: string) {
    if (value == null || value === '') {
        return { value: null as string | null, error: null as string | null }
    }

    if (typeof value !== 'string') {
        return { value: null as string | null, error: `${fieldName} must be an ISO date string` }
    }

    const parsed = new Date(value)
    if (!isValidDate(parsed)) {
        return { value: null as string | null, error: `Invalid ${fieldName} format` }
    }

    return { value: parsed.toISOString(), error: null as string | null }
}

export function addMonths(isoDate: string, months: number) {
    const date = new Date(isoDate)
    const next = new Date(date)
    next.setUTCMonth(next.getUTCMonth() + months)
    return next.toISOString()
}

export function calculateCommitmentEndDate(startDateIso: string, minimumTermMonths: number, explicitEndDateIso?: string | null) {
    if (explicitEndDateIso) return explicitEndDateIso
    return addMonths(startDateIso, minimumTermMonths)
}

