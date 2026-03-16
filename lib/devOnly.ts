import { errorResponse } from './apiResponse'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

/**
 * Returns an error response if the current environment is production.
 * Use this to gate dev/test-only endpoints.
 */
export function rejectInProduction() {
    if (IS_PRODUCTION) {
        return errorResponse('This endpoint is not available in production', 404)
    }
    return null
}
