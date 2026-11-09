# Fluxen POS: Data Integrity & Transaction Review

**Review:** 2026-10-17 · **Fixes:** branch `fix/data-integrity` (uncommitted) · **Base commit:** `d44e512`

**Status: all 35 review bugs and 3 new findings are fixed and tested locally.** Nothing was run against Neon or any other remote service.

Legend: **[BUG]** defect · **[DECISION]** a choice made during review or fix · **[FIXED]** done and verified · **Verified** reproduced live or seen in production data · **Static** found by reading code

---

## 0. How this was tested (local only)

| Check | Result |
|---|---|
| New regression suite `apps/api/test/integrity.e2e-spec.ts` (real AppModule plus a local Postgres) | **23/23 pass**, and a stock-ledger invariant is asserted after every test |
| Existing API unit tests | **6/6 pass** (2 were already failing on `main`; fixed) |
| API `tsc --noEmit` | clean |
| API ESLint on touched files | 77 errors on `main` → 64 now. All remaining errors predate this work (untyped Paytm/axios, `req.user as any`) |
| Dashboard `tsc` and `next build` | clean, builds |
| Dashboard ESLint (whole project) | 21 errors before and 21 after: no new errors |
| `prisma migrate deploy` on an **empty** DB | builds the full schema with **zero drift** (it could not before, see B-36) |
| Deploy rehearsal on a **fresh restore of the production backup** | runbook (§4) applies cleanly with zero drift. All 763 orders and ₹666,959.56 revenue preserved |
| The original 18 live attacks (T1–T18), re-run against the fixed API on the migrated production copy | all blocked (table below) |

Run the suite yourself (it refuses any non-local DB host):

```bash
createdb -h /tmp cs_test
DATABASE_URL=postgresql://localhost:5432/cs_test pnpm --filter @fluxen/database exec prisma migrate deploy
TEST_DATABASE_URL=postgresql://localhost:5432/cs_test pnpm --filter api test:e2e
```

### Before and after, on the same production data

| # | Attack | Before | After |
|---|---|---|---|
| T1 | stock 3, 10 parallel sales | 10 sold, stock **−7** | 3×201, 7×400, stock **0** |
| T2 | same item on 2 lines, stock 1 | sold, stock −1 | 400, stock 1 |
| T3 | unitPrice ₹0.01 for a ₹90 item | stored at ₹0.01 | 409 "Price … is now ₹90.00" |
| T4 | ₹500 discount on ₹90 | total **−₹410** | 400 "Discount cannot exceed the bill" |
| T5 | cashier deletes a bill | deleted, stock not returned, bill-number gap | cashier 403. Manager cancel: stock 45→50, bill `26-27/000004` kept as CANCELLED |
| T6 | backdated FY boundary | single shared series | `25-26/000001` for 22:30 IST 31 Mar, `26-27/…` for 01:30 IST 1 Apr |
| T7 | repeat customer, phone only | email and GSTIN wiped | kept |
| T9 | delete product | 500 | 200, sales keep their snapshot |
| T10 | web order qty −10 / bad date / out of stock | −₹900 order / 500 / 500 | 400 / 400 / 400 |
| T11 | dashboard vs reports, same day | ₹−689.99 vs ₹210.01 | identical |
| T12 | 0.5 kg transfer; 5 parallel fulfils | 400; stock moved 5× | accepted; one 200, the rest 409; moved once |
| T13 | ADMIN makes a cashier SUPER_ADMIN | succeeded | 403 |
| T14 | new shop code | `SH000NaN` | `SH000001`, `SH000002` |
| T15 | stock −25, price −5 | accepted | 400 |
| T16 | bulk-delete a sold variant | mismatched orders 12 → 20 | 12 → 12 (history untouched) |
| T17 | pay ₹1 for a ₹180 web order; duplicate callbacks | marked PAID, no bill no. | refused, stays DRAFT. Correct payment ×3 → PAID once, ONLINE, `26-27/000008`, stock −2 once |
| T18 | cashier purges the shop | **772 orders deleted** | cashier 403. Super admin needs typed confirmation, and all orders are kept |

---

## 1. Decisions

### Taken during the review
- [x] **[DECISION] Neon was never used for testing.** All runs used local copies restored from `neon-backup.dump`, a throwaway Redis container, and fake email and Paytm keys. All settings were passed inline. `.env` was never edited.
- [x] **[DECISION] Test users exist only in local DBs.**
- [x] **[DECISION] Destructive tests ran only on local copies**, which were rebuilt from the dump afterwards.

