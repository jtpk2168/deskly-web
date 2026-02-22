'use client'

import Link from 'next/link'
import { type ChangeEvent, type DragEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Download, Edit, Plus, Power, Upload } from 'lucide-react'
import { AdminFilterPanel } from '@/components/admin/shared/AdminFilterPanel'
import { AdminModal } from '@/components/admin/shared/AdminModal'
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader'
import { ErrorState } from '@/components/admin/shared/ErrorState'
import { LoadingState } from '@/components/admin/shared/LoadingState'
import { Badge } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { PaginationControls } from '@/components/ui/PaginationControls'
import { getProductStatusVariant } from '@/lib/admin-ui/statusVariants'
import {
    AdminProduct,
    AdminProductFilters,
    ProductStatus,
    exportProductsCsv,
    getAdminProducts,
    importProductsCsv,
    updateAdminProduct,
} from '@/lib/api'
import { PRODUCT_CATEGORIES } from '@/lib/products'

const PRODUCT_IMPORT_TEMPLATE_HEADERS = [
    'name',
    'description',
    'category',
    'monthly_price',
    'pricing_mode',
    'pricing_tiers',
    'stock_quantity',
    'image_url',
    'video_url',
]

const PRODUCT_IMPORT_TEMPLATE_EXAMPLE = [
    'Ergonomic Chair Pro',
    'High-back ergonomic office chair with lumbar support',
    'Chairs',
    '90',
    'tiered',
    '6:80|12:75',
    '25',
    'https://example.com/chair.jpg',
    'https://example.com/chair.mp4',
]

function toOptionalValue(input: string) {
    const trimmed = input.trim()
    return trimmed.length > 0 ? trimmed : undefined
}

