# Prakriti Herbs CRM - Manage Orders + Shiprocket + Multi-User RBAC

Production-ready CRM. Real working engine (DB-backed), NOT a UI mockup.

- **Stack:** Next.js 14 (App Router) + TypeScript + Prisma + PostgreSQL + JWT RBAC
- **Shipping:** Shiprocket REST API (book order, AWB, pickup, label, manifest, track, cancel, serviceability)
- **Multi-user:** ONE Super Admin creates users and grants each one granular per-module access. Every user logs in with their own email/password and sees only what they are allowed.

## Setup
1. `npm install`
2. `cp .env.example .env` and fill REAL values (DB, JWT secret, Shiprocket creds).
3. `npx prisma migrate dev` (or `npx prisma migrate deploy` in production) - creates tables.
4. `npm run db:seed` - seeds Indian states, sample districts, sources, dealers, demo orders, and the SUPER ADMIN (from .env SUPERADMIN_*).
5. `npm run dev` -> http://localhost:3000  (production: `npm run build && npm start`)

First login = SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD from `.env`.

## Multi-user access model (exactly as required)
- The seeded **SUPER_ADMIN** logs in and opens **Users & Access**.
- Clicks **+ New User**, enters name/email/password, picks a **Role** (sets sensible defaults), then ticks/unticks individual **module permissions** (Orders view/create/edit/delete/export/import/assign/status, Shiprocket book/track/cancel/label/pickup, Masters, Users, Reports).
- Each created user logs in with their own credentials and the UI + APIs show only what they are permitted.
- **Data scoping:** a user WITHOUT `orders.viewAll` sees only orders assigned to them (`leadOwnerId = self`). With it, they see all orders. Super Admin always sees everything.

## Shiprocket setup
- Shiprocket dashboard -> Settings -> API -> create an API user.
- Put that email/password in `.env` (SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD).
- Set SHIPROCKET_PICKUP_LOCATION to your registered pickup nickname.
- (Optional) Register webhook URL `https://yourdomain/api/shiprocket/webhook` and set SHIPROCKET_WEBHOOK_TOKEN to auto-sync shipping status.
- One-click booking: in Orders, press **Book** on a row -> creates Shiprocket order + AWB, stores AWB/courier on the order, sets status to "In Transit".

## Excel
- **Export:** Orders page -> Export (honours current filters).
- **Import (Bulk Upload):** columns `CustomerName, ContactNumber, ProductName, Quantity, Price, Address, City, State, District, Pincode, Source, PaymentStatus, Remark`. Per-row validation + error report.

## Key folders
- `prisma/schema.prisma` - DB (User+RBAC, Order+Shiprocket fields, masters, audit)
- `src/lib/shiprocket.ts` - Shiprocket service
- `src/lib/permissions.ts` - RBAC catalog + role presets + can()
- `src/app/api/**` - all API routes (auth, users, orders, shiprocket, masters)
- `src/app/(dashboard)/**` - Orders + Users & Access screens