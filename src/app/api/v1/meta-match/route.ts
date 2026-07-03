import { metaMatchGET } from "@/lib/api-data/meta-match";

/** Canonical, versioned meta_match lookup. GET /api/v1/meta-match?email=&phone= */
export const dynamic = "force-dynamic";
export const GET = metaMatchGET;
