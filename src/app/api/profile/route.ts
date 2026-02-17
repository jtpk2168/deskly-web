import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { successResponse, errorResponse, parseUUID } from '../../../../lib/apiResponse'

/** GET /api/profile?user_id= — Get profile + company info */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const userId = searchParams.get('user_id')

        if (!userId) return errorResponse('user_id query parameter is required', 400)

        const uuid = parseUUID(userId)
        if (!uuid) return errorResponse('Invalid user_id format', 400)

        // Fetch profile
        const { data: profile, error: profileError } = await supabaseServer
            .from('profiles')
            .select('*')
            .eq('id', uuid)
            .single()

        if (profileError || !profile) return errorResponse('Profile not found', 404)

        // Fetch company info
        const { data: company } = await supabaseServer
            .from('companies')
            .select('*')
            .eq('profile_id', uuid)
            .single()

        return successResponse({ ...profile, company: company ?? null })
    } catch {
        return errorResponse('Internal server error', 500)
    }
}

/** POST /api/profile — Create/update profile during onboarding (upsert) */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { user_id, full_name, job_title, phone_number, marketing_consent, company } = body

        if (!user_id) return errorResponse('user_id is required', 400)

        const uuid = parseUUID(user_id)
        if (!uuid) return errorResponse('Invalid user_id format', 400)

        // Upsert profile
        const { data: profile, error: profileError } = await supabaseServer
            .from('profiles')
            .upsert({
                id: uuid,
                full_name: full_name ?? null,
                job_title: job_title ?? null,
                phone_number: phone_number ?? null,
                marketing_consent: marketing_consent ?? false,
                updated_at: new Date().toISOString(),
            })
            .select()
            .single()

        if (profileError) return errorResponse(profileError.message, 500)

        // Upsert company if provided
        let companyData = null
        if (company) {
            const normalizedCompany = {
                company_name: company.company_name,
                registration_number: company.registration_number ?? null,
                address: company.address ?? null,
                office_city: company.office_city ?? null,
                office_zip_postal: company.office_zip_postal ?? null,
                delivery_address: company.delivery_address ?? company.address ?? null,
                delivery_city: company.delivery_city ?? company.office_city ?? null,
                delivery_zip_postal: company.delivery_zip_postal ?? company.office_zip_postal ?? null,
                industry: company.industry ?? null,
                team_size: company.team_size ?? null,
            }

            const { data: existingCompany, error: existingCompanyError } = await supabaseServer
                .from('companies')
                .select('id')
                .eq('profile_id', uuid)
                .maybeSingle()

            if (existingCompanyError) return errorResponse(existingCompanyError.message, 500)

            if (existingCompany) {
                const { data, error: updateCompanyError } = await supabaseServer
                    .from('companies')
                    .update({
                        ...normalizedCompany,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('profile_id', uuid)
                    .select()
                    .single()

                if (updateCompanyError) return errorResponse(updateCompanyError.message, 500)
                companyData = data
            } else {
                const { data, error: insertCompanyError } = await supabaseServer
                    .from('companies')
                    .insert({
                        profile_id: uuid,
                        ...normalizedCompany,
                    })
                    .select()
                    .single()

                if (insertCompanyError) return errorResponse(insertCompanyError.message, 500)
                companyData = data
            }
        }

        return successResponse({ ...profile, company: companyData }, 201)
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}

/** PATCH /api/profile — Partial update (from edit profile screen) */
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json()
        const { user_id, ...updates } = body

        if (!user_id) return errorResponse('user_id is required', 400)

        const uuid = parseUUID(user_id)
        if (!uuid) return errorResponse('Invalid user_id format', 400)

        const { data, error } = await supabaseServer
            .from('profiles')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', uuid)
            .select()
            .single()

        if (error || !data) return errorResponse('Profile not found or update failed', 404)
        return successResponse(data)
    } catch {
        return errorResponse('Invalid request body', 400)
    }
}
