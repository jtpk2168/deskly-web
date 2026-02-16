'use client'

import Link from 'next/link'
import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Download, Edit, Plus, Power, Upload, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { PaginationControls } from '@/components/ui/PaginationControls'
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

function toOptionalValue(input: string) {
    const trimmed = input.trim()
    return trimmed.length > 0 ? trimmed : undefined
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

    const getStatusVariant = (productStatus: ProductStatus) => {
        if (productStatus === 'active') return 'success'
        if (productStatus === 'inactive') return 'error'
        return 'outline'
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
            return
        }
        setSelectedCsvFile(file)
        setCsvModalError(null)
    }

    const handleImportCsv = async () => {
        if (!selectedCsvFile) {
            setCsvModalError('Please select a CSV file to import.')
            return
        }

        setSubmitting(true)
        try {
            const result = await importProductsCsv(selectedCsvFile)
            alert(`Imported ${result.imported} products as draft.`)
            setSelectedCsvFile(null)
            setCsvModalError(null)
            setCsvModalMode(null)
            await loadProducts()
        } catch (importError) {
            alert(importError instanceof Error ? importError.message : 'Import failed')
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
        setIsCsvDragOver(false)
        if (mode === 'import') {
            setSelectedCsvFile(null)
        }
    }

    const closeCsvModal = () => {
        setCsvModalMode(null)
        setCsvModalError(null)
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

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-bold text-text-light">Products</h1>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => openCsvModal('import')}
                        disabled={submitting}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-text-light hover:bg-gray-50 disabled:opacity-50"
                    >
                        <Upload className="h-4 w-4" />
                        Import CSV
                    </button>
                    <button
                        type="button"
                        onClick={() => openCsvModal('export')}
                        disabled={submitting}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-text-light hover:bg-gray-50 disabled:opacity-50"
                    >
                        <Download className="h-4 w-4" />
                        Export CSV
                    </button>
                    <Link
                        href="/admin/products/new"
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
                    >
                        <Plus className="h-4 w-4" />
                        Add Product
                    </Link>
                </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-3">
                    <input
                        type="text"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search by name"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                    <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
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
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
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
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        />
                        <input
                            type="number"
                            value={maxPrice}
                            onChange={(event) => setMaxPrice(event.target.value)}
                            placeholder="Max price"
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            type="number"
                            value={minStock}
                            onChange={(event) => setMinStock(event.target.value)}
                            placeholder="Min stock"
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        />
                        <input
                            type="number"
                            value={maxStock}
                            onChange={(event) => setMaxStock(event.target.value)}
                            placeholder="Max stock"
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        />
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-subtext-light">
                    Loading products...
                </div>
            ) : error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-subtext-light">Product ID</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-subtext-light">Image</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-subtext-light">
                                    <button type="button" onClick={() => handleSort('name')} className="inline-flex items-center gap-1">
                                        Name {getSortIndicator('name')}
                                    </button>
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-subtext-light">Category</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-subtext-light">
                                    <button type="button" onClick={() => handleSort('monthly_price')} className="inline-flex items-center gap-1">
                                        Price {getSortIndicator('monthly_price')}
                                    </button>
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-subtext-light">
                                    <button type="button" onClick={() => handleSort('stock_quantity')} className="inline-flex items-center gap-1">
                                        Stock {getSortIndicator('stock_quantity')}
                                    </button>
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-subtext-light">Status</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-subtext-light">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {products.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-subtext-light">
                                        No products found
                                    </td>
                                </tr>
                            ) : (
                                products.map((product) => (
                                    <tr key={product.id}>
                                        <td className="px-4 py-3 text-sm font-semibold text-text-light">{product.product_code}</td>
                                        <td className="px-4 py-3">
                                            {product.image_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={product.image_url}
                                                    alt={product.name}
                                                    className="h-12 w-12 rounded-md object-cover"
                                                />
                                            ) : (
                                                <div className="h-12 w-12 rounded-md bg-gray-100" />
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-text-light">{product.name}</td>
                                        <td className="px-4 py-3 text-sm text-text-light">{product.category ?? '-'}</td>
                                        <td className="px-4 py-3 text-sm text-text-light">RM {Number(product.monthly_price).toFixed(2)}</td>
                                        <td className="px-4 py-3 text-sm text-text-light">{product.stock_quantity}</td>
                                        <td className="px-4 py-3 text-sm">
                                            <Badge variant={getStatusVariant(product.status)}>
                                                {product.status}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="inline-flex items-center gap-2">
                                                <Link
                                                    href={`/admin/products/${product.id}`}
                                                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-text-light hover:bg-gray-50"
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
                                                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-text-light hover:bg-gray-50 disabled:opacity-50"
                                                >
                                                    <span className="inline-flex items-center gap-1">
                                                        <Power className="h-3.5 w-3.5" />
                                                        {product.status === 'active' ? 'Deactivate' : 'Activate'}
                                                    </span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
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

            {csvModalMode && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-bold text-text-light">
                                    {csvModalMode === 'import' ? 'Import Products CSV' : 'Export Products CSV'}
                                </h2>
                                <p className="mt-1 text-sm text-subtext-light">
                                    {csvModalMode === 'import' ? (
                                        <>
                                            CSV template columns: <span className="font-medium text-text-light">name, description, category, monthly_price, stock_quantity, image_url, video_url</span>.
                                            {' '}All imported products are saved as <span className="font-medium text-text-light">draft</span>.
                                        </>
                                    ) : (
                                        <>
                                            Export columns: <span className="font-medium text-text-light">product_code, name, description, category, monthly_price, stock_quantity, status, created_at, updated_at</span>.
                                        </>
                                    )}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeCsvModal}
                                className="rounded-md p-2 text-subtext-light hover:bg-gray-100 hover:text-text-light"
                                aria-label="Close CSV modal"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {csvModalMode === 'import' ? (
                            <div className="space-y-4">
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
                                    className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${isCsvDragOver ? 'border-primary bg-primary/5' : 'border-gray-300 bg-gray-50'}`}
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
                                        className="mt-4 inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-text-light hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        <Upload className="h-4 w-4" />
                                        Choose CSV File
                                    </button>
                                </div>

                                {selectedCsvFile && (
                                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                                        <p className="font-medium text-text-light">Selected file</p>
                                        <p className="mt-1 text-subtext-light">{selectedCsvFile.name}</p>
                                    </div>
                                )}

                                {csvModalError && (
                                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                        {csvModalError}
                                    </div>
                                )}

                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={closeCsvModal}
                                        disabled={submitting}
                                        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-text-light hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleImportCsv}
                                        disabled={submitting}
                                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                                    >
                                        <Upload className="h-4 w-4" />
                                        {submitting ? 'Importing...' : 'Import CSV'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-subtext-light">
                                    Export will include your current search, sort, and filter selection. Media fields are excluded from export.
                                </div>
                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={closeCsvModal}
                                        disabled={submitting}
                                        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-text-light hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleExportCsv}
                                        disabled={submitting}
                                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                                    >
                                        <Download className="h-4 w-4" />
                                        {submitting ? 'Exporting...' : 'Export CSV'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
