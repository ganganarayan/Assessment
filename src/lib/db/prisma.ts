import { PrismaClient, Role, Prisma } from "@prisma/client";
import { isPlatformOwner, PLATFORM_OWNER_EMAIL } from "@/lib/auth/platform";

/**
 * Single shared PrismaClient instance.
 * In dev, Next.js hot-reload would otherwise create a new client per reload
 * and exhaust the connection pool, so we cache it on globalThis.
 *
 * The client is extended with a hard backstop that refuses to DEMOTE the
 * platform owner — i.e. any write that would set the owner's role to something
 * other than SUPER_ADMIN, or attach a non-null tenantId to the owner. This is
 * defence-in-depth: the individual Server Actions guard this too, but a single
 * DB-layer rule means no current or future code path can silently demote the
 * owner (the incident that locked us out once). Promotions (role → SUPER_ADMIN,
 * tenantId → null) are always allowed, so break-glass recovery still works.
 */

export const OWNER_PROTECTED_MSG =
  "Refusing to write the platform owner down to a tenant admin (role/tenant is protected).";

/** Read a Prisma scalar-or-{set} field: was it written, and to what value. */
function writtenField(
  data: Record<string, unknown>,
  key: string,
): { written: boolean; value: unknown } {
  if (!(key in data)) return { written: false, value: undefined };
  const raw = data[key];
  if (raw && typeof raw === "object" && "set" in (raw as Record<string, unknown>)) {
    return { written: true, value: (raw as Record<string, unknown>).set };
  }
  return { written: true, value: raw };
}

/** True when this data payload would demote a user (role↓ or tenantId set non-null). */
function isDemotion(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const role = writtenField(d, "role");
  const tenant = writtenField(d, "tenantId");
  const roleDown = role.written && role.value !== Role.SUPER_ADMIN;
  const tenantAttached = tenant.written && tenant.value !== null && tenant.value !== undefined;
  return roleDown || tenantAttached;
}

function createPrismaClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

  return base.$extends({
    name: "protect-platform-owner",
    query: {
      user: {
        async update({ args, query }) {
          if (isDemotion(args.data)) {
            // Look up on the UN-extended client (no recursion) — only runs on the
            // rare write that actually touches role/tenantId. Fail open on error.
            const t = await base.user
              .findFirst({ where: args.where, select: { email: true } })
              .catch(() => null);
            if (t && isPlatformOwner(t.email)) throw new Error(OWNER_PROTECTED_MSG);
          }
          return query(args);
        },
        async upsert({ args, query }) {
          if (isDemotion(args.update)) {
            const t = await base.user
              .findFirst({ where: args.where, select: { email: true } })
              .catch(() => null);
            if (t && isPlatformOwner(t.email)) throw new Error(OWNER_PROTECTED_MSG);
          }
          return query(args);
        },
        async updateMany({ args, query }) {
          if (isDemotion(args.data)) {
            const owner = await base.user
              .findFirst({
                where: {
                  AND: [
                    (args.where ?? {}) as Prisma.UserWhereInput,
                    { email: { equals: PLATFORM_OWNER_EMAIL, mode: "insensitive" } },
                  ],
                },
                select: { id: true },
              })
              .catch(() => null);
            if (owner) throw new Error(OWNER_PROTECTED_MSG);
          }
          return query(args);
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
