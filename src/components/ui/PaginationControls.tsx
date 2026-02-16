type PaginationControlsProps = {
    page: number
    limit: number
    total: number
    loading?: boolean
    onPageChange: (nextPage: number) => void
    onLimitChange: (nextLimit: number) => void
}

const PAGE_SIZE_OPTIONS = [10, 20, 50]

export function PaginationControls({
    page,
    limit,
    total,
    loading = false,
    onPageChange,
    onLimitChange,
}: PaginationControlsProps) {
    const safeLimit = Math.max(1, limit)
    const totalPages = Math.max(1, Math.ceil(total / safeLimit))
    const clampedPage = Math.min(Math.max(1, page), totalPages)
    const start = total === 0 ? 0 : (clampedPage - 1) * safeLimit + 1
    const end = total === 0 ? 0 : Math.min(clampedPage * safeLimit, total)
    const canGoPrev = clampedPage > 1 && !loading
    const canGoNext = clampedPage < totalPages && !loading

    return (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-subtext-light">
                Showing <span className="font-semibold text-text-light">{start}-{end}</span> of <span className="font-semibold text-text-light">{total}</span>
            </p>

            <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-sm text-subtext-light">
                    Rows
                    <select
                        value={safeLimit}
                        onChange={(event) => onLimitChange(Number(event.target.value))}
                        disabled={loading}
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-text-light disabled:opacity-50"
                    >
                        {PAGE_SIZE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                </label>

                <span className="px-2 text-sm text-subtext-light">
                    Page <span className="font-semibold text-text-light">{clampedPage}</span> / {totalPages}
                </span>

                <button
                    type="button"
                    onClick={() => onPageChange(clampedPage - 1)}
                    disabled={!canGoPrev}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-text-light hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Previous
                </button>
                <button
                    type="button"
                    onClick={() => onPageChange(clampedPage + 1)}
                    disabled={!canGoNext}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-text-light hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Next
                </button>
            </div>
        </div>
    )
}
