'use client';

import { Bell, User } from 'lucide-react';

export function TopNav() {
    return (
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-surface-light px-6">
            <div className="flex items-center">
                {/* Breadcrumb or Page Title can go here */}
                <h2 className="text-lg font-semibold text-text-light">Overview</h2>
            </div>
            <div className="flex items-center gap-4">
                <button className="rounded-full p-2 text-subtext-light hover:bg-gray-100 hover:text-text-light relative">
                    <Bell className="h-5 w-5" />
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
                </button>
                <div className="h-8 w-px bg-gray-200"></div>
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary-dark">
                        <User className="h-5 w-5" />
                    </div>
                    <div className="hidden md:block">
                        <p className="text-sm font-medium text-text-light">Admin User</p>
                        <p className="text-xs text-subtext-light">admin@deskly.com</p>
                    </div>
                </div>
            </div>
        </header>
    );
}
