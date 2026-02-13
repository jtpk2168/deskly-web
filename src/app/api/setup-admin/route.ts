import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '../../../../lib/supabaseServer';

export async function GET(request: NextRequest) {
    try {
        const email = 'biz@spaceowl.com';
        const password = '123456';

        // 1. Check if user already exists
        const { data: listData, error: listError } = await supabaseServer.auth.admin.listUsers();

        if (listError) throw listError;

        const existingUser = listData.users.find(u => u.email === email);

        if (existingUser) {
            // Update existing user to have admin role
            const { data: updatedUser, error: updateError } = await supabaseServer.auth.admin.updateUserById(
                existingUser.id,
                { app_metadata: { role: 'admin' } }
            );

            if (updateError) throw updateError;

            return NextResponse.json({ message: 'User updated to Admin', user: updatedUser });
        }

        // 2. Create User
        const { data: newUser, error: createError } = await supabaseServer.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: 'Super Admin' },
            app_metadata: { role: 'admin' }
        });

        if (createError) throw createError;

        return NextResponse.json({ message: 'User created successfully', user: newUser });

    } catch (error: any) {
        console.error('Setup Admin Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
