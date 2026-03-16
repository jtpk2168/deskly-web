import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { errorResponse, successResponse } from '../../../../lib/apiResponse'
import { requireAdmin } from '../../../../lib/apiAuth'
import { fetchAllAuthUsers } from '@/lib/authAdminUsers'
import { paginateArray, parsePaginationParams } from '@/lib/pagination'

type CustomerRecord = {
    id: string
    name: string
    email: string
    role: 'Customer'
    joinedDate: string
}

type ProfileRecord = {
    id: string
    full_name: string | null
}

type AuthCustomerUser = {
    id: string
    email?: string | null
    created_at: string
    app_metadata?: { role?: string | null }
    user_metadata?: { full_name?: string | null }
}

function formatJoinedDate(value: string) {
    return new Date(value).toLocaleDateString()
}

function logRouteError(context: string, error: unknown) {
    console.error(`[api/customers] ${context}:`, error)
}

function toProfileMap(profileData: ProfileRecord[] | null | undefined) {
    return new Map((profileData ?? []).map((profile) => [profile.id, profile]))
}

function toCustomerRecord(user: AuthCustomerUser, profile: ProfileRecord | undefined): CustomerRecord {
    return {
        id: user.id,
        name: profile?.full_name || user.user_metadata?.full_name || 'N/A',
        email: user.email || 'No Email',
        role: 'Customer',
        joinedDate: formatJoinedDate(user.created_at),
    }
}

/** GET /api/customers — List all CUSTOMER users */
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdmin(request)
        if (!auth.authenticated) return auth.response

        const { searchParams } = new URL(request.url)
        const { page, limit } = parsePaginationParams(searchParams)

        const { users: authUsers, error: authError } = await fetchAllAuthUsers()
        if (authError) return errorResponse(authError.message, 500)

        const { data: profileData, error: profileError } = await supabaseServer
            .from('profiles')
            .select('id, full_name')
        if (profileError) logRouteError('profile lookup failed', profileError)

        const profilesMap = toProfileMap((profileData ?? []) as ProfileRecord[])
        const customerUsers = (authUsers as AuthCustomerUser[]).filter((user) => user.app_metadata?.role !== 'admin')
        const customers = customerUsers.map((user) => toCustomerRecord(user, profilesMap.get(user.id)))
        const paginatedCustomers = paginateArray(customers, page, limit)

        return successResponse(paginatedCustomers, 200, {
            page,
            limit,
            total: customers.length,
        })
    } catch (error) {
        logRouteError('GET failed', error)
        return errorResponse('Internal server error', 500)
    }
}

/** DELETE /api/customers?id=... — Delete a customer */
export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireAdmin(request)
        if (!auth.authenticated) return auth.response

        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')
        if (!id) return errorResponse('Customer ID is required', 400)

        const { data: userData, error: userError } = await supabaseServer.auth.admin.getUserById(id)
        if (userError) logRouteError('failed to fetch user', userError)

        if (userData?.user?.app_metadata?.role === 'admin') {
            return errorResponse('Use the /api/admins endpoint to delete admins.', 403)
        }

        const { error: deleteError } = await supabaseServer.auth.admin.deleteUser(id)
        if (deleteError) return errorResponse(deleteError.message, 500)

        return successResponse({ message: 'Customer deleted successfully' })
    } catch (error) {
        logRouteError('DELETE failed', error)
        return errorResponse('Internal server error', 500)
    }
}
