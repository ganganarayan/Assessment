/**
 * Seed data for local development.
 *
 * Creates:
 *  - one platform SUPER_ADMIN (global, no tenant)
 *  - one demo Tenant ("acme") with a Theme, a custom Domain, and an ADMIN
 *
 * Passwords are hashed through Better Auth so seeded users can sign in.
 * Idempotent: safe to run multiple times.
 */
import { PrismaClient, Role, EventType } from "@prisma/client";
import { auth } from "../src/lib/auth/auth";
import { generateWebhookSecret } from "../src/lib/webhooks/sign";

const prisma = new PrismaClient();

const SUPER_ADMIN = {
  name: "Platform Owner",
  email: "owner@example.com",
  password: "ChangeMe123!",
};

const ADMIN = {
  name: "Acme Admin",
  email: "admin@acme.com",
  password: "ChangeMe123!",
};

async function createUserWithPassword(input: {
  name: string;
  email: string;
  password: string;
}) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) return existing;

  // Better Auth handles password hashing + account row creation.
  await auth.api.signUpEmail({
    body: {
      name: input.name,
      email: input.email,
      password: input.password,
    },
  });

  return prisma.user.findUniqueOrThrow({ where: { email: input.email } });
}

async function main() {
  // 1. Super admin (global, no tenant).
  const superAdmin = await createUserWithPassword(SUPER_ADMIN);
  await prisma.user.update({
    where: { id: superAdmin.id },
    data: { role: Role.SUPER_ADMIN, tenantId: null, emailVerified: true },
  });

  // 2. Demo tenant + theme + domain.
  const tenant = await prisma.tenant.upsert({
    where: { slug: "acme" },
    update: {},
    create: {
      slug: "acme",
      name: "Acme Corp",
      theme: {
        create: {
          primaryColor: "#4f46e5",
          secondaryColor: "#64748b",
        },
      },
      domains: {
        create: {
          hostname: "assess.acme.com",
          isPrimary: true,
          verified: true,
        },
      },
    },
  });

  // 3. Tenant admin (ADMIN) attached to the demo tenant.
  const admin = await createUserWithPassword(ADMIN);
  await prisma.user.update({
    where: { id: admin.id },
    data: {
      role: Role.ADMIN,
      tenantId: tenant.id,
      emailVerified: true,
    },
  });

  // 4. Platform settings + CRM webhook endpoint (assessment.completed).
  await prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
  if (process.env.CRM_WEBHOOK_URL) {
    await prisma.webhookEndpoint.upsert({
      where: { event: EventType.ASSESSMENT_COMPLETED },
      update: {},
      create: {
        event: EventType.ASSESSMENT_COMPLETED,
        url: process.env.CRM_WEBHOOK_URL,
        enabled: true,
        secret: generateWebhookSecret(),
      },
    });
  }

  console.log("Seed complete:");
  console.log(`  SUPER_ADMIN -> ${SUPER_ADMIN.email} / ${SUPER_ADMIN.password}`);
  console.log(`  ADMIN       -> ${ADMIN.email} / ${ADMIN.password}`);
  console.log(`  Tenant       -> acme (assess.acme.com)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