function csvEscapeCell(cell: string) {
    const escaped = cell.replace(/"/g, '""')
    if (/[",\n]/.test(cell)) return `"${escaped}"`
    return escaped
}

function buildTemplateCsv() {
    const rows = [PRODUCT_IMPORT_TEMPLATE_HEADERS, PRODUCT_IMPORT_TEMPLATE_EXAMPLE]
    return rows
        .map((row) => row.map((cell) => csvEscapeCell(cell)).join(','))
        .join('\n')
}

export default function ProductsPage() {
    const csvUploadInputRef = useRef<HTMLInputElement>(null)

    const [products, setProducts] = useState<AdminProduct[]>([])
    const [totalProducts, setTotalProducts] = useState(0)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [csvModalMode, setCsvModalMode] = useState<'import' | 'export' | null>(null)
    const [selectedCsvFile, setSelectedCsvFile] = useState<File | null>(null)
    const [csvModalError, setCsvModalError] = useState<string | null>(null)
    const [csvImportRowErrors, setCsvImportRowErrors] = useState<string[]>([])
    const [isCsvDragOver, setIsCsvDragOver] = useState(false)

    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('')
    const [status, setStatus] = useState('')
    const [minPrice, setMinPrice] = useState('')
    const [maxPrice, setMaxPrice] = useState('')
    const [minStock, setMinStock] = useState('')
    const [maxStock, setMaxStock] = useState('')
    const [sortBy, setSortBy] = useState<AdminProductFilters['sortBy']>('created_at')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(10)
    const hasActiveFilters =
        search.trim().length > 0 ||
        category !== '' ||
        status !== '' ||
        minPrice !== '' ||
        maxPrice !== '' ||
        minStock !== '' ||
        maxStock !== '' ||
        sortBy !== 'created_at' ||
        sortDir !== 'desc'

    const loadProducts = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await getAdminProducts({
                page,
                limit,
                search: toOptionalValue(search),
                category: toOptionalValue(category),
                status: toOptionalValue(status) as ProductStatus | undefined,
                minPrice: toOptionalValue(minPrice),
                maxPrice: toOptionalValue(maxPrice),
                minStock: toOptionalValue(minStock),
                maxStock: toOptionalValue(maxStock),
                sortBy: sortBy ?? undefined,
                sortDir,
            })
            setProducts(data.items)
            setTotalProducts(data.total)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load products')
        } finally {
            setLoading(false)
        }
    }, [page, limit, search, category, status, minPrice, maxPrice, minStock, maxStock, sortBy, sortDir])

    useEffect(() => {
        loadProducts()
    }, [loadProducts])

    useEffect(() => {
        setPage(1)
    }, [search, category, status, minPrice, maxPrice, minStock, maxStock, sortBy, sortDir, limit])

    const handleSort = (column: NonNullable<AdminProductFilters['sortBy']>) => {
        if (sortBy === column) {
            setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
            setPage(1)
            return
        }
        setSortBy(column)
        setSortDir('asc')
        setPage(1)
    }

    const getSortIndicator = (column: NonNullable<AdminProductFilters['sortBy']>) => {
        if (sortBy !== column) return '↕'
        return sortDir === 'asc' ? '↑' : '↓'
    }

    const handleToggleStatus = async (product: AdminProduct) => {
        const targetStatus: ProductStatus = product.status === 'active' ? 'inactive' : 'active'
        setSubmitting(true)
        try {
            await updateAdminProduct(product.id, { status: targetStatus })
            await loadProducts()
        } catch (toggleError) {
            alert(toggleError instanceof Error ? toggleError.message : 'Failed to update product status')
        } finally {
            setSubmitting(false)
        }
    }

    const handleExportCsv = async () => {
        setSubmitting(true)
        try {
            const blob = await exportProductsCsv({
                search: toOptionalValue(search),
                category: toOptionalValue(category),
                status: toOptionalValue(status) as ProductStatus | undefined,
                minPrice: toOptionalValue(minPrice),
                maxPrice: toOptionalValue(maxPrice),
                minStock: toOptionalValue(minStock),
                maxStock: toOptionalValue(maxStock),
                sortBy: sortBy ?? undefined,
                sortDir,
            })

            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = `products-${new Date().toISOString().slice(0, 10)}.csv`
            document.body.appendChild(anchor)
            anchor.click()
            document.body.removeChild(anchor)
            URL.revokeObjectURL(url)
            setCsvModalMode(null)
        } catch (exportError) {
            alert(exportError instanceof Error ? exportError.message : 'Export failed')
        } finally {
            setSubmitting(false)
        }
    }

    const handleCsvFileSelect = (file: File | null) => {
        if (!file) return
        const validType = file.name.toLowerCase().endsWith('.csv') || file.type.toLowerCase().includes('csv')
        if (!validType) {
            setCsvModalError('Please upload a valid CSV file.')
            setCsvImportRowErrors([])
            return
        }
        setSelectedCsvFile(file)
        setCsvModalError(null)
        setCsvImportRowErrors([])
    }

    const handleDownloadImportTemplate = () => {
        const templateCsv = buildTemplateCsv()
        const blob = new Blob([templateCsv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = 'products-import-template.csv'
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(url)
    }

    const handleImportCsv = async () => {
        if (!selectedCsvFile) {
            setCsvModalError('Please select a CSV file to import.')
            setCsvImportRowErrors([])
            return
        }

        setSubmitting(true)
        try {
            const result = await importProductsCsv(selectedCsvFile)
            alert(`Imported ${result.imported} products as draft.`)
            setSelectedCsvFile(null)
            setCsvModalError(null)
            setCsvImportRowErrors([])
            setCsvModalMode(null)
            await loadProducts()
        } catch (importError) {
            const message = importError instanceof Error ? importError.message : 'Import failed'
            const details = message
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0)

            if (details.some((line) => line.startsWith('Row '))) {
                setCsvModalError('Import failed. Please fix the rows below and try again.')
                setCsvImportRowErrors(details)
            } else {
                setCsvModalError(message)
                setCsvImportRowErrors([])
            }
        } finally {
            setSubmitting(false)
            if (csvUploadInputRef.current) {
                csvUploadInputRef.current.value = ''
            }
        }
    }

    const openCsvModal = (mode: 'import' | 'export') => {
        setCsvModalMode(mode)
        setCsvModalError(null)
        setCsvImportRowErrors([])
        setIsCsvDragOver(false)
        if (mode === 'import') {
            setSelectedCsvFile(null)
        }
    }

    const closeCsvModal = () => {
        setCsvModalMode(null)
        setCsvModalError(null)
        setCsvImportRowErrors([])
        setIsCsvDragOver(false)
        if (csvUploadInputRef.current) {
            csvUploadInputRef.current.value = ''
        }
    }

    const handleCsvInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null
        handleCsvFileSelect(file)
    }

    const handleCsvDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        setIsCsvDragOver(false)
        const file = event.dataTransfer.files?.[0] ?? null
        handleCsvFileSelect(file)
    }

    const resetFilters = () => {
        setSearch('')
        setCategory('')
        setStatus('')
        setMinPrice('')
        setMaxPrice('')
        setMinStock('')
        setMaxStock('')
        setSortBy('created_at')
        setSortDir('desc')
        setPage(1)
    }

    const columns: Array<{
        header: ReactNode
        accessorKey?: keyof AdminProduct
        cell?: (row: AdminProduct) => ReactNode
    }> = [
            {
                header: 'Product ID',
                accessorKey: 'product_code',
                cell: (row) => <span className="font-semibold text-text-light">{row.product_code}</span>,
            },
            {
                header: 'Image',
                accessorKey: 'image_url',
                cell: (row) => (
                    row.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={row.image_url}
                            alt={row.name}
                            className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
                        />
                    ) : (
                        <div className="h-12 w-12 rounded-lg border border-slate-200 bg-slate-100" />
                    )
                ),
            },
            {
                header: (
                    <button type="button" onClick={() => handleSort('name')} className="inline-flex items-center gap-1">
                        NAME {getSortIndicator('name')}
                    </button>
                ),
                accessorKey: 'name',
            },
            { header: 'Category', accessorKey: 'category' },
            {
                header: (
                    <button type="button" onClick={() => handleSort('monthly_price')} className="inline-flex items-center gap-1">
                        PRICE {getSortIndicator('monthly_price')}
                    </button>
                ),
                accessorKey: 'monthly_price',
                cell: (row) => (
                    <div>
                        <p>RM {Number(row.monthly_price).toFixed(2)}</p>
                        {row.pricing_mode === 'tiered' && Array.isArray(row.pricing_tiers) && row.pricing_tiers.length > 0 ? (
                            <p className="text-xs text-subtext-light">
                                {row.pricing_tiers.length} tier(s): {[...row.pricing_tiers]
                                    .sort((a, b) => a.min_months - b.min_months)
                                    .map((tier) => `${tier.min_months}+m RM ${Number(tier.monthly_price).toFixed(2)}`)
                                    .join(', ')}
                            </p>
                        ) : null}
                    </div>
                ),
            },
            {
                header: (
                    <button type="button" onClick={() => handleSort('stock_quantity')} className="inline-flex items-center gap-1">
                        STOCK {getSortIndicator('stock_quantity')}
                    </button>
                ),
                accessorKey: 'stock_quantity',
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: (row) => <Badge variant={getProductStatusVariant(row.status)}>{row.status}</Badge>,
            },
        ]

    const actions = (product: AdminProduct) => (
        <div className="inline-flex items-center gap-2">
            <Link
                href={`/admin/products/${product.id}`}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-text-light transition hover:bg-slate-50"
            >
                <span className="inline-flex items-center gap-1">
                    <Edit className="h-3.5 w-3.5" />
                    Edit
                </span>
            </Link>
            <button
                type="button"
                onClick={() => handleToggleStatus(product)}
                disabled={submitting}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-text-light transition hover:bg-slate-50 disabled:opacity-50"
            >
                <span className="inline-flex items-center gap-1">
                    <Power className="h-3.5 w-3.5" />
                    {product.status === 'active' ? 'Deactivate' : 'Activate'}
                </span>
            </button>
        </div>
    )

    return (
        <div className="space-y-6">
            <AdminPageHeader
                eyebrow="Catalog"
                title="Products"
                description="Manage product inventory, pricing, and CSV operations."
                actions={(
                    <>
                        <button
                            type="button"
                            onClick={() => openCsvModal('import')}
                            disabled={submitting}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light transition hover:bg-slate-50 disabled:opacity-50"
                        >
                            <Upload className="h-4 w-4" />
                            Import CSV
                        </button>
                        <button
                            type="button"
                            onClick={() => openCsvModal('export')}
                            disabled={submitting}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light transition hover:bg-slate-50 disabled:opacity-50"
                        >
                            <Download className="h-4 w-4" />
                            Export CSV
                        </button>
                        <Link
                            href="/admin/products/new"
                            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark"
                        >
                            <Plus className="h-4 w-4" />
                            Add Product
                        </Link>
                    </>
                )}
            />

            <AdminFilterPanel
                title="Filters"
                description="Search products by name, category, status, price, and stock."
                actions={(
                    <button
                        type="button"
                        onClick={resetFilters}
                        disabled={!hasActiveFilters}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Reset Filters
                    </button>
                )}
            >
                <div className="grid gap-3 md:grid-cols-3">
                    <input
                        type="text"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search by name"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                        <option value="">All Categories</option>
                        {PRODUCT_CATEGORIES.map((item) => (
                            <option key={item} value={item}>
                                {item}
                            </option>
                        ))}
                    </select>
                    <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                        <option value="">All Statuses</option>
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            type="number"
                            value={minPrice}
                            onChange={(event) => setMinPrice(event.target.value)}
                            placeholder="Min price"
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <input
                            type="number"
                            value={maxPrice}
                            onChange={(event) => setMaxPrice(event.target.value)}
                            placeholder="Max price"
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            type="number"
                            value={minStock}
                            onChange={(event) => setMinStock(event.target.value)}
                            placeholder="Min stock"
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <input
                            type="number"
                            value={maxStock}
                            onChange={(event) => setMaxStock(event.target.value)}
                            placeholder="Max stock"
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </div>
                </div>
            </AdminFilterPanel>

            {loading ? (
                <LoadingState message="Loading products..." />
            ) : error ? (
                <ErrorState message={error} />
            ) : (
                <DataTable
                    columns={columns}
                    data={products}
                    actions={actions}
                    emptyMessage="No products found"
                    cellClassName="px-4 py-3 text-sm text-text-light"
                    tableClassName="min-w-full"
                />
            )}

            {!loading && !error && (
                <PaginationControls
                    page={page}
                    limit={limit}
                    total={totalProducts}
                    loading={submitting}
                    onPageChange={setPage}
                    onLimitChange={(nextLimit) => {
                        setLimit(nextLimit)
                        setPage(1)
                    }}
                />
            )}

            <AdminModal
                open={csvModalMode != null}
                onClose={closeCsvModal}
                title={csvModalMode === 'import' ? 'Import Products CSV' : 'Export Products CSV'}
                maxWidth="max-w-2xl"
            >
                <div className="mt-1 text-sm text-subtext-light">
                    {csvModalMode === 'import' ? (
                        <div className="space-y-1">
                            <p>Upload a CSV file to create products in bulk.</p>
                            <p>
                                Required columns: <span className="font-medium text-text-light">name, category, monthly_price, stock_quantity</span>.
                            </p>
                            <p>
                                Optional columns: <span className="font-medium text-text-light">description, pricing_mode, pricing_tiers, image_url, video_url</span>.
                            </p>
                            <p>
                                Use <span className="font-medium text-text-light">pricing_mode</span> as <span className="font-medium text-text-light">fixed</span> or <span className="font-medium text-text-light">tiered</span>.
                            </p>
                            <p>
                                For tiered pricing, use <span className="font-medium text-text-light">pricing_tiers</span> format like <span className="font-medium text-text-light">6:80|12:75</span> (meaning <span className="font-medium text-text-light">6:80</span> = 6+ months at RM80/month, <span className="font-medium text-text-light">12:75</span> = 12+ months at RM75/month).
                            </p>
                            <p>All imported products are saved as <span className="font-medium text-text-light">draft</span>.</p>
                        </div>
                    ) : (
                        <>
                            Export columns: <span className="font-medium text-text-light">product_code, name, description, category, monthly_price, pricing_mode, pricing_tiers, stock_quantity, status, created_at, updated_at</span>.
                        </>
                    )}
                </div>

                {csvModalMode === 'import' ? (
                    <div className="mt-4 space-y-4">
                        <div className="flex justify-start">
                            <button
                                type="button"
                                onClick={handleDownloadImportTemplate}
                                disabled={submitting}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light transition hover:bg-slate-50 disabled:opacity-50"
                            >
                                <Download className="h-4 w-4" />
                                Download CSV Template
                            </button>
                        </div>

                        <input
                            ref={csvUploadInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={handleCsvInputChange}
                        />
                        <div
                            onDragOver={(event) => {
                                event.preventDefault()
                                setIsCsvDragOver(true)
                            }}
                            onDragLeave={(event) => {
                                event.preventDefault()
                                setIsCsvDragOver(false)
                            }}
                            onDrop={handleCsvDrop}
                            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${isCsvDragOver ? 'border-primary bg-primary/5' : 'border-slate-300 bg-slate-50'}`}
                        >
                            <p className="text-sm font-medium text-text-light">
                                Drag and drop your CSV file here
                            </p>
                            <p className="mt-1 text-xs text-subtext-light">
                                Or click below to browse from your computer.
                            </p>
                            <button
                                type="button"
                                onClick={() => csvUploadInputRef.current?.click()}
                                disabled={submitting}
                                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light transition hover:bg-slate-50 disabled:opacity-50"
                            >
                                <Upload className="h-4 w-4" />
                                Choose CSV File
                            </button>
                        </div>

                        {selectedCsvFile ? (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                                <p className="font-medium text-text-light">Selected file</p>
                                <p className="mt-1 text-subtext-light">{selectedCsvFile.name}</p>
                            </div>
                        ) : null}

                        {csvModalError ? (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {csvModalError}
                            </div>
                        ) : null}

                        {csvImportRowErrors.length > 0 ? (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                <p className="font-medium">CSV validation details</p>
                                <div className="mt-2 max-h-44 overflow-y-auto space-y-1">
                                    {csvImportRowErrors.slice(0, 30).map((line) => (
                                        <p key={line}>{line}</p>
                                    ))}
                                </div>
                                {csvImportRowErrors.length > 30 ? (
                                    <p className="mt-2 text-xs">
                                        Showing first 30 errors. Fix these first, then re-import.
                                    </p>
                                ) : null}
                            </div>
                        ) : null}

                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={closeCsvModal}
                                disabled={submitting}
                                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light transition hover:bg-slate-50 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleImportCsv}
                                disabled={submitting}
                                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-50"
                            >
                                <Upload className="h-4 w-4" />
                                {submitting ? 'Importing...' : 'Import CSV'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="mt-4 space-y-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-subtext-light">
                            Export will include your current search, sort, and filter selection. Media fields are excluded from export.
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={closeCsvModal}
                                disabled={submitting}
                                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-text-light transition hover:bg-slate-50 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleExportCsv}
                                disabled={submitting}
                                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-50"
                            >
                                <Download className="h-4 w-4" />
                                {submitting ? 'Exporting...' : 'Export CSV'}
                            </button>
                        </div>
                    </div>
                )}
            </AdminModal>
        </div>
    )
}
