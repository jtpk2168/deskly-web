'use client'

import { useState } from 'react'
import { Expand, Image as ImageIcon, X } from 'lucide-react'

type ProductMediaPreviewProps = {
    imageUrl?: string | null
    videoUrl?: string | null
}

function hasMediaUrl(value?: string | null) {
    return Boolean(value && value.trim().length > 0)
}

export function ProductMediaPreview({ imageUrl, videoUrl }: ProductMediaPreviewProps) {
    const [imageViewerOpen, setImageViewerOpen] = useState(false)
    const hasImage = hasMediaUrl(imageUrl)
    const hasVideo = hasMediaUrl(videoUrl)

    return (
        <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-subtext-light">Image Viewer</p>
                        {hasImage && (
                            <button
                                type="button"
                                onClick={() => setImageViewerOpen(true)}
                                className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-text-light hover:bg-gray-50"
                            >
                                <Expand className="h-3.5 w-3.5" />
                                Full View
                            </button>
                        )}
                    </div>

                    {hasImage ? (
                        <button
                            type="button"
                            onClick={() => setImageViewerOpen(true)}
                            className="block w-full overflow-hidden rounded-md border border-gray-200 bg-white"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={imageUrl as string}
                                alt="Product preview"
                                className="h-52 w-full object-cover"
                            />
                        </button>
                    ) : (
                        <div className="flex h-52 w-full items-center justify-center rounded-md border border-dashed border-gray-300 bg-white text-sm text-subtext-light">
                            <div className="flex items-center gap-2">
                                <ImageIcon className="h-4 w-4" />
                                No image selected
                            </div>
                        </div>
                    )}
                </div>

                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtext-light">Video Player</p>
                    {hasVideo ? (
                        <video
                            key={videoUrl}
                            controls
                            preload="metadata"
                            className="h-52 w-full rounded-md border border-gray-200 bg-black object-cover"
                        >
                            <source src={videoUrl as string} />
                            Your browser does not support the video tag.
                        </video>
                    ) : (
                        <div className="flex h-52 w-full items-center justify-center rounded-md border border-dashed border-gray-300 bg-white text-sm text-subtext-light">
                            No video selected
                        </div>
                    )}
                </div>
            </div>

            {imageViewerOpen && hasImage && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
                    <button
                        type="button"
                        aria-label="Close image viewer"
                        onClick={() => setImageViewerOpen(false)}
                        className="absolute right-4 top-4 rounded-md bg-white/90 p-2 text-text-light hover:bg-white"
                    >
                        <X className="h-5 w-5" />
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={imageUrl as string}
                        alt="Full size product image"
                        className="max-h-[90vh] max-w-[90vw] rounded-md object-contain"
                    />
                </div>
            )}
        </>
    )
}
