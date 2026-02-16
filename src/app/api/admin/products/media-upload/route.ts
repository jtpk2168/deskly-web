import { NextRequest } from 'next/server'
import { supabaseServer } from '../../../../../../lib/supabaseServer'
import { errorResponse, successResponse } from '../../../../../../lib/apiResponse'

const IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024
const VIDEO_MAX_SIZE_BYTES = 30 * 1024 * 1024

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime'])

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov'])

async function ensureBucket(bucket: string) {
    const { error } = await supabaseServer.storage.createBucket(bucket, {
        public: true,
    })

    if (!error) return null

    const message = error.message?.toLowerCase() ?? ''
    const statusCode = String((error as { statusCode?: string | number }).statusCode ?? '')
    if (statusCode === '409' || message.includes('already exists') || message.includes('duplicate')) {
        return null
    }

    return error.message
}

/** POST /api/admin/products/media-upload — Upload image/video to Supabase Storage */
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get('file')
        const mediaType = String(formData.get('mediaType') ?? '').toLowerCase()

        if (!(file instanceof File)) return errorResponse('file is required', 400)
        if (mediaType !== 'image' && mediaType !== 'video') {
            return errorResponse('mediaType must be image or video', 400)
        }

        const extension = file.name.split('.').pop()?.toLowerCase() ?? ''

        if (mediaType === 'image') {
            if (file.size > IMAGE_MAX_SIZE_BYTES) {
                return errorResponse('Image exceeds 5MB limit', 400)
            }

            if (!IMAGE_MIME_TYPES.has(file.type) && !IMAGE_EXTENSIONS.has(extension)) {
                return errorResponse('Image must be JPG, PNG, or WebP', 400)
            }
        }

        if (mediaType === 'video') {
            if (file.size > VIDEO_MAX_SIZE_BYTES) {
                return errorResponse('Video exceeds 30MB limit', 400)
            }

            if (!VIDEO_MIME_TYPES.has(file.type) && !VIDEO_EXTENSIONS.has(extension)) {
                return errorResponse('Video must be MP4 or MOV', 400)
            }
        }

        const bucket = mediaType === 'image' ? 'product-images' : 'product-videos'
        const bucketError = await ensureBucket(bucket)
        if (bucketError) {
            return errorResponse(`Failed to prepare media bucket: ${bucketError}`, 500)
        }

        const safeExtension = extension || (mediaType === 'image' ? 'jpg' : 'mp4')
        const path = `products/${Date.now()}-${crypto.randomUUID()}.${safeExtension}`

        const fileBuffer = await file.arrayBuffer()
        const { error: uploadError } = await supabaseServer.storage
            .from(bucket)
            .upload(path, fileBuffer, {
                contentType: file.type || undefined,
                upsert: false,
            })

        if (uploadError) {
            return errorResponse(uploadError.message, 500)
        }

        const { data } = supabaseServer.storage.from(bucket).getPublicUrl(path)

        return successResponse({
            url: data.publicUrl,
            bucket,
            path,
            mediaType,
        }, 201)
    } catch {
        return errorResponse('Invalid upload payload', 400)
    }
}
