import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { successResponse, errorResponse } from '../../../../lib/apiResponse'
import { parsePaginationParams, paginateArray } from '@/lib/pagination'
import { fetchAllAuthUsers } from '@/lib/authAdminUsers'

type AdminRecord = {
    id: string
    name: string
    email: string
    role: 'Admin'
    joinedDate: string
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

/** DELETE /api/admins?id=... — Delete an admin (Protects Super Admin) */
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) return errorResponse('Admin ID is required', 400);

        const { data: userData, error: userError } = await supabaseServer.auth.admin.getUserById(id);

        if (userError) console.error('Error fetching user:', userError);

        if (userData?.user?.email === 'biz@spaceowl.com') {
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
