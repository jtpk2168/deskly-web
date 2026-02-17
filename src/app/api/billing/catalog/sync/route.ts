import { NextRequest } from 'next/server'
import { BILLING_DEFAULT_CURRENCY } from '@/lib/billing/config'
import { getBillingProvider } from '@/lib/billing/providers'
import { parseUUID } from '@/lib/billing/validation'
import { errorResponse, successResponse } from '../../../../../../lib/apiResponse'
import { supabaseServer } from '../../../../../../lib/supabaseServer'

type ProductRow = {
    id: string
    name: string
    description: string | null
    monthly_price: number | string
    is_active: boolean
}

type CatalogPriceRow = {
    product_id: string
    provider_product_id: string
    provider_price_id: string
    unit_amount: number | string
    currency: string
    is_active: boolean
    created_at: string
}

type CatalogSyncBody = {
    product_ids?: unknown
    currency?: unknown
    dry_run?: unknown
}

function normalizeCurrency(value: unknown) {
    if (typeof value !== 'string') return BILLING_DEFAULT_CURRENCY
    const normalized = value.trim().toLowerCase()
    return normalized || BILLING_DEFAULT_CURRENCY
}

function normalizeBoolean(value: unknown) {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value === 1
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        return normalized === '1' || normalized === 'true' || normalized === 'yes'
    }
    return false
}

function normalizeProductIds(input: unknown) {
    if (!Array.isArray(input)) return []
    return input
        .map((entry) => parseUUID(entry))
        .filter((entry): entry is string => Boolean(entry))
}

/** POST /api/billing/catalog/sync — Sync internal products into billing provider products/prices */
export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => ({}))) as CatalogSyncBody
        const billingProvider = getBillingProvider()
        const currency = normalizeCurrency(body.currency)
        const dryRun = normalizeBoolean(body.dry_run)
        const requestedProductIds = normalizeProductIds(body.product_ids)

        let productsQuery = supabaseServer
            .from('products')
            .select('id, name, description, monthly_price, is_active')
            .eq('is_active', true)
            .order('name', { ascending: true })

        if (requestedProductIds.length > 0) {
            productsQuery = productsQuery.in('id', requestedProductIds)
        }

        const { data: productRows, error: productError } = await productsQuery
        if (productError) return errorResponse(`Failed to load products: ${productError.message}`, 500)

        const products = (productRows ?? []) as ProductRow[]
        if (products.length === 0) {
            return successResponse({
                provider: billingProvider.name,
                dry_run: dryRun,
                total_products: 0,
                synced: [],
            })
        }

        const productIds = products.map((product) => product.id)
        const { data: existingCatalogRows, error: existingCatalogError } = await supabaseServer
            .from('billing_catalog_prices')
            .select('product_id, provider_product_id, provider_price_id, unit_amount, currency, is_active, created_at')
            .eq('provider', billingProvider.name)
            .in('product_id', productIds)
            .order('created_at', { ascending: false })

        if (existingCatalogError) {
            return errorResponse(`Failed to load catalog mapping: ${existingCatalogError.message}`, 500)
        }

        const existingByProduct = new Map<string, CatalogPriceRow[]>()
        for (const row of (existingCatalogRows ?? []) as CatalogPriceRow[]) {
            const rows = existingByProduct.get(row.product_id) ?? []
            rows.push(row)
            existingByProduct.set(row.product_id, rows)
        }

        const results: Array<{
            product_id: string
            product_name: string
            action: 'skipped' | 'created'
            provider_product_id: string
            provider_price_id: string
            unit_amount: number
            currency: string
        }> = []

        for (const product of products) {
            const monthlyPrice = Number(product.monthly_price)
            if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
                return errorResponse(`Product ${product.id} has invalid monthly_price`, 400)
            }

            const existingRows = existingByProduct.get(product.id) ?? []
            const exactMatch = existingRows.find((row) =>
                row.is_active &&
                row.currency === currency &&
                Number(row.unit_amount).toFixed(2) === monthlyPrice.toFixed(2),
            )

            if (exactMatch) {
                results.push({
                    product_id: product.id,
                    product_name: product.name,
                    action: 'skipped',
                    provider_product_id: exactMatch.provider_product_id,
                    provider_price_id: exactMatch.provider_price_id,
                    unit_amount: Number(exactMatch.unit_amount),
                    currency: exactMatch.currency,
                })
                continue
            }

            const latestProviderProductId = existingRows.find((row) => row.provider_product_id)?.provider_product_id ?? null

            if (dryRun) {
                results.push({
                    product_id: product.id,
                    product_name: product.name,
                    action: 'created',
                    provider_product_id: latestProviderProductId ?? `pending_${product.id}`,
                    provider_price_id: `pending_price_${product.id}`,
                    unit_amount: Number(monthlyPrice.toFixed(2)),
                    currency,
                })
                continue
            }

            const createdPrice = await billingProvider.ensureCatalogPrice({
                internalProductId: product.id,
                existingProviderProductId: latestProviderProductId,
                name: product.name,
                description: product.description,
                currency,
                monthlyUnitAmount: monthlyPrice,
                metadata: {
                    source: 'deskly-catalog-sync',
                },
            })

            const { error: insertCatalogError } = await supabaseServer
                .from('billing_catalog_prices')
                .insert({
                    product_id: product.id,
                    provider: billingProvider.name,
                    provider_product_id: createdPrice.providerProductId,
                    provider_price_id: createdPrice.providerPriceId,
                    currency: createdPrice.currency,
                    unit_amount: createdPrice.unitAmount,
                    interval: createdPrice.interval,
                    interval_count: createdPrice.intervalCount,
                    is_active: true,
                    metadata: {
                        source: 'deskly-catalog-sync',
                    },
                })

            if (insertCatalogError) {
                return errorResponse(`Failed to save catalog mapping for ${product.name}: ${insertCatalogError.message}`, 500)
            }

            results.push({
                product_id: product.id,
                product_name: product.name,
                action: 'created',
                provider_product_id: createdPrice.providerProductId,
                provider_price_id: createdPrice.providerPriceId,
                unit_amount: createdPrice.unitAmount,
                currency: createdPrice.currency,
            })
        }

        return successResponse({
            provider: billingProvider.name,
            dry_run: dryRun,
            total_products: products.length,
            created_count: results.filter((result) => result.action === 'created').length,
            skipped_count: results.filter((result) => result.action === 'skipped').length,
            synced: results,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error'
        return errorResponse(message, 500)
    }
}

