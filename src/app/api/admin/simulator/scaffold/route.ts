import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../../lib/supabaseServer'
import { successResponse, errorResponse } from '../../../../../../lib/apiResponse'

/**
 * POST /api/admin/simulator/scaffold
 *
 * Creates an isolated test fixture: user, profile, company, subscription
 * (via the real POST /api/subscriptions flow so delivery order + items
 * are created correctly), and activates billing via a simulated invoice.paid
 * webhook so the fixture is immediately ready for delivery testing.
 */
export async function POST(_request: NextRequest) {
    try {
        const label = `sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        const email = `apitest+${label}@deskly.local`
        const password = `DesklySimulator!${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`

        // 1. Create auth user
        const { data: userData, error: userError } = await supabaseServer.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: `Simulator ${label}`,
                name: `Simulator ${label}`,
            },
        })
        if (userError || !userData.user) {
            return errorResponse(`create auth user: ${userError?.message ?? 'unknown'}`, 500)
        }
        const userId = userData.user.id

        // 2. Create profile
        const { error: profileError } = await supabaseServer
            .from('profiles')
            .upsert({
                id: userId,
                full_name: `Simulator ${label}`,
                job_title: 'Operations Lead',
                phone_number: '+60111222333',
                role: 'customer',
            })
        if (profileError) return errorResponse(`upsert profile: ${profileError.message}`, 500)

        // 3. Create company
        const { error: companyError } = await supabaseServer
            .from('companies')
            .insert({
                profile_id: userId,
                company_name: `Simulator Corp ${label}`,
                registration_number: `REG-${label.toUpperCase().slice(0, 12)}`,
                address: '1 Simulator Road',
                office_city: 'Kuala Lumpur',
                office_zip_postal: '50000',
                delivery_address: '1 Simulator Road',
                delivery_city: 'Kuala Lumpur',
                delivery_zip_postal: '50000',
                industry: 'Technology',
                team_size: '11-50',
            })
        if (companyError) return errorResponse(`insert company: ${companyError.message}`, 500)

        // 4. Create subscription via the real API (creates delivery order + items automatically)
        const apiBaseUrl = process.env.API_BASE_URL?.trim() || `http://127.0.0.1:${process.env.PORT || 3000}`
        const createSubResponse = await fetch(`${apiBaseUrl}/api/subscriptions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                monthly_total: 100,
                minimum_term_months: 12,
                items: [
                    {
                        product_name: 'Simulated Task Chair',
                        category: 'office',
                        monthly_price: 50,
                        duration_months: 12,
                        quantity: 1,
                    },
                    {
                        product_name: 'Simulated Standing Desk',
                        category: 'office',
                        monthly_price: 50,
                        duration_months: 12,
                        quantity: 1,
                    },
                ],
                delivery_company_name: `Simulator Corp ${label}`,
                delivery_address: '1 Simulator Road',
                delivery_city: 'Kuala Lumpur',
                delivery_zip_postal: '50000',
                delivery_contact_name: `Simulator ${label}`,
                delivery_contact_phone: '+60111222333',
            }),
        })

        const createSubBody = await createSubResponse.json().catch(() => null)
        if (!createSubResponse.ok || !createSubBody?.data?.id) {
            return errorResponse(`create subscription: ${createSubBody?.error ?? 'unknown'}`, 500)
        }

        const subscriptionId = createSubBody.data.id as string

        // 5. Look up the auto-created delivery order
        const { data: doData, error: doError } = await supabaseServer
            .from('delivery_orders')
            .select('id')
            .eq('subscription_id', subscriptionId)
            .maybeSingle()

        if (doError || !doData) {
            return errorResponse(`lookup delivery order: ${doError?.message ?? 'not found'}`, 500)
        }

        const deliveryOrderId = (doData as { id: string }).id

        // 6. Activate billing via the simulator webhook proxy
        const activateResponse = await fetch(`${apiBaseUrl}/api/admin/simulator/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_type: 'invoice.paid',
                subscription_id: subscriptionId,
            }),
        })

        const activateBody = await activateResponse.json().catch(() => null)
        const billingActivated = activateResponse.ok

        return successResponse({
            user_id: userId,
            subscription_id: subscriptionId,
            delivery_order_id: deliveryOrderId,
            billing_activated: billingActivated,
            billing_status: billingActivated ? 'active' : 'pending_payment',
            activate_details: billingActivated ? undefined : activateBody,
        }, 201)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Scaffold failed'
        return errorResponse(message, 500)
    }
}
