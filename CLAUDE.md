# Fluxen POS - Developer Context Guide

This document provides comprehensive details about the Fluxen POS Inventory & Shop Management project, our architectural decisions, coding standards, preferences, and product capabilities. It serves as the ultimate context guide for writing optimal code in this repository.

## 1. Project Overview
Fluxen POS is a full-stack, multi-tenant(ish) inventory, point-of-sale (POS), and shop management system. It supports managing multiple shops, processing POS orders, handling inventory/stock transfers, and visualizing sales data. 

**Core Tech Stack:**
- **Monorepo:** Turborepo + pnpm workspaces
- **Frontend:** Next.js 16, React 19, Tailwind CSS 4
- **Backend:** NestJS 11, Node.js, Express
- **Database:** PostgreSQL with Prisma 7 ORM (using `@prisma/adapter-pg`)
- **Language:** TypeScript 5.x throughout

## 2. Architecture Decisions
### 2.1 Monorepo Setup
We use `pnpm workspaces` and `Turborepo` to manage dependencies and build steps efficiently. 
- `apps/api`: NestJS REST API backend.
- `apps/dashboard`: Next.js frontend application.
- `packages/database`: Shared Prisma schema, migrations, and database client.
- `packages/types`: Shared TypeScript definitions and interfaces.

### 2.2 Backend (NestJS API)
- **Framework:** NestJS 11 running on Express.
- **Validation:** `class-validator` and `class-transformer` for DTO validation.
- **Authentication:** JWT-based authentication (`@nestjs/jwt`, `bcrypt`).
- **Payments/Integrations:** PaytmChecksum (for Indian payment gateways) and Resend (for emails).
- **Caching/Queue:** `ioredis` is installed, suggesting Redis usage for caching or background queues.
- **Structure:** Standard NestJS module/controller/service architecture. 

### 2.3 Frontend (Next.js Dashboard)
- **Framework:** Next.js 16 (App Router paradigm).
- **Styling:** Tailwind CSS 4, alongside UI component libraries.
- **UI Components & Tooling:** 
  - `antd` (Ant Design) for complex UI elements.
  - `lucide-react` for iconography.
  - A custom `DataTable` (`apps/dashboard/src/components/DataTable`) for all data grids: sticky header, local or remote pagination, infinite scroll, skeleton loading. No third-party grid library.
  - `recharts` for analytics and data visualization.
- **Utility/Export:**
  - `exceljs`, `jspdf`, `jspdf-autotable` for robust reporting and data exports.
  - `jsbarcode` & `react-barcode` for generating physical product barcodes and POS labels.

### 2.4 Database (Prisma + PostgreSQL)
- **Schema:** A single PostgreSQL database.
- **Prisma:** Using Prisma 7 with the pg adapter (`@prisma/adapter-pg`) for modern pooling/performance.
- **Multi-Shop Strategy:** Entities like `User`, `Product`, `Order`, `Customer`, and `RoleRequest` are tied to a `shopCode`, ensuring data is segregated functionally per shop (or factory).

## 3. Product Capabilities & Features
1. **Multi-Shop & Factory Management:** Shops are distinguished by `shopCode`. A shop can be flagged as a factory (`isFactory: true`). Supports different GST rates per shop and UPI configurations.
2. **Role-Based Access Control (RBAC):** Users have roles (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `CASHIER`, `STAFF`). Granular `permissionOverrides` JSON for extending defaults. A robust `RoleRequest` workflow allows staff to request role changes or permission extensions.
3. **Product & Inventory Management:** 
   - Products belong to Categories.
   - Products have multiple `ProductVariant`s (e.g., 200g, 1kg), each with unique `barcode`, `sku`, `price`, `costPrice`, `hsnCode`, and stock `quantity`.
4. **Point of Sale (POS) & Ordering:**
   - Orders track `totalAmount`, `discount`, `tax`, and `paymentMethod` (CASH / UPI_CARD).
   - Orders can originate from `POS` or `WEBSITE`.
   - Items track both underlying inventory quantity and POS label quantity.
5. **Stock Transfers:** A formal `StockTransferRequest` workflow (`PENDING`, `APPROVED`, `FULFILLED`) to move stock securely between shops/factories.
6. **Customer CRM:** Tracks customer details, purchase history (`notes`, `gstin`), unique by phone per shop.

## 4. Coding Standards & Preferences

### General
- **TypeScript Strictness:** Strict typing is enforced. Avoid `any`; use shared types from `packages/types` where possible.
- **Formatting:** Prettier is the standard formatter (`.prettierrc`).
- **Linting:** ESLint flat config (`eslint.config.mjs`) is used across the monorepo.

### Backend (NestJS)
- Use explicit DTOs for requests/responses.
- Utilize NestJS Dependency Injection fully.
- Environment variables must be validated.
- Tests should be written using Jest (unit/e2e specs).
- Do not write raw SQL unless absolutely necessary; use Prisma Client. Include relations (`include`) prudently to avoid over-fetching.

### Frontend (Next.js)
- Favor Server Components where appropriate to minimize client JavaScript.
- Client components (`"use client"`) should be pushed down the component tree as far as possible.
- Use Tailwind CSS for utility styling.
- For data tables, use the shared `DataTable` component (do not add Tabulator or another grid library). For charts, use Recharts.
- Ensure all API calls handle loading and error states gracefully.

## 5. Development Workflow Context
- **Run Everything:** `pnpm dev` from the root spins up the API and Dashboard concurrently using Turborepo.
- **Database Commands:** Must be run via filter: `pnpm --filter @fluxen/database exec prisma [command]`.
- **Ports:** API and Dashboard might both try to use port `3000` by default; usually, Turborepo or Next.js handles port incrementing, but prefer setting explicit ports in `.env`.

When writing code for this project, always consider the multi-shop nature (always filter or associate by `shopCode`), respect the role-based access control, and maintain the clean separation between the frontend dashboard and the backend API.
