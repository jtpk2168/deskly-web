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
}

export function DataTable<T extends { id: string | number }>({ columns, data, actions }: DataTableProps<T>) {
    return (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
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
                                No data available
                            </td>
                        </tr>
                    ) : (
                        data.map((row) => (
                            <tr key={row.id} className="transition hover:bg-slate-50/70">
                                {columns.map((col, index) => (
                                    <td key={index} className="px-6 py-4 whitespace-nowrap text-sm text-text-light">
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
