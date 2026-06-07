"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Client-side Better Auth hooks/helpers for React components.
 *
 * No absolute `baseURL` is set on purpose: the client must call auth endpoints
 * SAME-ORIGIN. The /api/auth/[...all] route exists on every host (platform,
 * tenant subdomains, and custom domains), so same-origin requests land the
 * session cookie on the host the user is actually on. Pinning baseURL to a
 * single origin would scope the cookie to the wrong host on tenant/custom
 * domains and break sign-in there. Also keeps server-only `env` out of the
 * client bundle.
 */
export const authClient = createAuthClient();

export const { signIn, signOut, signUp, useSession } = authClient;
