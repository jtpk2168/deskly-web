This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Billing Setup (Mock + Stripe)

Billing endpoints are now scaffolded with provider abstraction:

- `POST /api/billing/checkout`
- `POST /api/billing/catalog/sync`
- `GET /api/billing/config`
- `POST /api/webhooks/stripe`

Recommended local `.env.local` defaults:

```bash
BILLING_PROVIDER=mock
BILLING_DEFAULT_CURRENCY=myr
BILLING_MINIMUM_TERM_MONTHS=12
BILLING_SST_RATE=0.08
BILLING_STRIPE_AUTOMATIC_TAX=true
```

When testing with Stripe Test Mode, switch provider and set:

```bash
BILLING_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
BILLING_CHECKOUT_SUCCESS_URL=https://your-success-url
BILLING_CHECKOUT_CANCEL_URL=https://your-cancel-url
```

Catalog sync (dry run first):

```bash
curl -X POST http://localhost:3000/api/billing/catalog/sync \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
```
