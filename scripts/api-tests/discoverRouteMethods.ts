import fs from 'node:fs'
import path from 'node:path'
import type { HttpMethod, RouteManifestEntry } from './types'

const METHOD_PATTERN = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g
const REEXPORT_PATTERN = /export\s+\{([^}]*)\}\s+from\s+['"][^'"]+['"]/g

function collectRouteFiles(directory: string, output: string[] = []) {
    const entries = fs.readdirSync(directory, { withFileTypes: true })

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name)
        if (entry.isDirectory()) {
            collectRouteFiles(fullPath, output)
            continue
        }
        if (entry.isFile() && entry.name === 'route.ts') {
            output.push(fullPath)
        }
    }

    return output
}

function parseMethodsFromSource(source: string) {
    const methods = new Set<HttpMethod>()

    for (const match of source.matchAll(METHOD_PATTERN)) {
        methods.add(match[1] as HttpMethod)
    }

    for (const match of source.matchAll(REEXPORT_PATTERN)) {
        const methodList = match[1]
            .split(',')
            .map((part) => part.trim())
            .map((part) => part.split(/\s+as\s+/i)[0]?.trim() ?? '')
            .filter(Boolean)

        for (const method of methodList) {
            if (method === 'GET' || method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
                methods.add(method)
            }
        }
    }

    return [...methods]
}

function toEndpoint(routeFile: string, apiRoot: string) {
    const relative = path.relative(apiRoot, routeFile).split(path.sep).join('/')
    const withoutRoute = relative.replace(/\/route\.ts$/, '')
    if (!withoutRoute) return '/api'
    return `/api/${withoutRoute}`
}

export function discoverImplementedRouteMethods(repoRoot: string): RouteManifestEntry[] {
    const apiRoot = path.join(repoRoot, 'src', 'app', 'api')
    const routeFiles = collectRouteFiles(apiRoot)

    const discovered: RouteManifestEntry[] = []
    for (const routeFile of routeFiles) {
        const source = fs.readFileSync(routeFile, 'utf8')
        const methods = parseMethodsFromSource(source)
        const endpoint = toEndpoint(routeFile, apiRoot)

        for (const method of methods) {
            discovered.push({ endpoint, method })
        }
    }

    return discovered.sort((a, b) => {
        const endpointCompare = a.endpoint.localeCompare(b.endpoint)
        if (endpointCompare !== 0) return endpointCompare
        return a.method.localeCompare(b.method)
    })
}
