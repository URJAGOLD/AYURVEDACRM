// CLEAN-PATH WEBHOOK — /api/delivery/notify
// Shiprocket blocks URLs containing "shiprocket", "kartrocket", "sr", "kr" keywords.
// This file is the production webhook endpoint. It re-uses Phase 1 handler logic directly.
// Register in Shiprocket: https://prakritiherbs.in/crm/api/delivery/notify
// Header: x-api-key: <SHIPROCKET_WEBHOOK_TOKEN>
import { POST as handleWebhook, GET as handleGet } from "@/app/api/shiprocket/webhook/route";
export { handleWebhook as POST, handleGet as GET };
export const runtime = "nodejs";