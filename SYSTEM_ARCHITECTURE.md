# End-to-End System Architecture Specification

**Project:** Outbound Automation System  
**Version:** 1.0.0  
**Last Updated:** January 2026  
**Purpose:** Comprehensive technical blueprint for building production-grade outbound automation systems

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture Layers](#3-architecture-layers)
4. [Database Architecture](#4-database-architecture)
5. [API Architecture](#5-api-architecture)
6. [Integration Architecture](#6-integration-architecture)
7. [Background Processing](#7-background-processing)
8. [Real-Time Communication](#8-real-time-communication)
9. [Security Architecture](#9-security-architecture)
10. [Error Handling & Monitoring](#10-error-handling--monitoring)
11. [Deployment Architecture](#11-deployment-architecture)
12. [Code Organization](#12-code-organization)
13. [Data Flow Patterns](#13-data-flow-patterns)
14. [Scalability Strategy](#14-scalability-strategy)
15. [Implementation Guide](#15-implementation-guide)

---

## 1. System Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                            FRONTEND (React)                          │
│                     Vite + TypeScript + TailwindCSS                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ REST API + WebSocket
┌──────────────────────────────┴──────────────────────────────────────┐
│                        API LAYER (Express.js)                        │
│  ┌──────────────┬──────────────┬──────────────┬──────────────────┐ │
│  │ Routes       │ Controllers  │ Middleware   │ Validators       │ │
│  │ Auth, CORS   │ Business     │ Rate Limit   │ Zod Schemas      │ │
│  └──────────────┴──────────────┴──────────────┴──────────────────┘ │
└──────────────────────────────┬──────────────────────────────────────┘
┌──────────────────────────────┴──────────────────────────────────────┐
│                       SERVICE LAYER (TypeScript)                     │
│  ┌────────────┬──────────────┬──────────────┬───────────────────┐  │
│  │ Contact    │ Campaign     │ Outreach     │ Validation        │  │
│  │ Company    │ Enrollment   │ Reply        │ Enrichment        │  │
│  │ Merger     │ Routing      │ Activity     │ Settings          │  │
│  └────────────┴──────────────┴──────────────┴───────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────┘
┌──────────────────────────────┴──────────────────────────────────────┐
│                    INTEGRATION LAYER (Clients)                       │
│  ┌──────┬──────────┬──────┬────────┬────────┬──────────┬─────────┐ │
│  │Apollo│ Instantly│Twilio│Hunter  │ Apify  │ GHL      │ Phantom │ │
│  └──────┴──────────┴──────┴────────┴────────┴──────────┴─────────┘ │
└──────────────────────────────┬──────────────────────────────────────┘
┌──────────────────────────────┴──────────────────────────────────────┐
│                    BACKGROUND JOB PROCESSING                         │
│  ┌────────────────┬──────────────────┬───────────────────────────┐ │
│  │ Scheduler      │ Queue System     │ Workers                   │ │
│  │ (node-cron)    │ (BullMQ)         │ (Lead, Scraper, Campaign) │ │
│  └────────────────┴──────────────────┴───────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────────┘
┌──────────────────────────────┴──────────────────────────────────────┐
│                       DATA & CACHE LAYER                             │
│  ┌─────────────────────────────┬───────────────────────────────┐   │
│  │ PostgreSQL (Supabase)       │ Redis (Upstash)               │   │
│  │ - Prisma ORM                │ - Queue Storage               │   │
│  │ - Connection Pooling        │ - Rate Limiting               │   │
│  │ - Migrations                │ - Session Storage             │   │
│  └─────────────────────────────┴───────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Core Responsibilities

| Layer | Responsibility | Key Technologies |
|-------|----------------|------------------|
| **Presentation** | User interface, data display | React, TypeScript, Vite |
| **API** | Request routing, validation, auth | Express, Zod, JWT |
| **Business Logic** | Core operations, workflows | TypeScript Services |
| **Integration** | External API communication | Axios, HTTP clients |
| **Data Persistence** | Database operations | Prisma, PostgreSQL |
| **Caching** | Performance optimization | Redis, IORedis |
| **Background Jobs** | Async processing | BullMQ, node-cron |
| **Real-Time** | Live updates | Socket.IO |

---

## 2. Technology Stack

### 2.1 Core Technologies

```typescript
// Backend Stack
const stack = {
  runtime: "Node.js 20+",
  language: "TypeScript 5.3+",
  framework: "Express.js 4.18",
  
  database: {
    primary: "PostgreSQL (Supabase)",
    orm: "Prisma 5.7",
    migrations: "Prisma Migrate"
  },
  
  cache: {
    store: "Redis (Upstash)",
    client: "IORedis 5.3"
  },
  
  queueing: {
    system: "BullMQ 4.15",
    scheduler: "node-cron 4.2"
  },
  
  realtime: {
    protocol: "WebSocket",
    library: "Socket.IO 4.8"
  },
  
  validation: {
    schema: "Zod 3.22",
    runtime: "TypeScript"
  },
  
  logging: {
    logger: "Pino 8.17",
    pretty: "pino-pretty 10.3"
  },
  
  monitoring: {
    errors: "Sentry",
    apm: "Built-in metrics"
  },
  
  security: {
    helmet: "Helmet 7.1",
    cors: "CORS 2.8",
    rateLimit: "express-rate-limit 7.1"
  }
};
```

### 2.2 External Integrations

| Service | Purpose | API Type | Rate Limits |
|---------|---------|----------|-------------|
| **Apollo.io** | B2B lead scraping, enrichment | REST | 2000 credits/month |
| **Instantly** | Email campaigns, tracking | REST | 100/hour |
| **Twilio** | SMS sending, phone validation | REST | 50/hour |
| **NeverBounce** | Email validation | REST | Per credit |
| **Hunter.io** | Email finding, verification | REST | 50/month (free) |
| **Apify** | Google Maps scraping | REST | Per actor run |
| **GoHighLevel** | CRM, SMS, unified inbox | REST | 100/hour |
| **PhantomBuster** | LinkedIn automation | REST | Per agent |

### 2.3 Development Tools

```json
{
  "buildSystem": "TypeScript Compiler (tsc)",
  "devServer": "tsx watch",
  "testing": "Vitest + Supertest",
  "linting": "ESLint + Prettier",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "worker": "tsx src/jobs/worker.ts",
    "test": "vitest",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio"
  }
}
```

---

## 3. Architecture Layers

### 3.1 Request Flow

```
HTTP Request → Middleware Chain → Router → Controller → Service → Integration/DB → Response
```

#### Detailed Flow

```typescript
// 1. ENTRY POINT (src/index.ts)
async function startServer() {
  await connectDatabase();
  await checkRedisHealth();
  const app = createApp();
  const httpServer = createServer(app);
  initializeWebSocket(httpServer);
  await initializeWorkers();
  await initializeScheduler();
  httpServer.listen(port);
}

// 2. APP CREATION (src/app.ts)
function createApp() {
  app.use(helmet());              // Security headers
  app.use(cors());                // CORS policy
  app.use(requestIdMiddleware);   // Tracing
  app.use(express.json());        // Body parser
  app.use(requestLogger);         // Logging
  app.use(globalRateLimiter);     // Rate limiting
  app.use('/', routes);           // Route mounting
  app.use(errorHandler);          // Error handling
}

// 3. ROUTE LAYER (src/routes/index.ts)
router.use('/contacts', authenticateApiKey, contactRoutes);
router.use('/campaigns', authenticateApiKey, campaignRoutes);
router.use('/api/v1/webhooks', webhookRoutes);

// 4. CONTROLLER LAYER (src/controllers/*.ts)
export const createContact = asyncHandler(async (req, res) => {
  const validated = createContactSchema.parse(req.body);
  const contact = await contactService.createContact(validated);
  res.json({ success: true, data: contact });
});

// 5. SERVICE LAYER (src/services/*/*.ts)
class ContactService {
  async createContact(data) {
    const contact = await prisma.contact.create({ data });
    await leadProcessingQueue.add('validate', { contactId: contact.id });
    return contact;
  }
}

// 6. INTEGRATION LAYER (src/integrations/*/client.ts)
class ApolloClient {
  async enrichContact(email: string) {
    return await this.request('/people/match', { email });
  }
}
```

### 3.2 Middleware Stack

```typescript
// Order matters! Middleware executes top-to-bottom
const middlewareChain = [
  helmet(),                    // Security headers (XSS, clickjacking)
  cors(),                      // Cross-origin requests
  requestIdMiddleware,         // Add x-request-id
  express.json(),              // Parse JSON bodies
  compression(),               // Gzip compression
  requestLogger,               // Log requests (Pino)
  globalRateLimiter,          // 100 req/15min per IP
  authenticateApiKey,         // API key validation (protected routes)
  routes,                     // Application routes
  notFoundHandler,            // 404 handler
  errorHandler                // Global error handler (must be last)
];
```

---

## 4. Database Architecture

### 4.1 Schema Design Principles

1. **Normalization**: Separate entities (Contact, Company, Campaign)
2. **Audit Trail**: createdAt, updatedAt on all models
3. **Soft Relationships**: Use SetNull for deletions to preserve history
4. **Indexing**: Strategic indexes on frequently queried fields
5. **Enums**: TypeScript enums for type safety
6. **JSON Fields**: Flexible metadata storage

### 4.2 Core Data Models

```prisma
// Contact (Central Entity)
model Contact {
  id                    String   @id @default(uuid())
  email                 String   @unique
  firstName             String?
  lastName              String?
  phone                 String?
  
  // Company relationship
  companyId             String?
  company               Company? @relation(...)
  
  // Status tracking
  status                ContactStatus         @default(NEW)
  emailValidationStatus EmailValidationStatus @default(PENDING)
  phoneValidationStatus PhoneValidationStatus @default(PENDING)
  
  // External IDs (integration mapping)
  apolloId              String?  @unique
  ghlContactId          String?  @unique
  googlePlaceId         String?  @unique
  
  // Reply tracking
  hasReplied            Boolean  @default(false)
  repliedAt             DateTime?
  repliedChannel        OutreachChannel?
  
  // Flexible data
  tags                  String[]
  customFields          Json?
  enrichmentData        Json?
  
  // Relationships
  outreachSteps         OutreachStep[]
  campaignEnrollments   CampaignEnrollment[]
  replies               Reply[]
  
  @@index([email, status, companyId, hasReplied])
}

// Campaign (Outreach Configuration)
model Campaign {
  id                    String         @id @default(uuid())
  name                  String
  channel               OutreachChannel
  status                CampaignStatus @default(DRAFT)
  
  // External platform IDs
  instantlyCampaignId   String?
  phantomBusterId       String?
  googleSheetUrl        String?
  
  // Settings
  linkedinEnabled       Boolean        @default(true)
  settings              Json?
  
  // Relationships
  enrollments           CampaignEnrollment[]
  routingRules          CampaignRoutingRule[]
}

// Campaign Routing (Dynamic Lead Distribution)
model CampaignRoutingRule {
  id                  String   @id @default(uuid())
  name                String
  priority            Int      @default(0)  // Higher = first
  isActive            Boolean  @default(true)
  matchMode           String   @default("ALL")  // ALL or ANY
  
  // Filters (arrays for flexibility)
  sourceFilter        String[] @default([])
  industryFilter      String[] @default([])
  stateFilter         String[] @default([])
  tagsFilter          String[] @default([])
  
  campaignId          String
  campaign            Campaign @relation(...)
}

// Settings (Global Configuration)
model Settings {
  id                        String  @id @default(uuid())
  
  // Feature toggles
  linkedinGloballyEnabled   Boolean @default(true)
  pipelineEnabled           Boolean @default(true)
  schedulerEnabled          Boolean @default(true)
  
  // Default campaigns for auto-enrollment
  defaultEmailCampaignId    String?
  defaultSmsCampaignId      String?
  
  // Job-specific toggles
  scrapeJobEnabled          Boolean @default(true)
  apolloJobEnabled          Boolean @default(true)
  enrichJobEnabled          Boolean @default(true)
  mergeJobEnabled           Boolean @default(true)
  validateJobEnabled        Boolean @default(true)
  enrollJobEnabled          Boolean @default(true)
  
  // Cron schedules (database-configurable)
  scrapeJobCron             String? @default("0 6 * * *")
  apolloJobCron             String? @default("30 6 * * *")
  enrichJobCron             String? @default("0 8 * * *")
  
  // Scraper configurations
  apifyQuery                String? @default("HVAC companies")
  apolloIndustry            String? @default("HVAC")
  apolloPersonTitles        String[]
}
```

### 4.3 Database Connections

```typescript
// Prisma Client Configuration
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['error', 'warn'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,  // Pooler (port 6543)
    },
  },
});

// Connection Management
export async function connectDatabase() {
  await prisma.$connect();
  logger.info('✓ Database connected');
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}

// Transaction Pattern
async function complexOperation() {
  return await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.create({ data });
    const enrollment = await tx.campaignEnrollment.create({ data });
    return { contact, enrollment };
  });
}
```

### 4.4 Migration Strategy

```bash
# Development
npx prisma migrate dev --name add_feature

# Production (Railway)
npx prisma migrate deploy

# Generate TypeScript types
npx prisma generate

# Reset database (DANGEROUS!)
npx prisma migrate reset
```

---

## 5. API Architecture

### 5.1 RESTful Design

```
BASE_URL: https://api.example.com/api/v1
```

#### Naming Conventions

```typescript
// Resource-based URLs (plural nouns)
GET    /contacts                // List all
GET    /contacts/:id            // Get one
POST   /contacts                // Create
PATCH  /contacts/:id            // Update
DELETE /contacts/:id            // Delete

// Nested resources
GET    /contacts/:id/enrollments
POST   /contacts/:id/enroll

// Actions (avoid when possible, use status/state changes instead)
POST   /contacts/:id/validate
POST   /jobs/scrape/trigger

// Filters and pagination
GET    /contacts?status=NEW&page=1&limit=50&sort=-createdAt
```

### 5.2 Response Format

```typescript
// Success Response
{
  "success": true,
  "data": { /* resource or array */ },
  "meta": {
    "timestamp": "2026-01-19T10:00:00Z",
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 250,
      "totalPages": 5
    }
  }
}

// Error Response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-01-19T10:00:00Z",
    "requestId": "req_abc123"
  }
}
```

### 5.3 Authentication

```typescript
// API Key Authentication (Header-based)
headers: {
  'Authorization': 'Bearer YOUR_API_KEY',
  // or
  'x-api-key': 'YOUR_API_KEY'
}

// Middleware Implementation
export function authenticateApiKey(req, res, next) {
  const apiKey = req.headers.authorization?.replace('Bearer ', '') 
                || req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== config.apiKey) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }
  
  next();
}
```

### 5.4 Rate Limiting

```typescript
// Global rate limiter
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false,
});

// Endpoint-specific limiter
const strictRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 10,                    // 10 requests per hour
});

router.post('/jobs/scrape', strictRateLimiter, triggerScrapeJob);
```

### 5.5 Validation

```typescript
// Using Zod for runtime validation
import { z } from 'zod';

const createContactSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  companyId: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
});

// Controller usage
export const createContact = asyncHandler(async (req, res) => {
  const validated = createContactSchema.parse(req.body);
  const contact = await contactService.createContact(validated);
  res.json({ success: true, data: contact });
});
```

---

## 6. Integration Architecture

### 6.1 Integration Client Pattern

```typescript
// Base HTTP Client
class BaseClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private options: ClientOptions = {}
  ) {
    this.axios = axios.create({
      baseURL: baseUrl,
      timeout: options.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
    });
    
    this.setupInterceptors();
  }
  
  protected async request(endpoint: string, options: RequestOptions) {
    try {
      const response = await this.axios.request({
        url: endpoint,
        ...options,
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }
  
  private setupInterceptors() {
    // Request logging
    this.axios.interceptors.request.use((config) => {
      logger.debug({ url: config.url, method: config.method }, 'API Request');
      return config;
    });
    
    // Rate limit handling
    this.axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'] || 60;
          logger.warn({ retryAfter }, 'Rate limited, waiting...');
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          return this.axios.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }
}

// Specific Integration Example
class ApolloClient extends BaseClient {
  constructor() {
    super(config.apollo.baseUrl, config.apollo.apiKey);
  }
  
  async searchPeople(query: ApolloSearchQuery): Promise<ApolloContact[]> {
    const response = await this.request('/people/search', {
      method: 'POST',
      data: this.buildSearchQuery(query),
    });
    
    return response.people.map(this.normalize);
  }
  
  private normalize(raw: any): ApolloContact {
    return {
      id: raw.id,
      email: raw.email,
      firstName: raw.first_name,
      lastName: raw.last_name,
      // ... normalization logic
    };
  }
}
```

### 6.2 Integration Mapping

```typescript
// Track external IDs for bidirectional sync
interface Contact {
  id: string;               // Internal UUID
  email: string;            // Unique identifier
  apolloId: string;         // Apollo.io person ID
  ghlContactId: string;     // GoHighLevel contact ID
  googlePlaceId: string;    // Google Maps place ID
  instantlyLeadId: string;  // Instantly lead ID
}

// Service pattern for sync
class ContactSyncService {
  async syncToGHL(contactId: string) {
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    
    if (!contact.ghlContactId) {
      // Create in GHL
      const ghlContact = await ghlClient.createContact({
        email: contact.email,
        firstName: contact.firstName,
        // ...
      });
      
      // Save mapping
      await prisma.contact.update({
        where: { id: contactId },
        data: { ghlContactId: ghlContact.id },
      });
    } else {
      // Update existing
      await ghlClient.updateContact(contact.ghlContactId, {
        // ...
      });
    }
  }
}
```

### 6.3 Webhook Handling

```typescript
// Webhook route (no authentication - validated by signature)
router.post('/webhooks/instantly', async (req, res) => {
  // Instant acknowledgment
  res.status(200).json({ received: true });
  
  // Process asynchronously
  await webhookLogService.create({
    source: 'instantly',
    eventType: req.body.event,
    payload: req.body,
  });
  
  await processInstantlyWebhook(req.body);
});

// Webhook processor
async function processInstantlyWebhook(payload: any) {
  const { event, data } = payload;
  
  switch (event) {
    case 'email.opened':
      await contactService.updateStatus(data.lead_email, 'OPENED');
      break;
    
    case 'email.replied':
      await replyService.handleReply({
        email: data.lead_email,
        content: data.reply_body,
        receivedAt: new Date(data.timestamp),
      });
      break;
  }
}
```

---

## 7. Background Processing

### 7.1 Queue Architecture

```typescript
// Queue Definition (BullMQ)
import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../config/redis';

// Create Queue
export const leadProcessingQueue = new Queue('lead-processing', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 24 * 3600, count: 500 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

// Create Worker
const leadWorker = new Worker('lead-processing', processLeadJob, {
  connection: redis,
  concurrency: 5,
  limiter: {
    max: 10,        // Max 10 jobs
    duration: 1000, // Per second
  },
});

// Job Processor
async function processLeadJob(job: Job<LeadProcessingJobData>) {
  const { type, contactId, options } = job.data;
  
  switch (type) {
    case 'validate':
      return await validateContact(contactId, options);
    case 'enrich':
      return await enrichContact(contactId);
    case 'deduplicate':
      return await findDuplicates(contactId);
  }
}

// Add Job to Queue
await leadProcessingQueue.add('validate', {
  type: 'validate',
  contactId: contact.id,
  options: { validateEmail: true, validatePhone: true },
});
```

### 7.2 Job Scheduler

```typescript
// Cron-based Scheduler
import * as cron from 'node-cron';

class JobScheduler {
  async initialize() {
    const schedules = await settingsService.getCronSchedules();
    
    // Scrape job: Daily at 6:00 AM
    cron.schedule(schedules.scrape, async () => {
      await this.runJob('SCRAPE', () => scrapeJob.run());
    });
    
    // Enrich job: Daily at 8:00 AM
    cron.schedule(schedules.enrich, async () => {
      await this.runJob('ENRICH', () => enrichJob.run());
    });
  }
  
  async runJob(type: string, jobFn: () => Promise<any>) {
    const enabled = await settingsService.isJobEnabled(type);
    if (!enabled) return;
    
    const jobId = await jobLogService.startJob(type);
    
    try {
      const result = await jobFn();
      await jobLogService.completeJob(jobId, result);
    } catch (error) {
      await jobLogService.failJob(jobId, error.message);
    }
  }
}
```

### 7.3 Job Types

| Job Name | Schedule | Purpose | Queue |
|----------|----------|---------|-------|
| **Scrape** | 6:00 AM daily | Google Maps scraping | scraper |
| **Apollo** | 6:30 AM daily | Apollo.io search | scraper |
| **Enrich** | 8:00 AM daily | Hunter.io enrichment | enrichment |
| **Merge** | 9:00 AM daily | Duplicate merging | lead-processing |
| **Validate** | 10:00 AM daily | Email/phone validation | lead-processing |
| **Enroll** | 11:00 AM daily | Campaign auto-enrollment | campaign |

---

## 8. Real-Time Communication

### 8.1 WebSocket Architecture

```typescript
// Socket.IO Server
import { Server as SocketIOServer } from 'socket.io';

const io = new SocketIOServer(httpServer, {
  cors: { origin: config.frontendUrl },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Event Types
export enum WSEventType {
  JOB_STARTED = 'job:started',
  JOB_COMPLETED = 'job:completed',
  CONTACT_CREATED = 'contact:created',
  REPLY_RECEIVED = 'reply:received',
  SYSTEM_ALERT = 'system:alert',
}

// Event Emitter Service
class RealtimeEmitter {
  emitJobEvent(data: JobEvent) {
    io.to('dashboard').emit(WSEventType.JOB_STARTED, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
  
  emitContactUpdate(contact: Contact) {
    io.to('dashboard').emit(WSEventType.CONTACT_CREATED, contact);
  }
}

// Usage in services
await contactService.createContact(data);
realtimeEmitter.emitContactUpdate(contact);
```

### 8.2 Client Connection

```typescript
// Frontend Socket.IO Client
import { io } from 'socket.io-client';

const socket = io('https://api.example.com', {
  auth: { apiKey: 'YOUR_API_KEY' },
});

socket.on('connect', () => {
  console.log('Connected to real-time server');
});

socket.on('job:completed', (data) => {
  console.log('Job completed:', data);
  updateUI(data);
});
```

---

## 9. Security Architecture

### 9.1 Security Layers

```typescript
// 1. Helmet (HTTP Security Headers)
app.use(helmet());
// Sets: X-Frame-Options, X-Content-Type-Options, etc.

// 2. CORS (Cross-Origin Resource Sharing)
app.use(cors({
  origin: config.isProduction ? config.frontendUrl : '*',
  credentials: true,
}));

// 3. API Key Authentication
const authenticateApiKey = (req, res, next) => {
  const apiKey = extractApiKey(req);
  if (apiKey !== config.apiKey) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }
  next();
};

// 4. Rate Limiting (Prevent abuse)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
}));

// 5. Input Validation (Zod schemas)
const validated = schema.parse(req.body);

// 6. SQL Injection Prevention (Prisma ORM)
// Prisma uses parameterized queries automatically

// 7. Environment Variables (Never commit secrets)
// Use .env files + environment-specific configs
```

### 9.2 Error Handling

```typescript
// Custom Error Class
class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public isOperational: boolean = true
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

// Global Error Handler
app.use((error, req, res, next) => {
  // Log error
  logger.error({ error, path: req.path }, 'Error occurred');
  
  // Capture in Sentry (for non-operational errors)
  if (!error.isOperational) {
    Sentry.captureException(error);
  }
  
  // Send response
  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message,
    },
  });
});

// Async Handler Wrapper
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

---

## 10. Error Handling & Monitoring

### 10.1 Logging Strategy

```typescript
// Pino Logger Configuration
import pino from 'pino';

export const logger = pino({
  level: config.isDevelopment ? 'debug' : 'info',
  transport: config.isDevelopment ? {
    target: 'pino-pretty',
    options: { colorize: true },
  } : undefined,
});

// Usage
logger.info({ userId: '123' }, 'User created');
logger.error({ error: err }, 'Failed to process');
```

### 10.2 Sentry Integration

```typescript
// Initialize Sentry
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: config.sentry.dsn,
  environment: config.nodeEnv,
  tracesSampleRate: 0.1,
});

// Capture exceptions
try {
  await riskyOperation();
} catch (error) {
  Sentry.captureException(error, {
    extra: { context: 'riskyOperation' },
  });
}
```

---

## 11. Deployment Architecture

### 11.1 Infrastructure

```yaml
# Railway Deployment
services:
  backend:
    build: nixpacks
    env:
      - NODE_ENV=production
      - DATABASE_URL=$DATABASE_URL
      - REDIS_URL=$REDIS_URL
    healthcheck: /health
    port: 3000
    
  # External Services
  database: Supabase PostgreSQL (managed)
  cache: Upstash Redis (managed)
  monitoring: Sentry (managed)
```

### 11.2 Environment Variables

```bash
# Production .env (Railway)
NODE_ENV=production
PORT=3000
API_KEY=secure_random_string_here
DATABASE_URL=postgresql://user:pass@host:6543/db?pgbouncer=true
DIRECT_URL=postgresql://user:pass@host:5432/db
REDIS_URL=rediss://user:pass@host:port

# Integration Keys
APOLLO_API_KEY=...
INSTANTLY_API_KEY=...
TWILIO_ACCOUNT_SID=...
# ... (30+ environment variables)
```

### 11.3 Health Checks

```typescript
// Health endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Extended health check (authenticated)
router.get('/api/v1/health/extended', authenticateApiKey, async (req, res) => {
  const [dbHealth, redisHealth, queueHealth] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkQueues(),
  ]);
  
  res.json({
    status: 'ok',
    services: {
      database: dbHealth,
      redis: redisHealth,
      queues: queueHealth,
    },
  });
});
```

---

## 12. Code Organization

### 12.1 Project Structure

```
backend/
├── src/
│   ├── config/               # Configuration files
│   │   ├── index.ts          # Environment validation (Zod)
│   │   ├── database.ts       # Prisma client
│   │   ├── redis.ts          # IORedis client
│   │   ├── websocket.ts      # Socket.IO setup
│   │   └── sentry.ts         # Error tracking
│   │
│   ├── controllers/          # Route handlers (thin layer)
│   │   ├── contact.controller.ts
│   │   ├── campaign.controller.ts
│   │   └── webhook.controller.ts
│   │
│   ├── services/             # Business logic (thick layer)
│   │   ├── contact/
│   │   │   ├── contact.service.ts
│   │   │   └── export.service.ts
│   │   ├── campaign/
│   │   │   ├── campaign.service.ts
│   │   │   └── routing.service.ts
│   │   ├── outreach/
│   │   │   ├── email.service.ts
│   │   │   └── sms.service.ts
│   │   └── validation/
│   │       ├── email.service.ts
│   │       └── phone.service.ts
│   │
│   ├── integrations/         # External API clients
│   │   ├── apollo/
│   │   │   ├── client.ts     # HTTP client
│   │   │   ├── normalizer.ts # Data transformation
│   │   │   └── types.ts      # TypeScript types
│   │   ├── instantly/
│   │   ├── twilio/
│   │   └── hunter/
│   │
│   ├── jobs/                 # Background processing
│   │   ├── queues.ts         # BullMQ queue definitions
│   │   ├── worker.ts         # Worker initialization
│   │   ├── scheduler.ts      # Cron jobs
│   │   ├── scrape.job.ts     # Job implementations
│   │   ├── enrich.job.ts
│   │   └── processors/       # Job processors
│   │       ├── lead-processor.ts
│   │       └── campaign-processor.ts
│   │
│   ├── routes/               # Express routes
│   │   ├── index.ts          # Route aggregator
│   │   ├── contact.routes.ts
│   │   ├── campaign.routes.ts
│   │   └── webhook.routes.ts
│   │
│   ├── middleware/           # Express middleware
│   │   ├── auth.ts           # API key validation
│   │   ├── errorHandler.ts   # Error handling
│   │   ├── requestLogger.ts  # Pino logging
│   │   └── rateLimit.ts      # Rate limiting
│   │
│   ├── validators/           # Zod schemas
│   │   ├── contact.schema.ts
│   │   └── campaign.schema.ts
│   │
│   ├── utils/                # Helper functions
│   │   ├── logger.ts         # Pino logger
│   │   ├── errors.ts         # Error classes
│   │   └── helpers.ts        # Utility functions
│   │
│   ├── types/                # Shared TypeScript types
│   │   └── index.ts
│   │
│   ├── app.ts                # Express app setup
│   └── index.ts              # Server entry point
│
├── prisma/
│   ├── schema.prisma         # Database schema
│   ├── migrations/           # Migration history
│   └── seed.ts               # Seed data
│
├── tests/                    # Vitest tests
│   ├── api/
│   ├── services/
│   └── integration/
│
├── dist/                     # Compiled JavaScript (gitignored)
├── .env                      # Environment variables (gitignored)
├── .env.example              # Template
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
└── railway.json              # Deployment config
```

### 12.2 Naming Conventions

```typescript
// Files
- PascalCase for classes: ContactService.ts
- kebab-case for others: contact.service.ts
- *.controller.ts for controllers
- *.service.ts for services
- *.routes.ts for routes
- *.schema.ts for validators

// Variables
const variableName = ...;        // camelCase
const CONSTANT_NAME = ...;       // SCREAMING_SNAKE_CASE
interface TypeName { }           // PascalCase
enum EnumName { }                // PascalCase

// Functions
function functionName() { }      // camelCase
async function asyncFunction() { // async prefix (implicit)

// Database
model TableName { }              // PascalCase (singular)
enum StatusEnum { }              // PascalCase
```

---

## 13. Data Flow Patterns

### 13.1 Lead Ingestion Pipeline

```
CSV Upload → Parser → Validator → Deduplicator → Enricher → Campaign Router → Enrolllment
     │          │         │            │             │             │              │
     ↓          ↓         ↓            ↓             ↓             ↓              ↓
  Import    Column    Email/Phone   Merge       Hunter.io     Match Rules    Instantly/GHL
   Job      Mapping   Validation    Contacts    Enrichment    by Industry    Enrollment
```

#### Implementation

```typescript
// 1. Upload & Parse
const importJob = await importJobService.create('CSV');
const rows = await csvParserService.parse(file);

// 2. Validate & Create
for (const row of rows) {
  const validated = contactSchema.safeParse(row);
  if (!validated.success) continue;
  
  const contact = await contactService.createContact(validated.data);
  
  // 3. Queue for processing
  await leadProcessingQueue.add('full-pipeline', {
    type: 'full-pipeline',
    contactId: contact.id,
    options: {
      validateEmail: true,
      validatePhone: true,
      enrichWithHunter: true,
      checkDuplicates: true,
    },
  });
}

// 4. Worker processes (async)
async function processLeadJob(job) {
  const { contactId, options } = job.data;
  
  // Email validation
  if (options.validateEmail) {
    const result = await emailValidationService.validate(contact.email);
    await contactService.updateValidationStatus(contactId, result);
  }
  
  // Deduplication
  if (options.checkDuplicates) {
    const duplicates = await deduplicationService.findDuplicates(contactId);
    if (duplicates.length > 0) {
      await contactMergerService.mergeDuplicates(contactId, duplicates);
    }
  }
  
  // Enrichment
  if (options.enrichWithHunter) {
    const enriched = await hunterService.enrichEmail(contact.email);
    await contactService.updateEnrichment(contactId, enriched);
  }
  
  // Campaign routing
  const campaign = await routingService.findMatchingCampaign(contact);
  if (campaign) {
    await campaignService.enrollContact(campaign.id, contactId);
  }
}
```

### 13.2 Reply Handling Flow

```
Webhook → Validation → Contact Lookup → Update Status → Stop Sequences → Notify → Real-time Event
```

```typescript
// Webhook handler (Instantly)
router.post('/webhooks/instantly', async (req, res) => {
  res.status(200).json({ received: true });
  
  const { event, data } = req.body;
  
  if (event === 'email.replied') {
    await handleReply({
      email: data.lead_email,
      subject: data.reply_subject,
      body: data.reply_body,
      timestamp: data.timestamp,
    });
  }
});

// Reply service
async function handleReply(data) {
  // 1. Find contact
  const contact = await prisma.contact.findUnique({
    where: { email: data.email },
  });
  
  // 2. Create reply record
  await prisma.reply.create({
    data: {
      contactId: contact.id,
      channel: 'EMAIL',
      content: data.body,
      subject: data.subject,
      receivedAt: new Date(data.timestamp),
    },
  });
  
  // 3. Update contact status
  await prisma.contact.update({
    where: { id: contact.id },
    data: {
      hasReplied: true,
      repliedAt: new Date(),
      repliedChannel: 'EMAIL',
      status: 'REPLIED',
    },
  });
  
  // 4. Stop all sequences
  await prisma.sequenceEnrollment.updateMany({
    where: { contactId: contact.id, isPaused: false },
    data: { isPaused: true, pauseReason: 'Received reply' },
  });
  
  // 5. Send notification
  await emailNotificationService.sendReplyAlert(contact, data.body);
  
  // 6. Real-time broadcast
  realtimeEmitter.emitReplyReceived({
    contactId: contact.id,
    email: contact.email,
    channel: 'EMAIL',
  });
}
```

---

## 14. Scalability Strategy

### 14.1 Horizontal Scaling

```yaml
# Multiple worker instances
services:
  api:
    instances: 3
    load_balancer: round_robin
    
  worker:
    instances: 5
    queue: lead-processing
```

### 14.2 Database Optimization

```typescript
// Connection pooling (Supabase)
DATABASE_URL=postgresql://...?pgbouncer=true&connection_limit=10

// Indexes (defined in Prisma schema)
model Contact {
  @@index([email])
  @@index([status, createdAt])
  @@index([hasReplied])
}

// Query optimization
// BAD: N+1 queries
const contacts = await prisma.contact.findMany();
for (const contact of contacts) {
  const company = await prisma.company.findUnique({ where: { id: contact.companyId } });
}

// GOOD: Eager loading
const contacts = await prisma.contact.findMany({
  include: { company: true },
});
```

### 14.3 Caching Strategy

```typescript
// Redis caching
class ContactService {
  async getContact(id: string): Promise<Contact> {
    // Check cache
    const cached = await redis.get(`contact:${id}`);
    if (cached) return JSON.parse(cached);
    
    // Query database
    const contact = await prisma.contact.findUnique({ where: { id } });
    
    // Cache for 1 hour
    await redis.setex(`contact:${id}`, 3600, JSON.stringify(contact));
    
    return contact;
  }
  
  async updateContact(id: string, data: any) {
    const contact = await prisma.contact.update({ where: { id }, data });
    
    // Invalidate cache
    await redis.del(`contact:${id}`);
    
    return contact;
  }
}
```

---

## 15. Implementation Guide

### 15.1 Quick Start Checklist

```bash
# 1. Initialize Project
mkdir backend && cd backend
npm init -y
npm install express typescript prisma @prisma/client
npm install -D @types/express @types/node tsx

# 2. Setup TypeScript
npx tsc --init
# Configure tsconfig.json (strict mode, ES2020, outDir: ./dist)

# 3. Initialize Prisma
npx prisma init
# Edit prisma/schema.prisma
npx prisma migrate dev --name init

# 4. Create Core Structure
mkdir -p src/{config,controllers,services,routes,middleware,utils,integrations,jobs}

# 5. Install Additional Dependencies
npm install zod ioredis bullmq socket.io pino helmet cors express-rate-limit
npm install dotenv axios bcryptjs

# 6. Setup Environment
cp .env.example .env
# Fill in all API keys and URLs

# 7. Build & Run
npm run build
npm start
# Or development mode: npm run dev
```

### 15.2 Development Workflow

```bash
# Terminal 1: API Server
npm run dev

# Terminal 2: Worker Process
npm run worker

# Terminal 3: Database Studio
npm run prisma:studio

# Terminal 4: Tests
npm run test:watch
```

### 15.3 Common Patterns to Follow

1. **Service Layer Pattern**: Keep controllers thin, business logic in services
2. **Repository Pattern**: Database access through Prisma (no raw SQL)
3. **DTO Pattern**: Validate input with Zod, transform output
4. **Factory Pattern**: Centralized client creation (integrations)
5. **Observer Pattern**: Real-time events with Socket.IO
6. **Queue Pattern**: Async jobs with BullMQ
7. **Singleton Pattern**: Shared instances (logger, prisma, redis)

### 15.4 Testing Strategy

```typescript
// Unit Test (Vitest)
import { describe, it, expect } from 'vitest';
import { contactService } from './contact.service';

describe('ContactService', () => {
  it('should create a contact', async () => {
    const data = { email: 'test@example.com', firstName: 'John' };
    const contact = await contactService.createContact(data);
    expect(contact.email).toBe(data.email);
  });
});

// Integration Test
describe('Contact API', () => {
  it('POST /contacts should create contact', async () => {
    const res = await request(app)
      .post('/contacts')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({ email: 'test@example.com' });
    
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
```

---

## Appendix A: Key Learnings & Best Practices

### Architecture Decisions

1. **Prisma over raw SQL**: Type safety, migrations, easy testing
2. **BullMQ over simple cron**: Retry logic, monitoring, scalability
3. **Socket.IO for real-time**: Mature, fallback mechanisms, room support
4. **Zod for validation**: Runtime + compile-time safety
5. **Pino for logging**: Fast, structured, JSON output
6. **Modular services**: Single responsibility, easy testing
7. **Environment-based config**: Never hardcode, use Zod validation

### Common Pitfalls to Avoid

1. ❌ Mixing business logic in controllers
2. ❌ Not handling async errors properly
3. ❌ Missing database indexes on query fields
4. ❌ Not validating webhook signatures
5. ❌ Hardcoding API keys or secrets
6. ❌ Not implementing rate limiting
7. ❌ Ignoring connection pooling
8. ❌ Not gracefully shutting down workers
9. ❌ Missing error monitoring (Sentry)
10. ❌ Not using transactions for multi-step operations

### Performance Optimizations

1. ✅ Use connection pooling (PgBouncer via Supabase)
2. ✅ Implement Redis caching for frequent reads
3. ✅ Add database indexes strategically
4. ✅ Use bulk operations instead of loops
5. ✅ Implement pagination on list endpoints
6. ✅ Compress responses with gzip
7. ✅ Lazy-load large JSON fields
8. ✅ Use queue workers for heavy operations
9. ✅ Implement request timeouts
10. ✅ Monitor and optimize slow queries

---

## Appendix B: Environment Variables Template

```bash
# ==================== SERVER ====================
NODE_ENV=development
PORT=3000
API_KEY=your_secure_api_key_min_32_chars
FRONTEND_URL=http://localhost:5173

# ==================== DATABASE ====================
DATABASE_URL=postgresql://user:pass@host:6543/db?pgbouncer=true&connect_timeout=10
DIRECT_URL=postgresql://user:pass@host:5432/db

# ==================== REDIS ====================
REDIS_URL=rediss://default:pass@host:port

# ==================== APOLLO.IO ====================
APOLLO_API_KEY=your_apollo_api_key
APOLLO_WEBHOOK_URL=https://your-api.com/webhooks/apollo/phones

# ==================== INSTANTLY ====================
INSTANTLY_API_KEY=your_instantly_api_key
INSTANTLY_CAMPAIGN_ID=optional_campaign_id

# ==================== TWILIO ====================
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890

# ==================== NEVERBOUNCE ====================
NEVERBOUNCE_API_KEY=your_neverbounce_key

# ==================== PHANTOMBUSTER ====================
PHANTOMBUSTER_API_KEY=your_phantombuster_key
PHANTOMBUSTER_PROFILE_VISITOR_AGENT_ID=optional
PHANTOMBUSTER_CONNECTION_AGENT_ID=optional
PHANTOMBUSTER_MESSAGE_AGENT_ID=optional

# ==================== HUNTER.IO ====================
HUNTER_API_KEY=your_hunter_key

# ==================== APIFY ====================
APIFY_API_KEY=your_apify_key

# ==================== GOHIGHLEVEL ====================
GHL_API_KEY=your_ghl_key
GHL_LOCATION_ID=your_location_id
GHL_PHONE_NUMBER=+1234567890
GHL_BASE_URL=https://rest.gohighlevel.com/v1

# ==================== GOOGLE SHEETS ====================
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# ==================== MONITORING ====================
SENTRY_DSN=https://key@sentry.io/project
NOTIFICATION_EMAIL=alerts@your-company.com

# ==================== RATE LIMITS ====================
EMAIL_RATE_LIMIT_PER_HOUR=100
SMS_RATE_LIMIT_PER_HOUR=50
LINKEDIN_RATE_LIMIT_PER_DAY=50

# ==================== BUSINESS HOURS ====================
BUSINESS_HOURS_START=9
BUSINESS_HOURS_END=17
```

---

## Appendix C: Deployment Checklist

### Pre-Deployment

- [ ] All tests passing (`npm test`)
- [ ] No linter errors (`npm run lint`)
- [ ] Environment variables documented
- [ ] Database migrations generated
- [ ] API documentation updated
- [ ] Secrets rotated (API keys)
- [ ] Health check endpoint tested
- [ ] Error monitoring configured (Sentry)
- [ ] Rate limits configured
- [ ] CORS origins restricted

### Deployment

- [ ] Push code to GitHub
- [ ] Create Railway project
- [ ] Set environment variables
- [ ] Deploy database migrations
- [ ] Generate public domain
- [ ] Update webhook URLs
- [ ] Test health endpoint
- [ ] Test authenticated endpoint
- [ ] Monitor logs for errors
- [ ] Verify WebSocket connection

### Post-Deployment

- [ ] Configure external webhooks
- [ ] Test end-to-end flows
- [ ] Set up monitoring alerts
- [ ] Document public API URL
- [ ] Update frontend .env
- [ ] Test production integrations
- [ ] Enable autoscaling (if needed)
- [ ] Schedule backup jobs
- [ ] Create runbook for incidents
- [ ] Share access with team

---

**End of Document**

This specification can be used as a blueprint for building similar production-grade systems. All patterns, architectures, and best practices are battle-tested and production-ready.

For questions or improvements, refer to the project repository or documentation.








