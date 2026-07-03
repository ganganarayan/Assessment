import { mentorGET } from "@/lib/api-data/mentor";

/** Canonical, versioned gita_mentor read. GET /api/v1/mentor?email= */
export const dynamic = "force-dynamic";
export const GET = mentorGET;
