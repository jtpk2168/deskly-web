import { AdminPanel } from '@/components/admin/shared/AdminPanel'

type LoadingStateProps = {
    message: string
}

export function LoadingState({ message }: LoadingStateProps) {
    return (
        <AdminPanel className="p-10 text-center text-subtext-light">
            {message}
        </AdminPanel>
    )
}
