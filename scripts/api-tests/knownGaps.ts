export type KnownGap = {
    id: string
    endpoint: string
    method: string
    reason: string
    owner: string
    expiresOn: string
}

export const KNOWN_GAPS: KnownGap[] = [
    {
        id: 'SETUP-GAP-001',
        endpoint: '/api/setup-admin',
        method: 'GET',
        reason: 'Route is not currently restricted to local-only; staging/prod exposure risk; must be gated by environment/secret in future.',
        owner: 'TBD',
        expiresOn: 'TBD-YYYY-MM-DD',
    },
]

