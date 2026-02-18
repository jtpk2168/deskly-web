import { Sidebar } from '@/components/admin/Sidebar'
import { TopNav } from '@/components/admin/TopNav'

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/80">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
                <TopNav />
                <main className="flex-1 overflow-y-auto p-6 lg:p-8">
                    <div className="mx-auto w-full max-w-[1600px]">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    )
}
