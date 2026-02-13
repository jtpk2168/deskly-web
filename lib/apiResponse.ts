import { NextResponse } from 'next/server'

type ApiMeta = {
    page?: number
    limit?: number
    total?: number
}

/** Success response with data */
export function successResponse<T>(data: T, status = 200, meta?: ApiMeta) {
    return NextResponse.json({ data, error: null, meta: meta ?? null }, { status })
}

/** Error response with message */
export function errorResponse(message: string, status = 400) {
    return NextResponse.json({ data: null, error: message, meta: null }, { status })
}

/** Parse a UUID param — returns null if invalid format */
export function parseUUID(id: string): string | null {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(id) ? id : null
}
