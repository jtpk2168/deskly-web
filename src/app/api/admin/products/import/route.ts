import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '../../../../../../lib/supabaseServer'
import { errorResponse, successResponse } from '../../../../../../lib/apiResponse'
import { parseCsv } from '@/lib/csv'
import { isValidHttpUrl, normalizeCategory, resolveCategoryCode } from '@/lib/products'

const REQUIRED_HEADERS = ['name', 'category', 'monthly_price', 'stock_quantity']

type ImportRow = {
    name: string
    description: string | null
    category: string
    categoryCode: string
    monthlyPrice: number
    stockQuantity: number
    imageUrl: string | null
    videoUrl: string | null
}

function isMissingGenerateCodeFunctionError(error: { message?: string } | null) {
    const message = error?.message?.toLowerCase() ?? ''
    return message.includes('generate_product_code') && message.includes('schema cache')
}

function isDuplicateProductCodeError(error: { message?: string; code?: string } | null) {
    if (error?.code === '23505') return true
    const message = error?.message?.toLowerCase() ?? ''
    return message.includes('duplicate key') && message.includes('product_code')
}

function parseProductCodeNumber(productCode: string, categoryCode: string) {
    const [prefix, suffix] = productCode.split('-')
    if (prefix !== categoryCode) return 0
    const value = Number.parseInt(suffix ?? '', 10)
    return Number.isFinite(value) ? value : 0
}

function formatProductCode(categoryCode: string, nextValue: number) {
    return `${categoryCode}-${String(nextValue).padStart(6, '0')}`
}

async function getMaxCodeByCategory(categoryCode: string) {
    const { data, error } = await supabaseServer
        .from('products')
        .select('product_code')
        .like('product_code', `${categoryCode}-%`)
        .order('product_code', { ascending: false })
        .limit(1)

    if (error) throw new Error(error.message)

    const currentCode = data?.[0]?.product_code ? String(data[0].product_code) : null
    return currentCode ? parseProductCodeNumber(currentCode, categoryCode) : 0
}

async function buildRowsWithCodes(importRows: ImportRow[]) {
    let shouldUseFallback = false
    const fallbackCounters = new Map<string, number>()
    const rowsWithCodes: Array<Record<string, unknown>> = []

    for (const row of importRows) {
        let productCode = ''

        if (!shouldUseFallback) {
            const { data, error } = await supabaseServer
                .rpc('generate_product_code', { p_category_code: row.categoryCode })

            if (!error && data) {
                productCode = String(data)
            } else if (!error) {
                throw new Error('Failed to generate product code')
            } else if (isMissingGenerateCodeFunctionError(error)) {
                shouldUseFallback = true
            } else {
                throw new Error(error.message)
            }
        }

        if (shouldUseFallback) {
            if (!fallbackCounters.has(row.categoryCode)) {
                fallbackCounters.set(row.categoryCode, await getMaxCodeByCategory(row.categoryCode))
            }
            const nextValue = (fallbackCounters.get(row.categoryCode) ?? 0) + 1
            fallbackCounters.set(row.categoryCode, nextValue)
            productCode = formatProductCode(row.categoryCode, nextValue)
        }

        rowsWithCodes.push({
            product_code: productCode,
            name: row.name,
            description: row.description,
            category: row.category,
            monthly_price: row.monthlyPrice,
            image_url: row.imageUrl,
            video_url: row.videoUrl,
            stock_quantity: row.stockQuantity,
            status: 'draft',
            is_active: false,
            updated_at: new Date().toISOString(),
            published_at: null,
        })
    }

    return rowsWithCodes
}

function getColumnValue(row: string[], headers: string[], columnName: string): string {
    const index = headers.indexOf(columnName)
    if (index === -1) return ''
    return (row[index] ?? '').trim()
}

/** POST /api/admin/products/import — CSV import, all-or-nothing, create-only as draft */
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get('file')

        if (!(file instanceof File)) {
            return errorResponse('CSV file is required', 400)
        }

        if (!file.name.toLowerCase().endsWith('.csv')) {
            return errorResponse('Only CSV files are supported', 400)
        }

        const content = await file.text()
        let csvRows: string[][]
        try {
            csvRows = parseCsv(content)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to parse CSV'
            return errorResponse(message, 400)
        }

        const rows = csvRows.filter((row) => row.some((cell) => cell.trim().length > 0))
        if (rows.length < 2) {
            return errorResponse('CSV must include a header row and at least one data row', 400)
        }

        const headers = rows[0].map((header) => header.trim().toLowerCase())
        const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header))
        if (missingHeaders.length > 0) {
            return errorResponse(`Missing required columns: ${missingHeaders.join(', ')}`, 400)
        }

        const errors: string[] = []
        const importRows: ImportRow[] = []

        for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex]
            const lineNumber = rowIndex + 1

            const name = getColumnValue(row, headers, 'name')
            const categoryInput = getColumnValue(row, headers, 'category')
            const category = normalizeCategory(categoryInput)
            const categoryCode = resolveCategoryCode(category)
            const monthlyPriceRaw = getColumnValue(row, headers, 'monthly_price')
            const stockQuantityRaw = getColumnValue(row, headers, 'stock_quantity')
            const descriptionRaw = getColumnValue(row, headers, 'description')
            const imageUrlRaw = getColumnValue(row, headers, 'image_url')
            const videoUrlRaw = getColumnValue(row, headers, 'video_url')

            if (!name) errors.push(`Row ${lineNumber}: name is required`)
            if (!category || !categoryCode) errors.push(`Row ${lineNumber}: category is invalid`)

            const monthlyPrice = Number(monthlyPriceRaw)
            if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
                errors.push(`Row ${lineNumber}: monthly_price must be a positive number`)
            }

            const stockQuantity = Number(stockQuantityRaw)
            if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
                errors.push(`Row ${lineNumber}: stock_quantity must be an integer greater than or equal to 0`)
            }

            if (imageUrlRaw && !isValidHttpUrl(imageUrlRaw)) {
                errors.push(`Row ${lineNumber}: image_url must be a valid HTTP(S) URL`)
            }

            if (videoUrlRaw && !isValidHttpUrl(videoUrlRaw)) {
                errors.push(`Row ${lineNumber}: video_url must be a valid HTTP(S) URL`)
            }

            if (errors.length === 0 || !errors.some((error) => error.startsWith(`Row ${lineNumber}:`))) {
                importRows.push({
                    name,
                    description: descriptionRaw || null,
                    category: category as string,
                    categoryCode: categoryCode as string,
                    monthlyPrice,
                    stockQuantity,
                    imageUrl: imageUrlRaw || null,
                    videoUrl: videoUrlRaw || null,
                })
            }
        }

        if (errors.length > 0) {
            return NextResponse.json(
                { data: null, error: 'CSV validation failed', meta: { errors } },
                { status: 400 }
            )
        }

        for (let attempt = 0; attempt < 3; attempt += 1) {
            let rowsWithCodes: Array<Record<string, unknown>> = []
            try {
                rowsWithCodes = await buildRowsWithCodes(importRows)
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to generate product codes'
                return errorResponse(message, 500)
            }

            const { data, error } = await supabaseServer
                .from('products')
                .insert(rowsWithCodes)
                .select('*')

            if (!error) return successResponse({ imported: data?.length ?? 0 }, 201)
            if (!isDuplicateProductCodeError(error)) return errorResponse(error.message, 500)
        }

        return errorResponse('Failed to generate unique product codes for import. Please retry.', 409)
    } catch {
        return errorResponse('Invalid import payload', 400)
    }
}
