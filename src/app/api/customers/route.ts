import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { successResponse, errorResponse } from '../../../../lib/apiResponse'

/** GET /api/customers — List all CUSTOMER users */
export async function GET(request: NextRequest) {
    try {
        const { data: authData, error: authError } = await supabaseServer.auth.admin.listUsers();
        if (authError) return errorResponse(authError.message, 500);

        const { data: profileData, error: profileError } = await supabaseServer
            .from('profiles')
            .select('id, full_name');

        if (profileError) console.error('Supabase Error (Profiles):', profileError);

        const profilesMap = new Map(profileData?.map(p => [p.id, p]) || []);

        const customers = authData.users
            .filter(user => user.app_metadata?.role !== 'admin')
            .map((user) => {
                const profile: any = profilesMap.get(user.id);
                return {
                    id: user.id,
                    name: profile?.full_name || user.user_metadata?.full_name || 'N/A',
                    email: user.email || 'No Email',
                    role: 'Customer',
                    joinedDate: new Date(user.created_at).toLocaleDateString(),
                };
            });

        return successResponse(customers);
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
