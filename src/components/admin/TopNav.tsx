'use client'

import { useEffect, useMemo, useState } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { Bell, ChevronRight } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'

type AccountSummary = {
    name: string
    email: string
}

type PageMeta = {
    title: string
    subtitle: string
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

function toTitleCase(value: string) {
    return value
        .split('-')
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
        .join(' ')
}

function getPageMeta(pathname: string): PageMeta {
    if (pathname === '/admin') {
        return { title: 'Dashboard', subtitle: 'Live performance view across orders, products, and users.' }
    }
    if (pathname === '/admin/products') {
        return { title: 'Products', subtitle: 'Manage inventory, pricing, and product media.' }
    }
    if (pathname === '/admin/products/new') {
        return { title: 'Add Product', subtitle: 'Create a new product and publish it to catalog.' }
    }
    if (pathname.startsWith('/admin/products/')) {
        return { title: 'Edit Product', subtitle: 'Update product details, pricing tiers, and status.' }
    }
    if (pathname.startsWith('/admin/delivery-orders')) {
        return { title: 'Delivery Orders', subtitle: 'Track dispatch, delivery outcomes, and fulfillment transitions.' }
    }
    if (pathname.startsWith('/admin/subscriptions')) {
        return { title: 'Subscriptions', subtitle: 'Manage billing-focused subscription lifecycle and monetary states.' }
    }
    if (pathname.startsWith('/admin/orders')) {
        return { title: 'Orders', subtitle: 'Redirecting to Delivery Orders...' }
    }
    if (pathname.startsWith('/admin/invoices')) {
        return { title: 'Invoices', subtitle: 'Review billing records and payment outcomes.' }
    }
    if (pathname.startsWith('/admin/customers')) {
        return { title: 'Customers', subtitle: 'View and manage customer accounts.' }
    }
    if (pathname.startsWith('/admin/admins')) {
        return { title: 'Admins', subtitle: 'Manage administrative access and roles.' }
    }
    if (pathname.startsWith('/admin/settings')) {
        return { title: 'Settings', subtitle: 'Configure platform behavior and integrations.' }
    }

    const segments = pathname.split('/').filter(Boolean)
    const fallbackLabel = segments.length > 1 ? toTitleCase(segments[segments.length - 1]) : 'Overview'
    return { title: fallbackLabel, subtitle: 'Admin workspace' }
}

export function TopNav() {
    const pathname = usePathname()
    const [account, setAccount] = useState<AccountSummary>({ name: 'Admin', email: 'No email' })
    const pageMeta = useMemo(() => getPageMeta(pathname), [pathname])

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
            <div className="flex h-20 items-center justify-between px-6 lg:px-8">
                <div>
                    <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-subtext-light">
                        <span>Admin</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                        <span>{pageMeta.title}</span>
                    </div>
                    <h2 className="mt-1 text-xl font-semibold text-text-light">{pageMeta.title}</h2>
                    <p className="text-xs text-subtext-light">{pageMeta.subtitle}</p>
                </div>
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
