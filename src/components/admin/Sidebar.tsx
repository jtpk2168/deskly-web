'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    LayoutDashboard,
    Package,
    ShoppingCart,
    Truck,
    ReceiptText,
    Users,
    Shield,
    Settings,
    LogOut,
} from 'lucide-react'

const menuItems = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Products', href: '/admin/products', icon: Package },
    { name: 'Delivery Orders', href: '/admin/delivery-orders', icon: Truck },
    { name: 'Subscriptions', href: '/admin/subscriptions', icon: ShoppingCart },
    { name: 'Invoices', href: '/admin/invoices', icon: ReceiptText },
    { name: 'Customers', href: '/admin/customers', icon: Users },
    { name: 'Admins', href: '/admin/admins', icon: Shield },
    { name: 'Settings', href: '/admin/settings', icon: Settings },
]

function isItemActive(pathname: string, href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname === href || pathname.startsWith(`${href}/`)
}

export function Sidebar() {
    const pathname = usePathname()

    return (
        <aside className="relative flex h-screen w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-linear-to-b from-primary/10 to-transparent" />

            <div className="relative border-b border-slate-200 px-5 py-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-sm font-bold tracking-[0.2em] text-white">
                        D
                    </div>
                    <div>
                        <p className="text-base font-bold tracking-wide text-text-light">DESKLY</p>
                        <p className="text-xs uppercase tracking-[0.14em] text-subtext-light">Admin Portal</p>
                    </div>
                </div>
            </div>

            <nav className="relative flex-1 overflow-y-auto px-3 py-5">
                <p className="px-2 text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Navigation</p>
                <ul className="mt-3 space-y-1.5">
                    {menuItems.map((item) => {
                        const isActive = isItemActive(pathname, item.href)
                        const Icon = item.icon
                        return (
                            <li key={item.name}>
                                <Link
                                    href={item.href}
                                    className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${isActive
                                        ? 'border-primary/20 bg-primary/10 text-primary-dark shadow-sm'
                                        : 'border-transparent text-subtext-light hover:border-slate-200 hover:bg-slate-50 hover:text-text-light'
                                        }`}
                                >
                                    <span
                                        className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${isActive
                                            ? 'bg-primary/20 text-primary-dark'
                                            : 'bg-slate-100 text-subtext-light group-hover:bg-slate-200 group-hover:text-text-light'
                                            }`}
                                    >
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    {item.name}
                                </Link>
                            </li>
                        )
                    })}
                </ul>
            </nav>

            <div className="relative border-t border-slate-200 p-4">
                <button className="flex w-full items-center gap-3 rounded-xl border border-red-200 bg-red-50/60 px-3 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100">
                    <LogOut className="h-4 w-4" />
                    Logout
                </button>
            </div>
        </aside>
    )
}
