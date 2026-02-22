import { NextResponse } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'

function getErrorMessage(error: unknown): string | undefined {
    if (typeof error !== 'object' || error == null || !('message' in error)) return undefined
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' ? message : undefined
}

export async function GET() {
    try {
        const email = 'biz@spaceowl.com'
        const password = '123456'

        const { data: listData, error: listError } = await supabaseServer.auth.admin.listUsers()
        if (listError) throw listError

        const existingUser = listData.users.find((user) => user.email === email)

        if (existingUser) {
            const { data: updatedUser, error: updateError } = await supabaseServer.auth.admin.updateUserById(
                existingUser.id,
                { app_metadata: { role: 'admin' } },
            )

            if (updateError) throw updateError

            return NextResponse.json({ message: 'User updated to Admin', user: updatedUser })
        }

        const { data: newUser, error: createError } = await supabaseServer.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: 'Super Admin' },
            app_metadata: { role: 'admin' },
        })

        if (createError) throw createError

        return NextResponse.json({ message: 'User created successfully', user: newUser })
    } catch (error) {
        console.error('[api/setup-admin] GET failed:', error)
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 })
    }
}
