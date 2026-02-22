'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, RefreshCw, Trash, X } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { PaginationControls } from '@/components/ui/PaginationControls'
import { AdminUser, createAdmin, deleteAdmin, getAdmins, updateAdmin } from '@/lib/api'

function getRoleVariant(role: AdminUser['role']): 'default' | 'success' | 'warning' | 'error' | 'outline' {
    return role === 'Admin' ? 'default' : 'outline'
}

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
            <button
                type="button"
                onClick={() => openEditModal(row)}
                disabled={row.isSuperAdmin}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-subtext-light transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                title={row.isSuperAdmin ? 'Super Admin cannot be edited' : 'Edit Admin'}
            >
                <Pencil className="h-4 w-4" />
            </button>
            <button
                type="button"
                onClick={() => handleDelete(row.id)}
                disabled={row.isSuperAdmin}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-subtext-light transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                title={row.isSuperAdmin ? 'Super Admin cannot be deleted' : 'Delete Admin'}
            >
                <Trash className="h-4 w-4" />
            </button>
        </div>
    )

    return (
        <div className="space-y-6">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtext-light">Access Control</p>
                            <h1 className="mt-1 text-2xl font-bold text-text-light">Admins</h1>
                            <p className="mt-1 text-sm text-subtext-light">Manage administrative accounts with elevated platform access.</p>
                        </div>
                        <div className="flex items-center gap-2">
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
                        </div>
                    </div>
                </div>
            </section>

            {loading ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-subtext-light shadow-sm">Loading users...</div>
            ) : error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
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

            {modalMode ? (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/55 p-4 backdrop-blur-sm md:p-8">
                    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-subtext-light">Admin Access</p>
                                    <h2 className="mt-1 text-3xl font-bold tracking-tight text-text-light">
                                        {modalMode === 'create' ? 'Add Admin' : 'Edit Admin'}
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="rounded-full border border-slate-200 bg-white p-2 text-subtext-light transition-colors hover:border-slate-300 hover:text-text-light"
                                    aria-label="Close admin form"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4 px-6 py-6">
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
                    </div>
                </div>
            ) : null}
        </div>
    )
}
