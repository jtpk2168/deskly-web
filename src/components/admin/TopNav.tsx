'use client'

import { useEffect, useState } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { Bell } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'

type AccountSummary = {
    name: string
    email: string
}

function toDisplayName(user: SupabaseUser | null) {
    if (!user) return 'Admin'

    const metadata = user.user_metadata as Record<string, unknown> | null
    const fullName = typeof metadata?.full_name === 'string' ? metadata.full_name.trim() : ''
    if (fullName) return fullName

    const name = typeof metadata?.name === 'string' ? metadata.name.trim() : ''
    if (name) return name

    const email = user.email?.trim()
    if (email) return email.split('@')[0]

    return 'Admin'
}

function toAccountSummary(user: SupabaseUser | null): AccountSummary {
    return {
        name: toDisplayName(user),
        email: user?.email ?? 'No email',
    }
}

function toInitials(name: string) {
    const chunks = name.trim().split(/\s+/).filter(Boolean)
    if (chunks.length === 0) return 'A'
    if (chunks.length === 1) return chunks[0].slice(0, 1).toUpperCase()
    return `${chunks[0].slice(0, 1)}${chunks[1].slice(0, 1)}`.toUpperCase()
}

export function TopNav() {
    const [account, setAccount] = useState<AccountSummary>({ name: 'Admin', email: 'No email' })

    useEffect(() => {
        let isMounted = true

        const syncAccountFromUser = (user: SupabaseUser | null) => {
            if (!isMounted) return
            setAccount(toAccountSummary(user))
        }

        const loadUser = async () => {
            const { data } = await supabase.auth.getUser()
            syncAccountFromUser(data.user ?? null)
        }

        loadUser()

        const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
            syncAccountFromUser(session?.user ?? null)
        })

        return () => {
            isMounted = false
            authSubscription.subscription.unsubscribe()
        }
    }, [])

    return (
        <header className="border-b border-slate-200 bg-white/85 backdrop-blur">
            <div className="flex h-16 items-center justify-end px-6 lg:px-8">
                <div className="flex items-center gap-3">
                    <button className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-subtext-light transition hover:border-primary/30 hover:text-primary">
                        <Bell className="h-4 w-4" />
                        <span className="absolute right-2.5 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
                    </button>
                    <div className="h-9 w-px bg-slate-200" />
                    <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold tracking-wide text-white">
                            {toInitials(account.name)}
                        </div>
                        <div className="hidden md:block">
                            <p className="text-sm font-semibold text-text-light">{account.name}</p>
                            <p className="text-xs text-subtext-light">{account.email}</p>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    )
}
