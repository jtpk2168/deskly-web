import { Upload } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader'
import { EmptyState } from '@/components/admin/shared/EmptyState'

export default function ReelsManager() {
    return (
        <div className="space-y-6">
            <AdminPageHeader
                eyebrow="Content"
                title="Reels Management"
                description="Manage short-form media uploads for marketing and product highlights."
                actions={(
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark"
                    >
                        <Upload className="h-4 w-4" />
                        Upload New Reel
                    </button>
                )}
            />

            <EmptyState
                title="No reels uploaded yet"
                description="Upload your first reel to start managing media content in the admin portal."
            />
        </div>
    )
}
