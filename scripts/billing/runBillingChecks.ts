import assert from 'node:assert/strict'
import { calculateCommitmentEndDate } from '../../src/lib/billing/commitment'
import { mapStripeSubscriptionStatus } from '../../src/lib/billing/stripeWebhook'
import { calculateSstQuote } from '../../src/lib/billing/tax'
import { parseCheckoutItems } from '../../src/lib/billing/validation'

function testSstQuote() {
    const quote = calculateSstQuote(100, 'myr')
    assert.equal(quote.subtotal, 100)
    assert.equal(quote.sst_amount, 8)
    assert.equal(quote.total, 108)
    assert.equal(quote.currency, 'myr')
}

function testCommitmentCalculation() {
    const startDate = '2026-01-15T00:00:00.000Z'
    const endDate = calculateCommitmentEndDate(startDate, 12)
    assert.ok(endDate.startsWith('2027-01-15'))
}

function testCheckoutItemValidation() {
    const valid = parseCheckoutItems([
        {
            product_id: '86fc104f-80ef-42e0-b3f1-5776b95ad0e8',
            product_name: 'Task Chair',
            monthly_price: 99.5,
            duration_months: 12,
            quantity: 10,
        },
    ])

    assert.equal(valid.error, null)
    assert.equal(valid.items.length, 1)
    assert.equal(valid.items[0]?.quantity, 10)
    assert.equal(valid.items[0]?.monthly_price, 99.5)

    const invalid = parseCheckoutItems([
        {
            product_name: 'Desk',
            monthly_price: -1,
            quantity: 1,
        },
    ])

    assert.ok(typeof invalid.error === 'string')
}

function testStripeStatusMapping() {
    assert.equal(mapStripeSubscriptionStatus('active'), 'active')
    assert.equal(mapStripeSubscriptionStatus('past_due'), 'payment_failed')
    assert.equal(mapStripeSubscriptionStatus('incomplete'), 'incomplete')
    assert.equal(mapStripeSubscriptionStatus('canceled'), 'cancelled')
}

function run() {
    testSstQuote()
    testCommitmentCalculation()
    testCheckoutItemValidation()
    testStripeStatusMapping()
    console.log('Billing checks passed')
}

run()

