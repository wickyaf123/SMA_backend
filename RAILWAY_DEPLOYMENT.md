# 🚂 Railway Deployment Guide

## ✅ Code Changes Complete

The following files have been updated for Railway deployment:

1. **src/app.ts** - Updated CORS to restrict origins in production
2. **src/config/index.ts** - Added FRONTEND_URL to environment schema
3. **railway.json** - Created Railway deployment configuration

---

## 📋 Deployment Checklist

### Phase 1: Push Code to GitHub ✅

```bash
cd /Users/np1991/Desktop/james/backend
git add .
git commit -m "Add Railway deployment configuration"
git push origin main
```

### Phase 2: Railway Setup

#### Step 1: Create Railway Project

1. Go to **https://railway.app**
2. Click **"Login"** (use GitHub)
3. Click **"New Project"**
4. Select **"Deploy from GitHub repo"**
5. Authorize Railway and select your repository

#### Step 2: Configure Root Directory (if needed)

If your repo has both frontend/backend folders:
- Go to **Settings** → **Source**
- Set **Root Directory** to `backend`

#### Step 3: Set Environment Variables

Go to **Variables** tab → **Raw Editor** → Paste:

```env
# Server
NODE_ENV=production
PORT=3000
API_KEY=your-secure-api-key-here

# URLs (update after deployment)
FRONTEND_URL=https://temp-placeholder.com

# Database & Redis
DATABASE_URL=your-supabase-pooler-url-port-6543
DIRECT_URL=your-supabase-direct-url-port-5432
REDIS_URL=your-upstash-redis-url

# Apollo
APOLLO_API_KEY=your-apollo-api-key
APOLLO_WEBHOOK_URL=https://temp-placeholder.com

# Instantly
INSTANTLY_API_KEY=your-instantly-api-key
INSTANTLY_CAMPAIGN_ID=your-campaign-id-optional

# Twilio
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=your-twilio-phone

# NeverBounce
NEVERBOUNCE_API_KEY=your-neverbounce-api-key

# PhantomBuster
PHANTOMBUSTER_API_KEY=your-phantombuster-api-key
PHANTOMBUSTER_PROFILE_VISITOR_AGENT_ID=optional
PHANTOMBUSTER_CONNECTION_AGENT_ID=optional
PHANTOMBUSTER_MESSAGE_AGENT_ID=optional
PHANTOMBUSTER_INBOX_AGENT_ID=optional

# Google Sheets (optional)
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-email
GOOGLE_PRIVATE_KEY=your-key

# Hunter.io (optional)
HUNTER_API_KEY=your-hunter-key

# Apify (optional)
APIFY_API_KEY=your-apify-key

# GoHighLevel (optional)
GHL_API_KEY=your-ghl-key
GHL_LOCATION_ID=your-location-id
GHL_PHONE_NUMBER=your-ghl-phone
GHL_BASE_URL=https://rest.gohighlevel.com/v1

# Email Notifications (optional)
NOTIFICATION_EMAIL=your-email@example.com

# Sentry (optional)
SENTRY_DSN=https://614d6d03c85cd9e5e4788f9469f0ae77@o4510727540703232.ingest.us.sentry.io/4510730488250368

# Rate Limits (optional - defaults provided)
EMAIL_RATE_LIMIT_PER_HOUR=100
SMS_RATE_LIMIT_PER_HOUR=50
LINKEDIN_RATE_LIMIT_PER_DAY=50

# Business Hours (optional - defaults provided)
BUSINESS_HOURS_START=9
BUSINESS_HOURS_END=17
```

#### Step 4: Generate Public Domain

1. Go to **Settings** → **Networking**
2. Click **"Generate Domain"**
3. Copy your URL: `https://backend-production-xxxx.up.railway.app`

#### Step 5: Update URLs

Go back to **Variables** and update:

```env
APOLLO_WEBHOOK_URL=https://your-railway-url.up.railway.app/webhooks/apollo/phones
FRONTEND_URL=https://your-app.vercel.app
```

#### Step 6: Redeploy

**Deployments** tab → Click `⋯` → **"Redeploy"**

---

## 🧪 Verification

### Test Health Endpoint

```bash
curl https://your-railway-url.up.railway.app/health
```

Expected: `{"status":"ok","timestamp":"...","uptime":123.45}`

### Test Authenticated Endpoint

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://your-railway-url.up.railway.app/api/v1/health/extended
```

---

## 🔗 Configure External Webhooks

| Service | Webhook URL |
|---------|-------------|
| **Apollo** | `https://your-url.up.railway.app/webhooks/apollo/phones` |
| **Instantly** | `https://your-url.up.railway.app/webhooks/instantly` |
| **GoHighLevel** | `https://your-url.up.railway.app/webhooks/ghl` |

---

## 🎯 What Changed

### 1. CORS Configuration (src/app.ts)

**Before:**
```typescript
app.use(cors());
```

**After:**
```typescript
app.use(cors({
  origin: config.isProduction 
    ? process.env.FRONTEND_URL 
    : '*',
  credentials: true,
}));
```

### 2. Environment Schema (src/config/index.ts)

**Added:**
```typescript
FRONTEND_URL: z.string().url().optional(),
```

### 3. Railway Configuration (railway.json)

**Created new file** with Nixpacks builder and deployment commands.

---

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| **502 Bad Gateway** | Check Railway logs for errors |
| **Database Failed** | Verify `DATABASE_URL` has `?sslmode=require` |
| **Redis Failed** | Ensure Upstash URL starts with `rediss://` |
| **CORS Error** | Verify `FRONTEND_URL` is set correctly |
| **Build Failed** | Check logs for TypeScript/dependency errors |

---

## 📝 Notes

- **No Docker needed** - Railway uses Nixpacks
- **Auto-deploys** on every git push to main
- **Upstash Redis** - No need for Railway Redis
- **Supabase PostgreSQL** - Already configured
- **Webhooks** - Update after getting Railway URL

---

## ✅ Deployment Status

- [x] Code changes complete
- [ ] Pushed to GitHub
- [ ] Railway project created
- [ ] Environment variables set
- [ ] Domain generated
- [ ] URLs updated
- [ ] Webhooks configured
- [ ] Verification complete

---

**Your Railway URL:** `_____________________________________`

**Next Step:** Deploy frontend to Vercel


