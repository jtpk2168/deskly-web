import React from 'react'

interface Column<T> {
    header: React.ReactNode
    accessorKey?: keyof T
    cell?: (row: T) => React.ReactNode
}

interface DataTableProps<T> {
    columns: Column<T>[]
    data: T[]
    actions?: (row: T) => React.ReactNode
    emptyMessage?: React.ReactNode
    containerClassName?: string
    tableClassName?: string
    rowClassName?: string | ((row: T) => string)
    cellClassName?: string | ((row: T, column: Column<T>, columnIndex: number) => string)
}

function toClassName(...parts: Array<string | undefined>) {
    return parts.filter(Boolean).join(' ')
}

export function DataTable<T extends { id: string | number }>({
    columns,
    data,
    actions,
    emptyMessage = 'No data available',
    containerClassName,
    tableClassName,
    rowClassName,
    cellClassName,
}: DataTableProps<T>) {
    return (
        <div className={toClassName('overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm', containerClassName)}>
            <table className={toClassName('min-w-full divide-y divide-slate-200', tableClassName)}>
                <thead className="bg-slate-50">
                    <tr>
                        {columns.map((col, index) => (
                            <th
                                key={index}
                                scope="col"
                                className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-subtext-light"
                            >
                                {col.header}
                            </th>
                        ))}
                        {actions && <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                    {data.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length + (actions ? 1 : 0)} className="px-6 py-4 text-center text-sm text-subtext-light">
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : (
                        data.map((row) => (
                            <tr
                                key={row.id}
                                className={toClassName(
                                    'transition hover:bg-slate-50/70',
                                    typeof rowClassName === 'function' ? rowClassName(row) : rowClassName,
                                )}
                            >
                                {columns.map((col, index) => (
                                    <td
                                        key={index}
                                        className={toClassName(
                                            'px-6 py-4 whitespace-nowrap text-sm text-text-light',
                                            typeof cellClassName === 'function' ? cellClassName(row, col, index) : cellClassName,
                                        )}
                                    >
                                        {col.cell ? col.cell(row) : (row[col.accessorKey as keyof T] as React.ReactNode)}
                                    </td>
                                ))}
                                {actions && (
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {actions(row)}
                                    </td>
                                )}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    )
}
