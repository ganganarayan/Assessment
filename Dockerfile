# ---- Dependencies ----------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# ---- Builder ---------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# Build-time variables.
# Railway exposes service variables to a Dockerfile build only via ARG (they are
# NOT auto-injected into RUN steps). NEXT_PUBLIC_* must be present so Next.js can
# inline them into the client bundle; the server vars are touched because env.ts
# validates at module load (the auth route imports it during build).
# These live ONLY in this builder stage, which is discarded in the final image —
# so no secrets are baked into the runtime image.
ARG NEXT_PUBLIC_ROOT_DOMAIN
ARG NEXT_PUBLIC_APP_URL
ARG DATABASE_URL
ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_URL
ARG ALLOWED_ORIGINS
ENV NEXT_PUBLIC_ROOT_DOMAIN=$NEXT_PUBLIC_ROOT_DOMAIN \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    DATABASE_URL=$DATABASE_URL \
    BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET \
    BETTER_AUTH_URL=$BETTER_AUTH_URL \
    ALLOWED_ORIGINS=$ALLOWED_ORIGINS

RUN npx prisma generate && npm run build

# ---- Runner ----------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache openssl \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Next.js standalone output + static assets.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma schema (for migrate deploy) + full node_modules so the Prisma CLI's
# transitive deps (e.g. @prisma/config -> effect) and externalized packages
# resolve at runtime. The standalone tracer only includes app-bundle imports,
# not the migrate CLI tree, so cherry-picking is insufficient.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
