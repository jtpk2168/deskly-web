import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { errorResponse, successResponse } from '../../../../lib/apiResponse'
import { requireAdmin } from '../../../../lib/apiAuth'
import { fetchAllAuthUsers } from '@/lib/authAdminUsers'
import { paginateArray, parsePaginationParams } from '@/lib/pagination'

const SUPER_ADMIN_EMAILS = new Set(['biz@spaceowl.com'])

type AdminRecord = {
    id: string
    name: string
    email: string
    role: 'Admin'
    joinedDate: string
    isSuperAdmin: boolean
}

type ProfileRecord = {
    id: string
    full_name: string | null
}

type AuthAdminUser = {
    id: string
    email?: string | null
    created_at: string
    app_metadata?: { role?: string | null }
    user_metadata?: { full_name?: string | null }
}

function isEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizeString(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
}

function normalizeEmail(value: unknown) {
    return normalizeString(value).toLowerCase()
}

function formatJoinedDate(value: string) {
    return new Date(value).toLocaleDateString()
}

function isSuperAdminEmail(email: string | null | undefined) {
    if (!email) return false
    return SUPER_ADMIN_EMAILS.has(email.trim().toLowerCase())
}

function logRouteError(context: string, error: unknown) {
    console.error(`[api/admins] ${context}:`, error)
}

function toProfileMap(profileData: ProfileRecord[] | null | undefined) {
    return new Map((profileData ?? []).map((profile) => [profile.id, profile]))
}

function toAdminRecord(user: AuthAdminUser, profile: ProfileRecord | undefined): AdminRecord {
    return {
        id: user.id,
        name: profile?.full_name || user.user_metadata?.full_name || 'N/A',
        email: user.email || 'No Email',
        role: 'Admin',
        joinedDate: formatJoinedDate(user.created_at),
        isSuperAdmin: isSuperAdminEmail(user.email),
    }
}

async function parseBody(request: NextRequest) {
    return request.json().catch(() => ({}))
}

async function upsertAdminProfile(userId: string, fullName: string) {
    const nowIso = new Date().toISOString()
    const { error } = await supabaseServer
        .from('profiles')
        .upsert(
            {
                id: userId,
                full_name: fullName,
                role: 'admin',
                updated_at: nowIso,
            },
            { onConflict: 'id' },
        )

    return error
}

/** GET /api/admins — List all ADMIN users */
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
        const adminUsers = (authUsers as AuthAdminUser[]).filter((user) => user.app_metadata?.role === 'admin')
        const admins = adminUsers.map((user) => toAdminRecord(user, profilesMap.get(user.id)))
        const paginatedAdmins = paginateArray(admins, page, limit)

        return successResponse(paginatedAdmins, 200, {
            page,
            limit,
            total: admins.length,
        })
    } catch (error) {
        logRouteError('GET failed', error)
        return errorResponse('Internal server error', 500)
    }
}

/** POST /api/admins — Create a new admin */
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAdmin(request)
        if (!auth.authenticated) return auth.response

        const body = await parseBody(request)
        const name = normalizeString(body?.name)
        const email = normalizeEmail(body?.email)
        const password = normalizeString(body?.password)

        if (!name) return errorResponse('Name is required', 400)
        if (!email || !isEmail(email)) return errorResponse('A valid email is required', 400)
        if (!password || password.length < 8) {
            return errorResponse('Password is required and must be at least 8 characters', 400)
        }

        const { data: createdUserData, error: createError } = await supabaseServer.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: name },
            app_metadata: { role: 'admin' },
        })
        if (createError || !createdUserData?.user) {
            return errorResponse(createError?.message ?? 'Failed to create admin', 500)
        }

        const profileError = await upsertAdminProfile(createdUserData.user.id, name)
        if (profileError) logRouteError('failed to upsert admin profile', profileError)

        return successResponse({
            id: createdUserData.user.id,
            name,
            email,
            role: 'Admin' as const,
            joinedDate: formatJoinedDate(createdUserData.user.created_at),
            isSuperAdmin: isSuperAdminEmail(email),
        }, 201)
    } catch (error) {
        logRouteError('POST failed', error)
        return errorResponse('Invalid request body', 400)
    }
}

/** PATCH /api/admins?id=... — Update an admin (Protects Super Admin) */
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAdmin(request)
        if (!auth.authenticated) return auth.response

        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')?.trim()
        if (!id) return errorResponse('Admin ID is required', 400)

        const body = await parseBody(request)
        const name = normalizeString(body?.name)
        const email = normalizeEmail(body?.email)

        if (!name && !email) return errorResponse('At least one field (name or email) is required', 400)
        if (email && !isEmail(email)) return errorResponse('A valid email is required', 400)

        const { data: userData, error: userError } = await supabaseServer.auth.admin.getUserById(id)
        if (userError) return errorResponse(userError.message, 500)
        if (!userData?.user) return errorResponse('Admin not found', 404)
        if (userData.user.app_metadata?.role !== 'admin') return errorResponse('User is not an admin', 400)
        if (isSuperAdminEmail(userData.user.email)) return errorResponse('Cannot edit Super Admin user.', 403)

        const nextUserMetadata = {
            ...(userData.user.user_metadata ?? {}),
            ...(name ? { full_name: name } : {}),
        }
        const nextAppMetadata = {
            ...(userData.user.app_metadata ?? {}),
            role: 'admin',
        }

        const { error: updateError } = await supabaseServer.auth.admin.updateUserById(id, {
            ...(email ? { email } : {}),
            user_metadata: nextUserMetadata,
            app_metadata: nextAppMetadata,
        })
        if (updateError) return errorResponse(updateError.message, 500)

        if (name) {
            const profileError = await upsertAdminProfile(id, name)
            if (profileError) logRouteError('failed to update admin profile', profileError)
        }

        return successResponse({ message: 'Admin updated successfully' })
    } catch (error) {
        logRouteError('PATCH failed', error)
        return errorResponse('Invalid request body', 400)
    }
}

/** DELETE /api/admins?id=... — Delete an admin (Protects Super Admin) */
export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireAdmin(request)
        if (!auth.authenticated) return auth.response

        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')
        if (!id) return errorResponse('Admin ID is required', 400)

        const { data: userData, error: userError } = await supabaseServer.auth.admin.getUserById(id)
        if (userError) logRouteError('failed to fetch user', userError)

        if (isSuperAdminEmail(userData?.user?.email)) return errorResponse('Cannot delete Super Admin user.', 403)
        if (userData?.user?.app_metadata?.role !== 'admin') return errorResponse('User is not an admin', 400)

        const { error: deleteError } = await supabaseServer.auth.admin.deleteUser(id)
        if (deleteError) return errorResponse(deleteError.message, 500)

        return successResponse({ message: 'Admin deleted successfully' })
    } catch (error) {
        logRouteError('DELETE failed', error)
        return errorResponse('Internal server error', 500)
    }
}
