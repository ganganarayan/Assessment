import { auth } from "@/lib/auth/auth";
import { toNextJsHandler } from "better-auth/next-js";

/** Catch-all Better Auth endpoint: /api/auth/* */
export const { GET, POST } = toNextJsHandler(auth.handler);
