import {
    BILLING_DEFAULT_CURRENCY,
    BILLING_MINIMUM_TERM_MONTHS,
    BILLING_PROVIDER,
    BILLING_SST_RATE,
    BILLING_STRIPE_AUTOMATIC_TAX,
    BILLING_STRIPE_TAX_RATE_ID,
} from '@/lib/billing/config'
import { successResponse } from '../../../../../lib/apiResponse'

/** GET /api/billing/config — Public billing capabilities for mobile UI */
export async function GET() {
    return successResponse({
        provider: BILLING_PROVIDER,
        currency: BILLING_DEFAULT_CURRENCY,
        minimum_term_months: BILLING_MINIMUM_TERM_MONTHS,
        sst_rate: BILLING_SST_RATE,
        stripe_automatic_tax_enabled: BILLING_STRIPE_AUTOMATIC_TAX,
        stripe_manual_tax_rate_id: BILLING_STRIPE_TAX_RATE_ID,
    })
}
