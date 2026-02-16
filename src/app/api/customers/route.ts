import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { successResponse, errorResponse } from '../../../../lib/apiResponse'
import { parsePaginationParams, paginateArray } from '@/lib/pagination'
import { fetchAllAuthUsers } from '@/lib/authAdminUsers'

type CustomerRecord = {
    id: string
    name: string
    email: string
    role: 'Customer'
    joinedDate: string
}

/** GET /api/customers — List all CUSTOMER users */
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

        const customers = authUsers
            .filter(user => user.app_metadata?.role !== 'admin')
            .map((user) => {
                const profile = profilesMap.get(user.id);
                return {
                    id: user.id,
                    name: profile?.full_name || user.user_metadata?.full_name || 'N/A',
                    email: user.email || 'No Email',
                    role: 'Customer' as const,
                    joinedDate: new Date(user.created_at).toLocaleDateString(),
                };
            });

        const paginatedCustomers = paginateArray(customers, page, limit)

        return successResponse(paginatedCustomers as CustomerRecord[], 200, {
            page,
            limit,
            total: customers.length,
        });
    } catch (err) {
        console.error('API Error (Customers):', err);
        return errorResponse('Internal server error', 500)
    }
}

/** DELETE /api/customers?id=... — Delete a customer */
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) return errorResponse('Customer ID is required', 400);

        // Security check: Ensure we aren't accidentally deleting an admin via this route?
        // (Supabase allows it via ID, but logic-wise we might want to restrict)
        const { data: userData } = await supabaseServer.auth.admin.getUserById(id);

        if (userData?.user?.app_metadata?.role === 'admin') {
            return errorResponse('Use the /api/admins endpoint to delete admins.', 403);
        }

        const { error: deleteError } = await supabaseServer.auth.admin.deleteUser(id);
        if (deleteError) return errorResponse(deleteError.message, 500);

        return successResponse({ message: 'Customer deleted successfully' });

    } catch (err) {
        console.error('API Error (Delete Customer):', err);
        return errorResponse('Internal server error', 500);
    }
}
