# Base image
FROM node:20-alpine AS base

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

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=7860

EXPOSE 7860

# Run database migrations and start the server
CMD ["sh", "-c", "pnpm exec prisma db push --accept-data-loss && pnpm start"]
