# TeleHub — Telegram Broadcast Command Center

> **One Dashboard, Unlimited Reach**

A full-stack web application for managing, scheduling, and distributing content across multiple Telegram channels and groups.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| **Backend** | Express.js, TypeScript, Prisma ORM |
| **Database** | PostgreSQL (NeonDB) |
| **Queue** | BullMQ + Redis (Upstash) |
| **Auth** | JWT + bcrypt + TOTP (2FA) |
| **Encryption** | AES-256-GCM (bot tokens) |

## Features

- 🤖 Multi-bot management with encrypted token storage
- 📢 Multi-channel broadcasting with delivery tracking
- 📝 Rich text composer with live Telegram preview
- ⏰ Scheduled & recurring posts (cron expressions)
- 📊 Analytics dashboard with delivery metrics
- 📋 Template library with variable placeholders
- 📥 CSV bulk import wizard
- 🔔 Real-time notifications
- 🔗 Outgoing webhooks with HMAC-SHA256 signatures
- 👥 User management with RBAC (Admin/Editor/Viewer)
- 📜 Audit logging
- 📱 PWA-ready

## Project Structure

```
telehub-monorepo/
├── apps/
│   ├── server/          # Express.js API server
│   │   ├── prisma/      # Database schema & migrations
│   │   └── src/
│   │       ├── middleware/
│   │       ├── routes/
│   │       ├── services/
│   │       └── utils/
│   └── web/             # Next.js frontend
│       ├── app/         # App Router pages
│       ├── components/
│       ├── lib/
│       └── stores/
├── packages/
│   └── shared/          # Shared types & Zod schemas
├── docker-compose.yml
└── package.json
```

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm >= 9
- PostgreSQL 16+ (or NeonDB)
- Redis 7+ (or Upstash Redis)

### Setup

```bash
# Clone the repository
git clone https://github.com/RoxyEmanuel26/telegram-auto-chat.git
cd telegram-auto-chat

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Generate cryptographic secrets
pnpm gen:secrets
# Copy the output into your .env file

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

The web app runs at `http://localhost:3000` and the API server at `http://localhost:5000`.

### Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start all services in development mode |
| `pnpm build` | Build all packages for production |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm lint` | Run ESLint |
| `pnpm gen:secrets` | Generate JWT and encryption secrets |
| `pnpm db:migrate` | Run Prisma database migrations |
| `pnpm db:seed` | Seed the database with initial data |
| `pnpm clean` | Clean build artifacts |

## Environment Variables

See [`.env.example`](.env.example) for all required configuration. Key variables:

- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — JWT signing keys
- `ENCRYPTION_KEY` — AES-256-GCM key for bot token encryption

## Docker

```bash
# Start PostgreSQL and Redis locally
docker compose up -d
```

## License

MIT