### Taken while fixing
- [x] **[DECISION] Money is `Decimal(12,2)`, quantities `Decimal(12,3)`, GST rates `Decimal(5,2)`.** A global interceptor (`common/decimal-to-number.interceptor.ts`) serialises Decimals as JSON numbers, so the dashboard and website API contract is unchanged.
- [x] **[DECISION] The server prices catalog lines.** If the POS sends a different price, the sale is **rejected with 409** rather than silently re-priced, so a printed receipt can never differ from the stored bill. Manual (custom) lines stay cashier-priced.
- [x] **[DECISION] The POS now prints totals, tax, CGST/SGST and the time from the server's response.**
- [x] **[DECISION] Bills are never deleted.** `DELETE /orders/:id` now **cancels** the bill (MANAGER+ only): it is marked CANCELLED with who, when and why, stock goes back, and the bill number stays in the series. There is also a new `POST /orders/:id/cancel {reason}`.
- [x] **[DECISION] Bill number format is `YY-YY/NNNNNN`**, e.g. `26-27/000042`, one series per shop per Indian FY in IST, unique on `(shopCode, billNo)`. Historic orders keep `billNo = NULL` (the UI already falls back to the old reference) because customers already hold receipts with those references.
- [x] **[DECISION] Every stock change goes through `applyStockChange`** (`common/stock.ts`). It is a conditional update that never goes below zero, and it writes a `StockMovement` ledger row. The migration seeds an opening balance per variant, so `quantity == SUM(delta)` always holds. The tests assert this.
- [x] **[DECISION] Paid website orders may push stock negative.** The customer has already paid, so a shortfall is something to fulfil rather than a reason to reject. These moves are recorded as `WEB_SALE`. POS sales and transfers can never go negative.
- [x] **[DECISION] Deleting a variant or product keeps sales.** `OrderItem` now stores a snapshot (`productName`, `variantName`, `barcode`, `hsnCode`, `taxRate`, `taxAmount`), and its links to the variant and product are set to NULL on delete. Hard deletes of catalog items are therefore safe, so I did not add soft-delete flags to every catalog query.
- [x] **[DECISION] GST is calculated per line.** `ProductVariant.taxRate` was added (null = shop CGST+SGST, so **existing behaviour is unchanged until you set rates per HSN**). The bill discount is split pro rata before tax. The GST report adds up the stored per-line tax and adds a `byRate` breakdown.
- [x] **[DECISION] Revenue means PAID only**, the same on the dashboard, revenue explorer, reports, export and GST summary. DRAFT, PENDING and CANCELLED are excluded.
- [x] **[DECISION] All days, months and FYs use IST** (`common/ist.ts`).
- [x] **[DECISION] Stock at 1,000,000 or more is clamped to 100,000 by the migration** (it cannot fit `Decimal(12,3)`). It affects 12 production variants (Samosa ≈1e16, Kaju Katli ≈1e12 …), and the old value is written into the opening ledger note.
- [x] **[DECISION] The catalog purge is SUPER_ADMIN only**, needs the shop code typed back, and never deletes orders. **A shop that has orders cannot be deleted.**
- [x] **[DECISION] A user with history is deactivated, not deleted.** Users with no history are still deleted.
- [x] **[DECISION] Only a SUPER_ADMIN may grant ADMIN or SUPER_ADMIN, move users between shops, or edit an admin.** Nobody can change their own role.
- [x] **[DECISION] Categories are shared, so only a SUPER_ADMIN can rename or delete them.** Purge, bulk delete and shop delete no longer sweep "empty" categories.
- [x] **[DECISION] Catalog sync opens new retail variants at 0 stock**, matches by barcode first, and runs one transaction per product. It **still copies factory prices onto matching retail items**, which is the existing "sync" behaviour, but now reports `pricesUpdated`.
- [x] **[DECISION] A transfer can still be fulfilled straight from PENDING** (one-click refill). The status claim is now atomic. Change it if approval should be mandatory.
- [x] **[DECISION] Export caps (10k orders / 50k lines) are kept** (B-28). The dashboard already warns when they are hit.
- [x] **[DECISION] The website order limiter is in memory** (20 orders / 10 min per IP, per instance). Move it to Redis if you scale out.
- [x] **[DECISION] `JWT_SECRET` is now required at boot** (≥32 characters in production). **Add it to `apps/api/.env` before `pnpm dev`** or the API will refuse to start.

---

## 2. Production data findings (`neon-backup.dump`, 2026-08-23)

