'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, RefreshCw, Trash } from 'lucide-react'
import { AdminModal } from '@/components/admin/shared/AdminModal'
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader'
import { ErrorState } from '@/components/admin/shared/ErrorState'
import { IconActionButton } from '@/components/admin/shared/IconActionButton'
import { LoadingState } from '@/components/admin/shared/LoadingState'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { PaginationControls } from '@/components/ui/PaginationControls'
import { getRoleVariant } from '@/lib/admin-ui/statusVariants'
import { AdminUser, createAdmin, deleteAdmin, getAdmins, updateAdmin } from '@/lib/api'

function isEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export default function AdminsPage() {
    const [users, setUsers] = useState<AdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(10)
    const [total, setTotal] = useState(0)
    const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
    const [draftName, setDraftName] = useState('')
    const [draftEmail, setDraftEmail] = useState('')
    const [draftPassword, setDraftPassword] = useState('')
    const [formError, setFormError] = useState<string | null>(null)
    const [formSaving, setFormSaving] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await getAdmins({ page, limit })
            setUsers(result.items)
            setTotal(result.total)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load admins')
        } finally {
            setLoading(false)
        }
    }, [page, limit])

    useEffect(() => {
        loadData()
    }, [loadData])

    const closeModal = useCallback(() => {
        setModalMode(null)
        setEditingUser(null)
        setDraftName('')
        setDraftEmail('')
        setDraftPassword('')
        setFormError(null)
        setFormSaving(false)
    }, [])

    const openCreateModal = useCallback(() => {
        setModalMode('create')
        setEditingUser(null)
        setDraftName('')
        setDraftEmail('')
        setDraftPassword('')
        setFormError(null)
    }, [])

    const openEditModal = useCallback((user: AdminUser) => {
        if (user.isSuperAdmin) return
        setModalMode('edit')
        setEditingUser(user)
        setDraftName(user.name === 'N/A' ? '' : user.name)
        setDraftEmail(user.email === 'No Email' ? '' : user.email)
        setDraftPassword('')
        setFormError(null)
    }, [])

    const submitModal = useCallback(async () => {
        const name = draftName.trim()
        const email = draftEmail.trim().toLowerCase()
        const password = draftPassword.trim()

        if (!name) {
            setFormError('Name is required.')
            return
        }
        if (!email || !isEmail(email)) {
            setFormError('A valid email is required.')
            return
        }
        if (modalMode === 'create' && password.length < 8) {
            setFormError('Password must be at least 8 characters.')
            return
        }

        setFormSaving(true)
        setFormError(null)
        try {
            if (modalMode === 'create') {
                await createAdmin({ name, email, password })
            } else if (modalMode === 'edit' && editingUser) {
                await updateAdmin(editingUser.id, { name, email })
            }
            await loadData()
            closeModal()
        } catch (saveError) {
            setFormError(saveError instanceof Error ? saveError.message : 'Failed to save admin')
        } finally {
            setFormSaving(false)
        }
    }, [closeModal, draftEmail, draftName, draftPassword, editingUser, loadData, modalMode])

    const handleDelete = async (userId: string) => {
        if (!confirm('Are you sure you want to delete this admin?')) return
        try {
            await deleteAdmin(userId)
            await loadData()
        } catch (deleteError) {
            alert(deleteError instanceof Error ? deleteError.message : 'Failed to delete admin')
        }
    }

    const columns: Array<{
        header: string
        accessorKey?: keyof AdminUser
        cell?: (row: AdminUser) => ReactNode
    }> = [
        { header: 'User ID', accessorKey: 'id' },
        { header: 'Name', accessorKey: 'name' },
        { header: 'Email', accessorKey: 'email' },
        { header: 'Joined Date', accessorKey: 'joinedDate' },
        {
            header: 'Role',
            accessorKey: 'role',
            cell: (row) => (
                <div className="flex items-center gap-2">
                    <Badge variant={getRoleVariant(row.role)}>{row.role}</Badge>
                    {row.isSuperAdmin ? (
                        <Badge variant="warning">Super Admin</Badge>
                    ) : null}
                </div>
            ),
        },
    ]

    const actions = (row: AdminUser) => (
        <div className="flex justify-end gap-2">
            <IconActionButton
                label={row.isSuperAdmin ? 'Super Admin cannot be edited' : 'Edit Admin'}
                onClick={() => openEditModal(row)}
                disabled={row.isSuperAdmin}
                icon={Pencil}
            />
            <IconActionButton
                label={row.isSuperAdmin ? 'Super Admin cannot be deleted' : 'Delete Admin'}
                onClick={() => handleDelete(row.id)}
                disabled={row.isSuperAdmin}
                icon={Trash}
                tone="danger"
            />
        </div>
    )

    return (
        <div className="space-y-6">
            <AdminPageHeader
                eyebrow="Access Control"
                title="Admins"
                description="Manage administrative accounts with elevated platform access."
                actions={(
                    <>
                        <button
                            type="button"
                            onClick={() => void loadData()}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                        <button
                            type="button"
                            onClick={openCreateModal}
                            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark"
                        >
                            <Plus className="h-4 w-4" />
                            Add Admin
                        </button>
                    </>
                )}
            />

            {loading ? (
                <LoadingState message="Loading users..." />
            ) : error ? (
                <ErrorState message={error} />
            ) : (
                <div className="space-y-4">
                    <DataTable
                        columns={columns}
                        data={users}
                        actions={actions}
                    />
                    <PaginationControls
                        page={page}
                        limit={limit}
                        total={total}
                        loading={loading}
                        onPageChange={setPage}
                        onLimitChange={(nextLimit) => {
                            setLimit(nextLimit)
                            setPage(1)
                        }}
                    />
                </div>
            )}

            <AdminModal
                open={modalMode != null}
                onClose={closeModal}
                eyebrow="Admin Access"
                title={modalMode === 'create' ? 'Add Admin' : 'Edit Admin'}
                maxWidth="max-w-2xl"
            >
                <div className="space-y-4">
                            <div>
                                <label htmlFor="admin-name" className="block text-xs font-semibold uppercase tracking-[0.12em] text-subtext-light">
                                    Full Name
                                </label>
                                <input
                                    id="admin-name"
                                    value={draftName}
                                    onChange={(event) => {
                                        setDraftName(event.target.value)
                                        if (formError) setFormError(null)
                                    }}
                                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    placeholder="Admin full name"
                                    disabled={formSaving}
                                />
                            </div>

                            <div>
                                <label htmlFor="admin-email" className="block text-xs font-semibold uppercase tracking-[0.12em] text-subtext-light">
                                    Email
                                </label>
                                <input
                                    id="admin-email"
                                    type="email"
                                    value={draftEmail}
                                    onChange={(event) => {
                                        setDraftEmail(event.target.value)
                                        if (formError) setFormError(null)
                                    }}
                                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    placeholder="admin@company.com"
                                    disabled={formSaving}
                                />
                            </div>

                            {modalMode === 'create' ? (
                                <div>
                                    <label htmlFor="admin-password" className="block text-xs font-semibold uppercase tracking-[0.12em] text-subtext-light">
                                        Temporary Password
                                    </label>
                                    <input
                                        id="admin-password"
                                        type="password"
                                        value={draftPassword}
                                        onChange={(event) => {
                                            setDraftPassword(event.target.value)
                                            if (formError) setFormError(null)
                                        }}
                                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                                        placeholder="Minimum 8 characters"
                                        disabled={formSaving}
                                    />
                                </div>
                            ) : null}

                            {formError ? (
                                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                    {formError}
                                </div>
                            ) : null}

                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light hover:bg-slate-50"
                                    disabled={formSaving}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void submitModal()}
                                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={formSaving}
                                >
                                    {formSaving
                                        ? 'Saving...'
                                        : modalMode === 'create'
                                            ? 'Create Admin'
                                            : 'Save Changes'}
                                </button>
                            </div>
                </div>
            </AdminModal>
        </div>
    )
}
