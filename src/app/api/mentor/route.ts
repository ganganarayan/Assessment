import { mentorGET } from "@/lib/api-data/mentor";

/**
 * DEPRECATED unversioned alias — prefer /api/v1/mentor. Kept so any consumer
 * wired before versioning keeps working; delegates to the same handler.
 */
export const dynamic = "force-dynamic";
export const GET = mentorGET;
