# DEVELOPER NOTES

## What this is
A from-scratch rebuild of the legacy ASP.NET "Manage Orders" CRM (see the uploaded
Reverse-Architecture spec) on a modern stack, PLUS:
  1. Direct Shiprocket API integration (book/track/cancel/label/manifest/pickup/serviceability).
  2. Multi-user RBAC: one Super Admin creates users and grants per-user, per-module access.

## Legacy -> New mapping
- Legacy `/api/Filter?userid=1...` (userid in URL = security hole)  ->  `GET /api/orders` with JWT auth, server-side data scoping. No userid in URL.
- Hardcoded Sources  ->  DB-driven `Source` table (`/api/masters/sources`).
- 17 statuses kept (src/lib/statuses.ts).
- Full-page edit  ->  slide-in drawer (OrderDrawer), no reload.
- State -> District cascade: `/api/masters/states/:id/districts`.
- Order code format `PHCRM######` preserved (src/lib/excel.ts buildOrderCode).

## Shiprocket gotchas
- Auth token is valid ~10 days -> cached (Redis if REDIS_URL set, else in-memory). Do not log in per request.
- Send the STATE NAME (not id) in billing_state.
- payment_method: paymentStatus "Completed" => Prepaid, else COD.
- Recommended: call serviceability before booking (`/api/shiprocket/serviceability?delivery=PIN`).
- Never hardcode credentials - only `.env`.

## RBAC internals
- `User.role` (SUPER_ADMIN/MANAGER/AGENT/VIEWER) sets defaults via ROLE_PRESETS.
- `User.permissions` (JSON) holds the actual per-user map "module.action" -> bool.
- `can(user, key)` in src/lib/permissions.ts; SUPER_ADMIN always true.
- API routes call `requirePermission(req, "orders.edit")` etc. UI hides controls via `useAuth().can(...)`.
- Last active Super Admin cannot be deactivated/removed (safety).

## TODO for the developer (optional polish)
- Add bulk-select UI on the orders table (bulk-assign / bulk-status APIs already exist).
- Wire the Shiprocket webhook in the Shiprocket dashboard for auto status sync.
- Add full district master data (seed has a sample subset).
- Add refresh-token rotation if longer sessions are needed (currently 12h JWT).
- Optional: India Post pincode -> city autofill.

## Deployment (standalone)
- Needs Node 18+/20, a PostgreSQL database, and (optional) Redis.
- `npm ci && npx prisma migrate deploy && npm run db:seed && npm run build && npm start`
- Run behind nginx; default port 3000 (set PORT to change).
- The original Reverse-Architecture spec .docx (provided by the owner) is the functional reference.