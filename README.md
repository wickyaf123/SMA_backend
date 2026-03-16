# James Outbound Backend

Production-grade outbound automation system for contractor outreach.

## Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your API keys

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Start development server
npm run dev
```

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL) + Prisma
- **Cache**: Upstash Redis

## Scripts

```bash
npm run dev          # Development server
npm run build        # Build for production
npm start            # Production server
npm test             # Run tests
npm run prisma:studio # Database GUI
```

## API Base URL

```
http://localhost:3000/api/v1
```

All endpoints require `x-api-key` header.

## Documentation

See **[COMPLETE_PROJECT_DOCUMENTATION.md](../COMPLETE_PROJECT_DOCUMENTATION.md)** in the project root for:

- Full database schema
- All API endpoints
- Integration details
- Cron job schedules
- Environment variables
- Webhook setup

## Project Structure

```
src/
├── config/         # Configuration
├── integrations/   # External API clients
├── services/       # Business logic
├── controllers/    # Route handlers
├── routes/         # Express routes
├── jobs/           # Cron jobs
├── middleware/     # Auth, errors
└── utils/          # Helpers
```

## License

ISC


