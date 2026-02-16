export type PaginationParams = {
    page: number
    limit: number
    from: number
    to: number
}

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 100

function parsePositiveInteger(value: string | null, fallback: number) {
    const parsed = Number.parseInt(value ?? '', 10)
    if (!Number.isFinite(parsed) || parsed < 1) return fallback
    return parsed
}

export function parsePaginationParams(searchParams: URLSearchParams): PaginationParams {
    const page = parsePositiveInteger(searchParams.get('page'), DEFAULT_PAGE)
    const requestedLimit = parsePositiveInteger(searchParams.get('limit'), DEFAULT_LIMIT)
    const limit = Math.min(MAX_LIMIT, requestedLimit)
    const from = (page - 1) * limit
    const to = from + limit - 1

    return { page, limit, from, to }
}

export function paginateArray<T>(items: T[], page: number, limit: number) {
    const from = (page - 1) * limit
    const to = from + limit
    return items.slice(from, to)
}
