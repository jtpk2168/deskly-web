function normalizeCsvLineBreaks(input: string) {
    return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function parseCsv(input: string): string[][] {
    const rows: string[][] = []
    const normalized = normalizeCsvLineBreaks(input)
    let row: string[] = []
    let value = ''
    let inQuotes = false

    for (let i = 0; i < normalized.length; i += 1) {
        const char = normalized[i]
        const nextChar = normalized[i + 1]

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                value += '"'
                i += 1
                continue
            }
            inQuotes = !inQuotes
            continue
        }

        if (char === ',' && !inQuotes) {
            row.push(value)
            value = ''
            continue
        }

        if (char === '\n' && !inQuotes) {
            row.push(value)
            rows.push(row)
            row = []
            value = ''
            continue
        }

        value += char
    }

    if (inQuotes) {
        throw new Error('CSV has an unclosed quoted field')
    }

    row.push(value)
    rows.push(row)

    return rows
}

export function csvEscape(value: unknown): string {
    if (value == null) return ''
    const raw = String(value)
    if (!/[",\n]/.test(raw)) return raw
    return `"${raw.replace(/"/g, '""')}"`
}

export function toCsv(rows: Array<Array<unknown>>): string {
    return rows.map((row) => row.map(csvEscape).join(',')).join('\n')
}
