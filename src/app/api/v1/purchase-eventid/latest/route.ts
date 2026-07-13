import { purchaseEventIdGET, purchaseEventIdOPTIONS } from "@/lib/api-data/purchase-eventid";

/** Public browser↔server Meta dedup lookup. GET /api/v1/purchase-eventid/latest?window=&min=&max= */
export const dynamic = "force-dynamic";
export const GET = purchaseEventIdGET;
export const OPTIONS = purchaseEventIdOPTIONS;
