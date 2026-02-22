import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { successResponse, errorResponse } from '../../../../lib/apiResponse'
import { parsePaginationParams, paginateArray } from '@/lib/pagination'
import { fetchAllAuthUsers } from '@/lib/authAdminUsers'

const SUPER_ADMIN_EMAILS = new Set(['biz@spaceowl.com'])

type AdminRecord = {
    id: string
    name: string
    email: string
    role: 'Admin'
    joinedDate: string
    isSuperAdmin: boolean
}

function isEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizeString(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
}

function isSuperAdminEmail(email: string | null | undefined) {
    if (!email) return false
    return SUPER_ADMIN_EMAILS.has(email.trim().toLowerCase())
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
        const { searchParams } = new URL(request.url)
        const { page, limit } = parsePaginationParams(searchParams)

        const { users: authUsers, error: authError } = await fetchAllAuthUsers();
        if (authError) return errorResponse(authError.message, 500);

        const { data: profileData, error: profileError } = await supabaseServer
            .from('profiles')
            .select('id, full_name');

        if (profileError) console.error('Supabase Error (Profiles):', profileError);

        const profilesMap = new Map(profileData?.map(p => [p.id, p]) || []);

        const admins = authUsers
            .filter(user => user.app_metadata?.role === 'admin')
            .map((user) => {
                const profile = profilesMap.get(user.id);
                return {
                    id: user.id,
                    name: profile?.full_name || user.user_metadata?.full_name || 'N/A',
                    email: user.email || 'No Email',
                    role: 'Admin' as const,
                    joinedDate: new Date(user.created_at).toLocaleDateString(),
                    isSuperAdmin: isSuperAdminEmail(user.email),
                };
            });

        const paginatedAdmins = paginateArray(admins, page, limit)

        return successResponse(paginatedAdmins as AdminRecord[], 200, {
            page,
            limit,
            total: admins.length,
        });
    } catch (err) {
        console.error('API Error (Admins):', err);
        return errorResponse('Internal server error', 500)
    }
}

/** POST /api/admins — Create a new admin */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}))
        const name = normalizeString(body?.name)
        const email = normalizeString(body?.email).toLowerCase()
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
        if (profileError) {
            console.error('Failed to upsert admin profile:', profileError)
        }

        return successResponse({
            id: createdUserData.user.id,
            name,
            email,
            role: 'Admin' as const,
            joinedDate: new Date(createdUserData.user.created_at).toLocaleDateString(),
            isSuperAdmin: isSuperAdminEmail(email),
        }, 201)
    } catch (err) {
        console.error('API Error (Create Admin):', err)
        return errorResponse('Invalid request body', 400)
    }
}

/** PATCH /api/admins?id=... — Update an admin (Protects Super Admin) */
export async function PATCH(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')?.trim()
        if (!id) return errorResponse('Admin ID is required', 400)

        const body = await request.json().catch(() => ({}))
        const name = normalizeString(body?.name)
        const email = normalizeString(body?.email).toLowerCase()

        if (!name && !email) {
            return errorResponse('At least one field (name or email) is required', 400)
        }
        if (email && !isEmail(email)) {
            return errorResponse('A valid email is required', 400)
        }

        const { data: userData, error: userError } = await supabaseServer.auth.admin.getUserById(id)
        if (userError) return errorResponse(userError.message, 500)
        if (!userData?.user) return errorResponse('Admin not found', 404)
        if (userData.user.app_metadata?.role !== 'admin') {
            return errorResponse('User is not an admin', 400)
        }
        if (isSuperAdminEmail(userData.user.email)) {
            return errorResponse('Cannot edit Super Admin user.', 403)
        }

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
            if (profileError) {
                console.error('Failed to update admin profile:', profileError)
            }
        }

        return successResponse({ message: 'Admin updated successfully' })
    } catch (err) {
        console.error('API Error (Update Admin):', err)
        return errorResponse('Invalid request body', 400)
    }
}

/** DELETE /api/admins?id=... — Delete an admin (Protects Super Admin) */
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) return errorResponse('Admin ID is required', 400);

        const { data: userData, error: userError } = await supabaseServer.auth.admin.getUserById(id);

        if (userError) console.error('Error fetching user:', userError);

        if (isSuperAdminEmail(userData?.user?.email)) {
            return errorResponse('Cannot delete Super Admin user.', 403);
        }

        // Double check they are actually an admin? Not strictly necessary if we trust the ID, but good practice.
        if (userData?.user?.app_metadata?.role !== 'admin') {
            return errorResponse('User is not an admin', 400);
        }

        const { error: deleteError } = await supabaseServer.auth.admin.deleteUser(id);
        if (deleteError) return errorResponse(deleteError.message, 500);

        return successResponse({ message: 'Admin deleted successfully' });

    } catch (err) {
        console.error('API Error (Delete Admin):', err);
        return errorResponse('Internal server error', 500);
    }
}
