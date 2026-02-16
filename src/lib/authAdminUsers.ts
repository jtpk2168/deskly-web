import { supabaseServer } from '../../lib/supabaseServer'

const AUTH_PAGE_SIZE = 1000

type AuthUserRecord = {
    id: string
    email?: string | null
    created_at: string
    app_metadata?: { role?: string }
    user_metadata?: { full_name?: string }
}

export async function fetchAllAuthUsers() {
    const users: AuthUserRecord[] = []
    let page = 1

    while (true) {
        const { data, error } = await supabaseServer.auth.admin.listUsers({
            page,
            perPage: AUTH_PAGE_SIZE,
        })

        if (error) {
            return { users: [] as AuthUserRecord[], error }
        }

        users.push(...(data.users as AuthUserRecord[]))

        if (!data.nextPage) break
        page = data.nextPage
    }

    return { users, error: null }
}