| # | Finding | Status |
|---|---|---|
| D-1 | 12 of 763 orders: total ≠ Σ items − discount, ₹3,320 unreconciled (caused by B-06) | Root cause fixed. **The data itself still needs a manual fix**: rebuild the lines or annotate those orders |
| D-2 | **12** variants with padded stock ≥ 1,000,000 (up to ≈1e16), not 4 as first reported | Clamped to 100,000 by the migration and noted in the ledger. **Do a physical recount** |
| D-3 | Float noise in stock and tax | Fixed by Decimal; values rounded during migration |
| D-4 | Duplicate product names (`butter milk`, `MOONG DAL`) | Matching is by barcode now. **Merging the duplicates is still a manual job** |
| D-5 | 42 lines priced differently from today's catalog | Expected; lines now store a price snapshot |
| D-6 | `_prisma_migrations` has failed rows, so `migrate deploy` is blocked (P3009) | Resolved by the runbook (§4) |
| D-7 | Late-night orders bucketed into the wrong day | Fixed (IST) |
| D-8 | `billNo`, `transactionId`, `InvoiceSequence` missing | Fixed (migration) |

---

## 3. Bugs

### P0
- [x] **B-01 [FIXED] Schema with no migration (`billNo`, `transactionId`, `InvoiceSequence`).** Migration `20261017120000` adds them idempotently and backfills `transactionId`.
- [x] **B-02 [FIXED] POS oversell race.** Conditional decrement inside the transaction (`applyStockChange`). Tests: T1 / e2e.
- [x] **B-03 [FIXED] Same variant on two lines.** Quantities are summed per variant before the stock change.
- [x] **B-04 [FIXED] Client-set prices and negative totals.** Server-side pricing returns 409 on mismatch; discount ≤ gross; DTO bounds added.
- [x] **B-05 [FIXED] Payments for any amount.** `initiate` uses the stored total. The callback checks the Paytm status API (skippable only outside production) and requires the paid amount to equal the total. A conditional DRAFT→PAID flip means duplicate callbacks settle once. The bill number is assigned at payment; `ONLINE` is now in the enum.
- [x] **B-06 [FIXED] Bulk delete erased order lines.** It no longer touches order lines; snapshot plus SET NULL keeps history.
- [x] **B-07 [FIXED] A cashier could wipe all orders.** Purge is SUPER_ADMIN only, needs confirmation, and never deletes orders. Shop delete is refused when the shop has orders.
- [x] **B-08 [FIXED] Order delete.** Now a cancel (MANAGER+) that returns stock once and keeps the bill.
- [x] **B-09 [FIXED] Double fulfil.** The status claim is the first statement of the transaction; approve and reject are conditional too.

### P1
- [x] **B-10 [FIXED] Screens disagreed on revenue.** One `revenueWhere` (PAID) everywhere.
- [x] **B-11 [FIXED] UTC boundaries.** IST for days, months, FY and the GST month.
- [x] **B-12 [FIXED] Transfer gaps.** Decimal quantities (0.5 kg works); `GET /:id` is scoped to the two shops involved; only the addressed factory can act; matching uses the unique `(shopCode, barcode)`; factory stock is guarded; barcodes are checked against the factory at request time.
- [x] **B-13 [FIXED] Catalog sync.** No phantom stock; transaction per product; barcode-first match; price updates reported.
- [x] **B-14 [FIXED] Shop seeding.** The source must be a factory variant; stock moves through the ledger and is guarded.
- [x] **B-15 [FIXED] Manual stock edits.** `@Min(0)` and bounds; edits are applied as a ledgered delta with a note and user; `expectedQuantity` returns 409 if a sale happened in between. The dashboard now sends it.
- [x] **B-16 [FIXED] Website orders.** Validated DTO, 4xx errors, past pickup times rejected, per-line tax, only website-listed active items, rate limit.
- [x] **B-17 [FIXED] Customer overwrite.** Only fields that were filled in are updated; the upsert is inside the order transaction.
- [x] **B-18 [FIXED] Bill numbers.** FY-prefixed, unique per shop, gap-free (cancelled bills stay in the series).
- [x] **B-19 [FIXED] Product delete 500.** Cascade to variants and images; sales are kept.
- [x] **B-20 [FIXED] Shop codes and barcodes.** Counters (`InvoiceSequence` ids `SHOPCODE`, `BARCODE-<shop>`, seeded from existing data); barcode unique per shop in the DB; a global Prisma filter turns unique-constraint races into 409s instead of 500s.
- [x] **B-21 [FIXED] Float money.** Decimal plus half-up rounding; the POS prints server totals.
- [x] **B-22 [FIXED] GST per shop only.** Per-variant `taxRate` with per-line tax at sale time (see decision).
- [x] **B-23 [FIXED] No product snapshot on order lines.** Snapshot columns added and backfilled for history.
- [x] **B-24 [FIXED] Shared categories editable by any shop.** Rename and delete are SUPER_ADMIN only; no global sweeps.
- [x] **B-25 [FIXED] Role escalation.** Enforced on both update and create.
- [x] **B-26 [FIXED, and worse than reported] JWT secret.** `JwtModule.register` ran **before** `.env` was loaded, so with a `.env`-only setup **the hard-coded fallback `'change-me-in-production'` was always used**. It is now `registerAsync`, plus `validateEnv` that fails fast. A hand-written `src/nestjs-config.d.ts` stub was hiding the real `@nestjs/config` types; it has been removed. **Action: if production relied on `.env` for `JWT_SECRET`, rotate the secret. Every token issued so far could have been forged.**

