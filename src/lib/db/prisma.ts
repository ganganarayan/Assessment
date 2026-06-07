import { PrismaClient } from "@prisma/client";

/**
 * Single shared PrismaClient instance.
 * In dev, Next.js hot-reload would otherwise create a new client per reload
 * and exhaust the connection pool, so we cache it on globalThis.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
