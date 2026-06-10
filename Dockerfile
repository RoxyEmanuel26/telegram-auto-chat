# Base image
FROM node:20-alpine AS base

# Install openssl and libc6-compat for Prisma compatibility
RUN apk add --no-cache openssl libc6-compat wget

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package configurations
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

# Install dependencies (frozen-lockfile ensures reproducible builds)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server

# Build the shared library first
RUN pnpm --filter shared build

# Generate Prisma Client
WORKDIR /app/apps/server
RUN pnpm prisma generate

# Build the server application
RUN pnpm build

# Pre-create uploads directory for avatar caching with correct ownership
RUN mkdir -p /app/apps/server/uploads/avatars && chown -R node:node /app/apps/server/uploads

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=7860
ENV NODE_OPTIONS="--dns-result-order=ipv4first"

# Switch to non-root user for security
USER node

EXPOSE 7860

# Health check: verify the server is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:7860/api/health || exit 1

# Run database migrations and start the server
CMD ["sh", "-c", "pnpm exec prisma db push --accept-data-loss && pnpm start"]
