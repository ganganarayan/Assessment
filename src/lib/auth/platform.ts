/**
 * Platform-owner identification (MVP).
 *
 * For MVP we treat a single configured email as the platform owner / super
 * admin, instead of relying on the DB `role`. Centralised here so the check
 * lives in ONE place and the owner email can be overridden via env rather than
 * hardcoded in components.
 */
export const PLATFORM_OWNER_EMAIL = (
  process.env.PLATFORM_OWNER_EMAIL ?? "ganganarayan.rns@gmail.com"
).toLowerCase();

/** True when the given email is the platform owner (super admin). */
export function isPlatformOwner(email?: string | null): boolean {
  return !!email && email.toLowerCase() === PLATFORM_OWNER_EMAIL;
}
