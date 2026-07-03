import { metaMatchGET } from "@/lib/api-data/meta-match";

/**
 * DEPRECATED unversioned alias — prefer /api/v1/meta-match. Kept so any consumer
 * wired before versioning keeps working; delegates to the same handler.
 */
export const dynamic = "force-dynamic";
export const GET = metaMatchGET;
