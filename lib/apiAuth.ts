import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { errorResponse } from './apiResponse'

type AuthResult =
    | { authenticated: true; userId: string; role: string | null }
    | { authenticated: false; response: ReturnType<typeof errorResponse> }

/**
 * Verify that the request has a valid Supabase session via cookies.
 * Returns the authenticated user's ID and role, or an error response.
 */
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll() {
                    // API routes don't need to set cookies for auth checks.
                },
            },
        },
    )

    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        return { authenticated: false, response: errorResponse('Authentication required', 401) }
    }

    const role = (user.app_metadata?.role as string) ?? null
    return { authenticated: true, userId: user.id, role }
}

/**
 * Require the caller to be an authenticated admin user.
 */
export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
    const auth = await requireAuth(request)
    if (!auth.authenticated) return auth

    if (auth.role !== 'admin') {
        return { authenticated: false, response: errorResponse('Admin access required', 403) }
    }

    return auth
}
