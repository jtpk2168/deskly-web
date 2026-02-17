export function toMoney(value: number) {
    return Number(value.toFixed(2))
}

export function toMinorUnit(value: number) {
    return Math.round(toMoney(value) * 100)
}

