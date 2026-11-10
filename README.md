<div align="center">

# Fluxen POS

**Run every shop, the factory behind them, and the billing counter from one dashboard.**

Multi-shop point of sale · inventory & stock transfers · GST billing · role-based access · 14-day free trial · operator admin center

![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![NestJS 11](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)
![Prisma 7](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/deploys%20with-Docker%20Compose-2496ED?logo=docker&logoColor=white)

[Quick start](#quick-start) · [What it does](#what-it-does) · [Try the demo](#try-the-demo-shop) · [Trial & billing](#free-trial-and-billing) · [Architecture](#how-it-works) · [Environment](#environment-variables) · [Deploy](#deploying-with-docker-compose-dokploy) · [Troubleshooting](#troubleshooting)

</div>

![Fluxen POS dashboard: today's revenue, a 7-day revenue chart, recent bills and low-stock alerts](docs/screenshots/dashboard.png)

---

## Who is this for?

Fluxen POS is built for **sweet shops, bakeries and small retail chains** that make or buy stock centrally (a *factory*) and sell it through several counters (*shops*). It covers the daily work of a shop owner and the people they employ:

- **Owners** see sales across every shop, manage staff and permissions, and move stock between locations.
- **Managers** keep the catalog and inventory right and approve what staff ask for.
- **Cashiers** bill customers fast with a barcode scanner, cash or UPI, and print a GST bill.
- **Platform operators** (you, if you host this for other businesses) manage trials, plans and plan requests from a separate admin center.

---

## Quick start

### 1. Install

| You need | Why | Check it |
|---|---|---|
| **[Node.js](https://nodejs.org/)** 20.19+ (22.x recommended) | Runs the API and dashboard | `node -v` |
| **[pnpm](https://pnpm.io/)** 10.x | Workspace package manager | `pnpm -v` (`npm i -g pnpm`) |
| **PostgreSQL** 14+ (16 recommended) | The database | `pg_isready` |
| **Redis** 7 | Required in production; optional while developing | `redis-cli ping` |

The quickest way to get PostgreSQL and Redis is Docker:

```bash
docker run -d --name fluxen-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fluxen_pos postgres:16

docker run -d --name fluxen-redis -p 6379:6379 redis:7-alpine
```

### 2. Get the code

```bash
git clone https://github.com/thakurgaurav273/pos-platform.git
cd pos-platform
pnpm install
```

`pnpm install` also builds the shared `@fluxen/database` package (through the root `prepare` script).

### 3. Configure

The repo has no `.env.example` files, so create these two files by hand.

**`apps/api/.env`**

```env
PORT=3001
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fluxen_pos"
JWT_SECRET="change-me-to-at-least-32-random-characters"
CORS_ORIGIN="http://localhost:3000"
REDIS_URL="redis://localhost:6379"

# Optional while developing
RESEND_API_KEY=""
EMAIL_FROM="Fluxen POS <onboarding@resend.dev>"
```

**`apps/dashboard/.env.local`**

```env
NEXT_PUBLIC_API_URL="http://localhost:3001"
# Optional, only for product image uploads
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=""
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=""
```

> The dashboard proxies every `/api/*` request to the API (see `apps/dashboard/next.config.ts`), so the browser only ever talks to one origin. If `NEXT_PUBLIC_API_URL` is unset, the proxy falls back to `http://127.0.0.1:3001`.

### 4. Create the database

```bash
pnpm --filter @fluxen/database exec prisma migrate deploy
pnpm --filter @fluxen/database exec prisma generate
```

### 5. Start it

```bash
pnpm dev
```

Turborepo starts the API and the dashboard together.

| App | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| API | http://localhost:3001/api |

Open the dashboard, click **Sign up**, create your business, and you land in the onboarding wizard with a **14-day free trial** already running.

### 6. Stop it

Press **Ctrl+C**. Your data stays in PostgreSQL.

---

## What it does

| Area | What you can do |
|---|---|
| **Multi-shop & factory** | An *organization* owns one factory and any number of retail shops. Each shop has its own `shopCode`, GST rates (CGST/SGST), UPI ID, bank details, FSSAI number and bill header. |
| **Point of sale** | Scan barcodes or tap products, sell by weight or piece, split a bill across **cash and UPI/card**, see change due, print the bill. Orders can come from `POS` or `WEBSITE`. |
| **Catalog** | Categories, products and **variants** (200 g, 1 kg…), each with its own barcode, SKU, price, cost price, HSN code and stock. Product images, bulk **catalog import**, and printable barcode labels. |
| **Inventory** | Fractional stock (kg, litres, pieces) and an append-only **stock-movement ledger** with a reason for every change. |
| **Stock transfers** | A formal request flow between shops and the factory: `PENDING → APPROVED → FULFILLED`. |
| **Orders** | Search and open any bill. Cancel with a reason, attributed to the user who did it. Sequential numeric bill numbers per shop. |
| **Customers (CRM)** | Customers are unique by phone per shop, with notes, GSTIN and purchase history. |
| **Reports** | Sales dashboard with charts, payment mix and a **GST summary**. Export to Excel and PDF. |
| **Users & roles** | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `CASHIER`, `STAFF`, plus per-user `permissionOverrides`. Staff raise a **role request** to ask for a role change or extra permissions. |
| **Notifications** | An in-app activity bell and transactional emails through Resend. |
| **Theming** | Each shop picks a theme preset, brand colours, light/dark mode and layout style. |
| **Trial & plans** | 14-day free trial on signup, a read-only lock when it ends, and a plan-request flow handled by the operator. See [Free trial and billing](#free-trial-and-billing). |
| **Operator admin center** | A separate, two-factor-protected console at `/operator` for platform owners. |
| **Public demo** | An optional one-click "Try the demo" shop pre-filled with sample data. |

## Product tour

Every screenshot below is the built-in demo shop, **Fluxen Demo Bakery**, so you can open the same screens yourself with [Try the demo](#try-the-demo-shop).

### Bill at the counter

Scan a barcode (or search and tap a product), and the sale builds up on the right with CGST and SGST worked out per line. Pick **Cash, UPI, Card or Split**, then generate the bill. Standard, Instant and Raw modes cover careful billing, one-tap billing and manual lines.

![Billing POS: a three-line sale with CGST and SGST, and Cash, UPI, Card and Split payment buttons](docs/screenshots/billing-pos.png)

### See the day at a glance

Today's revenue, the month so far, a 7 / 30 day or custom revenue chart, the payment mix, recent bills and a **Restock soon** list, all per shop and on IST days.

![Dashboard with key figures, revenue chart, recent bills, today's payments and restock alerts](docs/screenshots/dashboard.png)

### Find any bill

Search by customer name, phone or bill number, see the payment mode and status of every sale, and export to a spreadsheet.

![Orders list with source, bill reference, payment, customer, items, total and status](docs/screenshots/orders.png)

### Keep stock honest

One row per variant with its barcode, quantity and low-stock alert level. Print barcode labels, export, or **request a refill** from the factory.

![Stock table with barcodes, quantities, alert levels, export, print barcodes and request refill](docs/screenshots/inventory.png)

### File GST without a spreadsheet

Tax collected on paid bills for any month, split into CGST and SGST, with a breakdown by GST rate and a one-click export.

![GST summary for a month: GST collected, CGST, SGST, taxable value and tax by rate](docs/screenshots/gst-summary.png)

### Control who can do what

Owners, managers and cashiers each get a role. Edit a person to change their role or fine-tune their permissions.

![Users list showing Cashier, Manager and Super Admin roles for one shop](docs/screenshots/users.png)

### Sign in, or try the demo

![Login page with the Try the demo button](docs/screenshots/login.png)

![Landing page: "Billing at the counter. Stock from the kitchen." with a 14-day free trial](docs/screenshots/landing.png)

### Dashboard pages

| Route | Page |
|---|---|
| `/` | Landing page |
| `/login`, `/signup`, `/forgot-password` | Authentication |
| `/onboarding` | First-run wizard |
| `/dashboard` | Sales overview |
| `/billing-pos` | The POS billing screen (manual and barcode entry) |
| `/orders`, `/orders/[orderId]` | Order list and bill detail |
| `/products`, `/categories`, `/inventory` | Catalog and stock |
| `/stock-transfers` | Transfer requests between shops and the factory |
| `/customers` | Customer manager |
| `/reports`, `/reports/gst-summary` | Reports and GST summary |
| `/users` | Staff, roles and permission overrides |
| `/shops`, `/shops/[shopCode]` | Shop list, create-shop wizard, shop details |
| `/settings` | Shop profile, tax, UPI, bank, theme |
| `/billing` | Your plan, trial status and the plan-request form |
| `/operator/*` | Operator login, overview, businesses, plan requests |
| `/privacy`, `/terms`, `/refunds`, `/cookies`, `/contact`, `/data-deletion` | Legal pages |

---

## Try the demo shop

A shared, pre-filled **"Fluxen Demo Bakery"** lets visitors explore the product without signing up.

- It is **on by default in development** and **off in production** until you set `DEMO_ENABLED=true`.
- The login page shows a **Try the demo** button. Sessions are issued by the server, so nobody needs a demo password.
- Demo accounts: `demo@fluxen.app` (owner), `demo.manager@fluxen.app`, `demo.cashier@fluxen.app`.

```bash
# Create the demo business if it is missing
pnpm --filter api seed:demo

# Wipe it and rebuild (e.g. from a nightly cron)
pnpm --filter api seed:demo -- --reset

# In production, inside the fluxen-api container
node dist/demo/run.js --reset
```

---

## Free trial and billing

Every new business starts a **14-day free trial** with full access. The app does not collect cards. Moving to a paid plan is handled by a person, through a plan request.

```mermaid
flowchart LR
    S["Sign up"] --> T["TRIAL<br/>14 days, full access"]
    T -- "owner clicks<br/>Request a plan" --> E["Plan enquiry<br/>(OPEN)"]
    E -- "operator contacts them<br/>and collects the fee" --> A["Operator activates<br/>plan + paidUntil"]
    A --> P["ACTIVE"]
    T -- "trial ends,<br/>no plan" --> X["EXPIRED<br/>read-only"]
    P -- "paidUntil passes" --> X
    X -- "operator activates<br/>or extends" --> P
```

| State | What the business can do |
|---|---|
| **TRIAL** | Everything. A banner shows the days left. |
| **ACTIVE** | Everything. An `ACTIVE` business with no `paidUntil` never expires (existing businesses and the shared demo are grandfathered). |
| **EXPIRED** | **Look but not change.** A read-only interceptor on the API blocks writes, and the dashboard shows a lock screen with a *Request a plan* button. Nothing is deleted. |

The single source of truth is `describeSubscription()` in `apps/api/src/billing/subscription.ts`, so the banner, the API guard and the operator console always agree.

**How you take payment:** when a business sends a plan request, operators are emailed (the addresses in `PLAN_ENQUIRY_TO`, or all active operators if it is empty). You agree the plan and collect the fee your own way (UPI, bank transfer, invoice), then open the business in the operator console and **activate a plan** or **extend the trial**. Plan fees are not auto-charged. Paytm is integrated for storefront order payments.

---

## Operator admin center

Platform operators are **separate accounts** from shop users, so a shop owner can never reach this console.

- Sign in at **`/operator/login`** with email, password and an **authenticator-app code** (TOTP). The secret is stored AES-256-GCM encrypted and each code works only once.
- **Overview:** how many businesses are in trial, active and expired.
- **Businesses:** open one to **activate a plan**, **extend a trial**, **revoke** access, or **reset a user's password**.
- **Plan requests:** every enquiry, with status `OPEN → CONTACTED → CLOSED`.

Operators are created only from the command line:

```bash
# local
pnpm --filter api operator create you@example.com "Your Name"

# production, inside the fluxen-api container
node dist/billing/operator-admin.js create you@example.com "Your Name"
```

It prints a one-time password, and you set up the authenticator app on first sign-in. Other commands: `reset-password`, `reset-2fa` (lost phone), `deactivate`, `activate`, `list`.

---

## Roles and permissions

| Role | Typical use |
|---|---|
| `SUPER_ADMIN` | Business owner |
| `ADMIN` | Senior administrator |
| `MANAGER` | Shop manager |
| `CASHIER` | Billing counter |
| `STAFF` | Floor staff |

- **`permissionOverrides`** (JSON on each user) extends or narrows the role defaults for one person.
- **Role requests:** staff ask for a role change or extra permissions, and someone with authority approves or rejects it.
- Every shop-owned row carries a `shopCode`, and the API filters by it.

---

## The data model

```mermaid
erDiagram
    Organization ||--o{ Shop : owns
    Organization ||--o{ PlanEnquiry : receives
    Shop ||--o{ User : employs
    Shop ||--o{ Product : stocks
    Shop ||--o{ Order : sells
    Shop ||--o{ Customer : serves
    Category ||--o{ Product : groups
    Product ||--o{ ProductVariant : "comes in"
    Product ||--o{ ProductImage : shows
    Order ||--o{ OrderItem : contains
    Order ||--o{ OrderPayment : "paid by"
    ProductVariant ||--o{ OrderItem : "sold as"
    ProductVariant ||--o{ StockMovement : "logged in"
    Shop ||--o{ StockTransferRequest : "sends / receives"
    StockTransferRequest ||--o{ StockTransferItem : lists
    User ||--o{ RoleRequest : raises
```

| Model | What's in it |
|---|---|
| `Organization` | The tenant: onboarding state, `subscriptionStatus`, `trialEndsAt`, `planName`, `paidUntil` |
| `Shop` | `shopCode`, `isFactory`, GST rates, UPI, bank, FSSAI, booking flags, `themeConfig` |
| `User` | Email, role, `isActive`, `permissionOverrides`; belongs to a shop |
| `Product`, `ProductVariant`, `ProductImage`, `Category` | The catalog; variants hold barcode, SKU, price, cost, HSN and stock |
| `Order`, `OrderItem`, `OrderPayment` | Bills, line items (with POS label quantity) and split payments |
| `InvoiceSequence` | Counter behind sequential bill numbers |
| `StockMovement` | Inventory ledger with a reason per movement |
| `StockTransferRequest`, `StockTransferItem` | Stock moving between shops and factories |
| `RoleRequest` | Role or permission change workflow |
| `Customer` | CRM record, unique per shop by phone |
| `PlanEnquiry`, `OperatorAccount` | Plan requests and platform operators |

Money is stored as `Decimal(12,2)` and quantities as `Decimal(12,3)`, so there is no floating-point drift. The full schema is in [`packages/database/prisma/schema.prisma`](packages/database/prisma/schema.prisma).

---

## How it works

```mermaid
flowchart LR
    B["Browser"] --> D["Next.js dashboard<br/>:3000"]
    D -- "/api/* rewrite" --> A["NestJS API<br/>:3001 dev / :4000 Docker"]
    A --> P[("PostgreSQL<br/>Prisma 7 + pg adapter")]
    A --> R[("Redis")]
    A --> M["Resend<br/>emails"]
    A --> T["Paytm<br/>payments"]
    D --> C["Cloudinary<br/>image uploads"]
```

- **One origin for the browser.** The dashboard proxies `/api/*` to the API, so production needs no CORS setup between them and the API needs no public domain.
- **Shop scoping.** Services filter by `shopCode`, and role checks guard the controllers.
- **Environment is validated at boot.** `common/env.validation.ts` fails fast on a missing `DATABASE_URL`, a weak `JWT_SECRET`, or missing production settings (Paytm, Resend, Redis, `APP_URL`, `FRONTEND_URL`).
- **Integrity tests.** `apps/api/test/integrity.e2e-spec.ts` runs against a real local Postgres and covers stock, pricing and payment edge cases. See `tasks.md` for the review behind it.
- **Read-only lock.** `read-only.interceptor.ts` rejects write requests from an expired business.
- **Rate limiting** on the public storefront endpoints.

### Repository layout

```text
pos-platform/
├── apps/
│   ├── api/                      NestJS 11 REST API (global prefix /api)
│   │   ├── src/
│   │   │   ├── auth/             JWT login, signup, password reset
│   │   │   ├── organizations/    tenants and onboarding
│   │   │   ├── shops/            shops, GST, theme config
│   │   │   ├── users/            staff and permission overrides
│   │   │   ├── role-requests/    role / permission request workflow
│   │   │   ├── products/  category/  inventory/  catalog-import/
│   │   │   ├── orders/           billing, payments, price policy
│   │   │   ├── stock-transfers/  shop ⇄ factory transfers
│   │   │   ├── customers/        CRM
│   │   │   ├── analytics/        dashboard and report queries
│   │   │   ├── billing/          trial, plans, operator console, TOTP
│   │   │   ├── payment/          Paytm checkout and callback
│   │   │   ├── public/           storefront endpoints (rate limited)
│   │   │   ├── notifications/  email/  settings/
│   │   │   ├── demo/             shared demo shop seeder
│   │   │   └── seed/             initial data
│   │   └── test/                 e2e suites (integrity, catalog import)
│   └── dashboard/                Next.js 16 App Router
│       └── src/
│           ├── app/              (app) (auth) (legal) (onboarding) (operator)
│           ├── components/       DataTable, BillDrawer, Landing, Operator, …
│           └── lib/
├── packages/
│   ├── database/                 Prisma schema, migrations, shared client
│   └── types/                    shared TypeScript types
├── docs/screenshots/             the images in this README (demo data only)
├── Dockerfile                    multi-stage: `api` and `dashboard` targets
├── docker-compose.yml            Dokploy / production stack
├── dokploy.env.example           production environment template
├── turbo.json  pnpm-workspace.yaml
├── tasks.md                      data-integrity review notes
└── CLAUDE.md                     coding standards and project context
```

Built with Next.js 16, React 19, Tailwind CSS 4, Ant Design, Recharts, NestJS 11, Prisma 7, PostgreSQL, Redis, `class-validator`, JWT, `exceljs`, `jspdf` and `jsbarcode`.

---

## Environment variables

### `apps/api/.env`

| Variable | Required | Description |
|---|:-:|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | JWT signing secret; at least 32 characters in production |
| `PORT` | No | API port (default `3000`; use `3001` in dev so the dashboard proxy finds it) |
| `CORS_ORIGIN` | No | Allowed browser origin (defaults to `APP_URL` in the Compose stack) |
| `REDIS_URL` | Prod | Redis connection (defaults to `redis://localhost:6379`) |
| `APP_URL` | Prod | Public dashboard URL; used in email links and the Paytm callback |
| `FRONTEND_URL` | Prod | Where Paytm sends shoppers after paying |
| `RESEND_API_KEY` | Prod | Resend key for emails |
| `EMAIL_FROM` | No | Sender, e.g. `Fluxen POS <hello@example.com>` |
| `PLAN_ENQUIRY_TO` | No | Comma-separated emails for plan requests (empty = all active operators) |
| `PAYTM_MID`, `PAYTM_MERCHANT_KEY` | Prod | Paytm credentials; the key is exactly 16 characters |
| `PAYTM_WEBSITE` | No | Defaults to `DEFAULT`; use `WEBSTAGING` for the Paytm test site |
| `PUBLIC_ASSET_ORIGIN` | No | Origin used for `/uploads/...` image URLs |
| `TRUST_PROXY` | No | `1` when behind Traefik or nginx |
| `DEMO_ENABLED` | No | `true` enables the public demo in production |
| `KEEP_WARM_URL` | No | Self-ping for hosts that sleep idle apps; `off` disables it |

### `apps/dashboard/.env.local`

| Variable | Required | Description |
|---|:-:|---|
| `NEXT_PUBLIC_API_URL` | No | API origin for the dev proxy |
| `API_UPSTREAM_URL` | No | Overrides the proxy target (set at build time in Docker) |
| `INTERNAL_API_URL` | No | Server-side API URL used by Next in Docker |
| `NEXT_PUBLIC_API_DEFAULT_SHOP_CODE` | No | Default shop for the public storefront |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | No | Product image uploads |

### `packages/database/.env`

Used by the Prisma CLI. It can reuse the same `DATABASE_URL` as the API.

---

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start the API and dashboard together |
| `pnpm dev:api` / `pnpm dev:dash` | Start one app only |
| `pnpm build` | Build everything through Turborepo |
| `pnpm lint` | Lint every workspace |
| `pnpm --filter api test` | API unit tests (Jest) |
| `pnpm --filter api test:e2e` | API end-to-end tests (needs a local database, see below) |
| `pnpm --filter api seed` | Load initial seed data |
| `pnpm --filter api seed:demo` | Create the demo shop (`-- --reset` to rebuild) |
| `pnpm --filter api operator <cmd>` | Manage platform operators |

### Database commands

Always run Prisma through the package filter:

```bash
pnpm --filter @fluxen/database exec prisma generate            # after schema changes
pnpm --filter @fluxen/database exec prisma migrate dev --name my_change
pnpm --filter @fluxen/database exec prisma migrate deploy      # apply in production
pnpm --filter @fluxen/database exec prisma studio              # browse data
pnpm --filter @fluxen/database exec prisma migrate reset       # drops all data
```

### Running the end-to-end tests

```bash
createdb cs_test
DATABASE_URL=postgresql://localhost:5432/cs_test \
  pnpm --filter @fluxen/database exec prisma migrate deploy
TEST_DATABASE_URL=postgresql://localhost:5432/cs_test pnpm --filter api test:e2e
```

Use a throwaway local database; the suite writes real rows.

---

## Deploying with Docker Compose (Dokploy)

`docker-compose.yml` runs the whole stack with no host ports, ready for Traefik:

| Service | Role |
|---|---|
| `fluxen-postgres` | PostgreSQL 16 with a persistent volume and healthcheck |
| `fluxen-redis` | Redis 7 with append-only persistence |
| `fluxen-migrate` | Runs `prisma migrate deploy`, then exits. The API waits for it. |
| `fluxen-api` | NestJS API on internal port `4000`, with an uploads volume |
| `fluxen-dashboard` | Next.js on port `3000`; **attach your domain to this service** |

1. Create a Compose project in Dokploy pointing at this repo.
2. Paste [`dokploy.env.example`](dokploy.env.example) into **Environment** and fill in real values. Required ones (`POSTGRES_PASSWORD`, `JWT_SECRET`, `APP_URL`, `FRONTEND_URL`, `RESEND_API_KEY`, `PLAN_ENQUIRY_TO`, `PAYTM_*`) stop the deploy with a clear message if they are missing.
3. In **Domains**, add your domain to `fluxen-dashboard`, container port `3000`.
4. Deploy. Migrations run automatically.
5. Create your first operator inside the `fluxen-api` container (see [Operator admin center](#operator-admin-center)).

`NEXT_PUBLIC_*` values are baked in at build time, so changing them needs a redeploy.

---

## Coding standards

- Strict TypeScript; avoid `any` and share types through `packages/types`.
- Backend: explicit DTOs with `class-validator`, Nest dependency injection, Prisma Client instead of raw SQL, `include` used sparingly.
- Frontend: Server Components where possible, `"use client"` pushed down the tree, Tailwind for styling, the shared `DataTable` for grids and Recharts for charts.
- Always scope data by `shopCode` and respect role-based access.

More detail lives in [`CLAUDE.md`](CLAUDE.md).

---

## Troubleshooting

| Problem | What to do |
|---|---|
| `PrismaClientConstructorValidationError: adapter or accelerateUrl required` | Prisma 7 needs `@prisma/adapter-pg`. It is wired into `PrismaService` and `packages/database/client.ts`; run `pnpm install` so `@prisma/adapter-pg` and `pg` are present. |
| `Invalid environment: …` on API start | `validateEnv` found a missing or weak value. Fix what it lists. |
| `Database connection failed` on startup | Check `pg_isready -h localhost -p 5432`, that `DATABASE_URL` is correct, that the database exists, and that migrations are applied. |
| `EADDRINUSE: address already in use` | Another process owns the port. Change `PORT` in `apps/api/.env` or stop the other process. |
| Dashboard loads but every call fails | The API is not where the proxy expects. Set `PORT=3001` for the API, or point `NEXT_PUBLIC_API_URL` / `API_UPSTREAM_URL` at it. |
| Prisma client out of sync after a pull | `pnpm --filter @fluxen/database exec prisma generate` |
| "Set POSTGRES_PASSWORD" (or similar) on deploy | A required Compose variable is missing. Add it under Dokploy > Environment. |
| A business is stuck read-only | Its trial or plan ended. Activate a plan or extend the trial from `/operator`. |
| Lost the operator authenticator | `node dist/billing/operator-admin.js reset-2fa you@example.com` |
| No emails arrive | Set `RESEND_API_KEY` and a verified `EMAIL_FROM`. |
| Install problems | `rm -rf node_modules apps/*/node_modules packages/*/node_modules && pnpm install` |

---

## FAQ

**Is this multi-tenant?**
Yes. An `Organization` is the tenant; it owns shops, and shop data is filtered by `shopCode`.

**Can I charge customers automatically?**
Not for plan fees. Paid plans are activated by an operator after a plan request, which keeps pricing and invoicing flexible. Paytm is integrated for storefront order payments.

**What happens to data when a trial ends?**
Nothing is deleted. The business becomes read-only until a plan is activated.

**How do I add a feature?**
Add a Nest module under `apps/api/src`, a Prisma model plus a migration in `packages/database`, and a page under `apps/dashboard/src/app/(app)`.

---

## Security

- Passwords are hashed with `bcrypt` and sessions use signed JWTs.
- Operator accounts require TOTP two-factor authentication with single-use codes.
- Public storefront endpoints are rate limited.
- Never commit real `.env` files or database dumps that contain customer data. Use `dokploy.env.example` as the template for secrets.

---

## License

Private and unlicensed. All rights reserved.