### P2
- [x] **B-27 [FIXED]** Orders search by `billNo`.
- [x] **B-28 [DECISION]** Export caps kept (see §1).
- [x] **B-29 [FIXED]** Top-products `revenue` is net of discount and adds up to the totals; `grossRevenue` added.
- [x] **B-30 [FIXED]** `createMany` for lines; 20 s timeout on long transactions (`LONG_TX`).
- [x] **B-31 [DECISION]** The 15 s JWT user cache is kept; role and deactivation changes already invalidate it.
- [x] **B-32 [FIXED]** Transfer `createdBy`/`approvedBy` are real foreign keys; users with history are deactivated, not deleted.
- [x] **B-33 [FIXED]** `paymentMethod` is an enum (`CASH | UPI_CARD | ONLINE`); the dashboard shows "Online".
- [x] **B-34 [PARTLY FIXED]** `*.dump` and `*backup*.sql` are git-ignored. **`local_data_backup.sql` is already committed (since `e8dd29a`) and on GitHub.** Removing it needs `git rm --cached` plus a history rewrite (`git filter-repo`) if it contains real customer data. That's your call; I didn't touch history. I left the stray folder `node_modules 10.47.11 PM…/` alone.
- [x] **B-35 [FIXED]** The regression suite above.

### New findings while fixing
- [x] **B-36 [FIXED] The migration history couldn't build a database.** `RoleRequest`, `StockTransfer*`, shop GST and factory columns, `orderSource`, `pickupTime`, `customName`, `isListedOnWebsite`, `User.phone`, the `DRAFT` status and several indexes were only ever `db push`-ed. New idempotent migrations `20260418235900_backfill_untracked_tables` and `20261017110000_backfill_untracked_schema` fill the gaps; they are no-ops on production.
- [x] **B-37 [FIXED]** The orders list never returned `orderSource`/`pickupTime`, so website orders displayed as POS.
- [x] **B-38 [FIXED]** `auth.service.spec` and `auth.controller.spec` were already failing on `main` (missing `JwtService` provider).
- [x] **B-39 [FIXED]** The refill-request quantity input only accepted whole numbers.
- [ ] **Note:** `pg` logs a deprecation warning about overlapping queries. The trace shows it comes from Prisma's own query engine (`@prisma/client-engine-runtime`), not from this code. Upgrading Prisma later should clear it.

---

## 4. Production deploy runbook (rehearsed on a restore of the backup)

Production has failed rows in `_prisma_migrations`, and the Customer table was created outside migrations, so `migrate deploy` stops with P3009. Run these steps in order against production (by whoever owns the DB), **after taking a fresh backup**:

```bash
# 0. Backup first (pg_dump), and set JWT_SECRET (≥32 chars) in the API environment. Rotate it if it was only in .env.

# 1. Read-only checks: both must print 1
psql "$DATABASE_URL" -Atc "select count(*) from pg_indexes where indexname='ProductVariant_productId_barcode_key'"
psql "$DATABASE_URL" -Atc "select count(*) from information_schema.tables where table_name='Customer'"

# 2. Mark the two migrations whose objects already exist
pnpm --filter @fluxen/database exec prisma migrate resolve --applied 20260419180000_product_variant_barcode_per_product_unique
pnpm --filter @fluxen/database exec prisma migrate resolve --applied 20260507174000_add_customer_table

# 3. Apply: 2 idempotent backfills + the hardening migration
pnpm --filter @fluxen/database exec prisma migrate deploy

# 4. Verify zero drift
pnpm --filter @fluxen/database exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Deploy the API and dashboard together: the POS now expects the server's bill totals and sends `expectedQuantity`, and `DELETE /orders` means cancel. If the public website calls `POST /payment/initiate`, it no longer needs to send `amount` (it is ignored).

---

## 5. Still open (needs you)
- [ ] Choose whether to remove `local_data_backup.sql` from git history (B-34).
- [ ] Rotate `JWT_SECRET` if production read it from `.env` (B-26).
- [ ] Do a physical stock count for the 12 clamped variants (D-2) and the 4 duplicate product names (D-4).
- [ ] Repair or annotate the 12 historic orders with missing lines (D-1).
- [ ] Set `taxRate` on variants whose HSN code isn't charged at the shop's 5% (e.g. aerated drinks).
- [ ] Review and commit branch `fix/data-integrity`. Nothing has been committed or pushed.
