# James Outbound Automation - E2E Testing Plan

**Last Updated**: January 13, 2026  
**Testing Type**: End-to-End API Testing with curl  
**Environment**: Local Development

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Setup](#2-environment-setup)
3. [Testing Strategy](#3-testing-strategy)
4. [API Test Cases](#4-api-test-cases)
5. [curl Command Reference](#5-curl-command-reference)
6. [Logging & Debugging](#6-logging--debugging)
7. [Automated Test Script](#7-automated-test-script)
8. [Integration Testing Checklist](#8-integration-testing-checklist)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Prerequisites

### Required Services
```bash
# Check these are running locally:
- PostgreSQL (via Supabase or local)
- Redis (Upstash or local redis-server)
- Node.js 20+
```

### Environment Variables
```bash
# Ensure .env has:
API_KEY=your-test-api-key
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
LOG_LEVEL=debug        # Enable detailed logging
NODE_ENV=development   # Pretty logs
```

### Start the Server
```bash
cd backend
npm run dev

# In another terminal, start the worker (for jobs)
npm run worker
```

---

## 2. Environment Setup

### Set Base Variables for Testing
```bash
# Export these in your terminal session
export BASE_URL="http://localhost:3000"
export API_KEY="your-api-key-here"
export AUTH_HEADER="Authorization: Bearer $API_KEY"
```

### Quick Connectivity Test
```bash
# Test basic connectivity (no auth)
curl -s $BASE_URL/health | jq

# Test authenticated endpoint
curl -s -H "$AUTH_HEADER" $BASE_URL/api/v1/health | jq
```

---

## 3. Testing Strategy

### Test Categories

| Category | Priority | Description |
|----------|----------|-------------|
| **Health & System** | P0 | Basic connectivity, DB, Redis |
| **Contacts CRUD** | P0 | Create, read, update, delete contacts |
| **Companies CRUD** | P0 | Create, read, update, delete companies |
| **Campaigns** | P1 | Campaign management, enrollment |
| **Settings** | P1 | Pipeline controls, scraper config |
| **Jobs** | P1 | Trigger and monitor background jobs |
| **Webhooks** | P2 | Incoming webhook handling |
| **Templates** | P2 | Message template management |
| **Metrics** | P2 | Analytics and reporting |

### Test Flow

```
1. Health Check → Verify system is up
2. Settings → Configure pipeline
3. Contacts → Create test contacts
4. Companies → Create test companies  
5. Campaigns → Create and enroll
6. Jobs → Trigger and verify
7. Webhooks → Simulate incoming events
8. Cleanup → Delete test data
```

---

## 4. API Test Cases

### 4.1 Health & System Tests

#### Test H1: Basic Health Check (Public)
```bash
# Should return 200 with status: ok
curl -X GET "$BASE_URL/health" \
  -H "Content-Type: application/json" | jq

# Expected: { "success": true, "data": { "status": "ok", ... } }
```

#### Test H2: System Health (Protected)
```bash
# Should return 200 with database and redis status
curl -X GET "$BASE_URL/api/v1/health" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq

# Expected: database: "healthy", redis: "healthy"
```

#### Test H3: Extended Health (All Integrations)
```bash
curl -X GET "$BASE_URL/api/v1/health/extended" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq

# Shows status of: Apollo, Instantly, GHL, NeverBounce, etc.
```

#### Test H4: Version Info
```bash
curl -X GET "$BASE_URL/api/v1/version" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test H5: Test Email Notification
```bash
curl -X POST "$BASE_URL/api/v1/test-notification" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

---

### 4.2 Contact Tests

#### Test C1: Create Contact
```bash
curl -X POST "$BASE_URL/api/v1/contacts" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "firstName": "John",
    "lastName": "Test",
    "email": "john.test@example.com",
    "phone": "+14155551234",
    "title": "Owner",
    "source": "manual_test"
  }' | jq

# Save the returned ID
export CONTACT_ID="<returned-id>"
```

#### Test C2: Get Contact
```bash
curl -X GET "$BASE_URL/api/v1/contacts/$CONTACT_ID" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test C3: List Contacts with Filters
```bash
# List all contacts
curl -X GET "$BASE_URL/api/v1/contacts" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq

# With pagination
curl -X GET "$BASE_URL/api/v1/contacts?page=1&limit=10" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq

# Filter by status
curl -X GET "$BASE_URL/api/v1/contacts?status=NEW" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq

# Filter by email validation status
curl -X GET "$BASE_URL/api/v1/contacts?emailValidationStatus=PENDING" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq

# Search by email
curl -X GET "$BASE_URL/api/v1/contacts?search=john.test" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test C4: Update Contact
```bash
curl -X PATCH "$BASE_URL/api/v1/contacts/$CONTACT_ID" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "title": "CEO",
    "tags": ["test", "vip"]
  }' | jq
```

#### Test C5: Contact Statistics
```bash
curl -X GET "$BASE_URL/api/v1/contacts/stats" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test C6: Export Contacts (CSV)
```bash
curl -X GET "$BASE_URL/api/v1/contacts/export" \
  -H "$AUTH_HEADER" \
  -o contacts_export.csv

# With filters
curl -X GET "$BASE_URL/api/v1/contacts/export?status=VALIDATED" \
  -H "$AUTH_HEADER" \
  -o validated_contacts.csv
```

#### Test C7: Get Contact Activity
```bash
curl -X GET "$BASE_URL/api/v1/contacts/$CONTACT_ID/activity" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test C8: Get Contact Replies
```bash
curl -X GET "$BASE_URL/api/v1/contacts/$CONTACT_ID/replies" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test C9: Delete Contact
```bash
curl -X DELETE "$BASE_URL/api/v1/contacts/$CONTACT_ID" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

---

### 4.3 Company Tests

#### Test CO1: Create Company
```bash
curl -X POST "$BASE_URL/api/v1/companies" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "name": "Test HVAC Company",
    "domain": "testhvac.com",
    "industry": "HVAC",
    "size": "11-50",
    "city": "San Francisco",
    "state": "CA",
    "country": "US"
  }' | jq

export COMPANY_ID="<returned-id>"
```

#### Test CO2: List Companies
```bash
curl -X GET "$BASE_URL/api/v1/companies" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq

# With pagination
curl -X GET "$BASE_URL/api/v1/companies?page=1&limit=10" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test CO3: Get Company
```bash
curl -X GET "$BASE_URL/api/v1/companies/$COMPANY_ID" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test CO4: Update Company
```bash
curl -X PATCH "$BASE_URL/api/v1/companies/$COMPANY_ID" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "industry": "HVAC & Plumbing",
    "website": "https://testhvac.com"
  }' | jq
```

---

### 4.4 Campaign Tests

#### Test CA1: Create Campaign
```bash
curl -X POST "$BASE_URL/api/v1/campaigns" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "name": "Test Email Campaign",
    "channel": "EMAIL",
    "description": "Test campaign for E2E testing"
  }' | jq

export CAMPAIGN_ID="<returned-id>"
```

#### Test CA2: List Campaigns
```bash
curl -X GET "$BASE_URL/api/v1/campaigns" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test CA3: Get Campaign
```bash
curl -X GET "$BASE_URL/api/v1/campaigns/$CAMPAIGN_ID" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test CA4: Update Campaign
```bash
curl -X PATCH "$BASE_URL/api/v1/campaigns/$CAMPAIGN_ID" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "status": "ACTIVE",
    "description": "Updated description"
  }' | jq
```

#### Test CA5: Enroll Contacts in Campaign
```bash
# First create a contact
curl -X POST "$BASE_URL/api/v1/contacts" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "firstName": "Campaign",
    "lastName": "Test",
    "email": "campaign.test@example.com"
  }' | jq

# Then enroll
curl -X POST "$BASE_URL/api/v1/campaigns/$CAMPAIGN_ID/enroll" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "contactIds": ["<contact-id>"]
  }' | jq
```

#### Test CA6: Get Campaign Enrollments
```bash
curl -X GET "$BASE_URL/api/v1/campaigns/$CAMPAIGN_ID/enrollments" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test CA7: Get Campaign Stats
```bash
curl -X GET "$BASE_URL/api/v1/campaigns/$CAMPAIGN_ID/stats" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test CA8: Stop Enrollment
```bash
curl -X POST "$BASE_URL/api/v1/campaigns/$CAMPAIGN_ID/stop/<contact-id>" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test CA9: Sync from Instantly
```bash
curl -X POST "$BASE_URL/api/v1/campaigns/sync/instantly" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

---

### 4.5 Settings Tests

#### Test S1: Get All Settings
```bash
curl -X GET "$BASE_URL/api/v1/settings" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test S2: Update Settings
```bash
curl -X PATCH "$BASE_URL/api/v1/settings" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "linkedinGloballyEnabled": false,
    "emailOutreachEnabled": true,
    "smsOutreachEnabled": true
  }' | jq
```

#### Test S3: Get Pipeline Controls
```bash
curl -X GET "$BASE_URL/api/v1/settings/pipeline" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test S4: Update Pipeline Controls
```bash
curl -X PATCH "$BASE_URL/api/v1/settings/pipeline" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "pipelineEnabled": true,
    "schedulerEnabled": true,
    "scrapeJobEnabled": true,
    "enrichJobEnabled": true,
    "mergeJobEnabled": true,
    "validateJobEnabled": true,
    "enrollJobEnabled": true
  }' | jq
```

#### Test S5: Emergency Stop
```bash
curl -X POST "$BASE_URL/api/v1/settings/pipeline/emergency-stop" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "reason": "E2E Testing - Emergency Stop Test"
  }' | jq
```

#### Test S6: Resume Pipeline
```bash
curl -X POST "$BASE_URL/api/v1/settings/pipeline/resume" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test S7: Get Apify Settings
```bash
curl -X GET "$BASE_URL/api/v1/settings/scrapers/apify" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test S8: Update Apify Settings
```bash
curl -X PATCH "$BASE_URL/api/v1/settings/scrapers/apify" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "apifyQuery": "HVAC companies",
    "apifyLocation": "California, United States",
    "apifyMaxResults": 25,
    "apifyRequirePhone": true,
    "apifyRequireWebsite": true
  }' | jq
```

#### Test S9: Get Apollo Settings
```bash
curl -X GET "$BASE_URL/api/v1/settings/scrapers/apollo" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test S10: Update Apollo Settings
```bash
curl -X PATCH "$BASE_URL/api/v1/settings/scrapers/apollo" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "apolloIndustry": "HVAC",
    "apolloPersonTitles": ["Owner", "CEO", "President"],
    "apolloLocations": ["California, US"],
    "apolloEmployeesMin": 5,
    "apolloEmployeesMax": 100
  }' | jq
```

---

### 4.6 Jobs Tests

#### Test J1: Get Jobs Status
```bash
curl -X GET "$BASE_URL/api/v1/jobs/status" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test J2: Get Jobs History
```bash
curl -X GET "$BASE_URL/api/v1/jobs/history" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq

# With filters
curl -X GET "$BASE_URL/api/v1/jobs/history?type=scrape&status=completed" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test J3: Get Jobs Stats
```bash
curl -X GET "$BASE_URL/api/v1/jobs/stats" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test J4: Trigger Scrape Job
```bash
# WARNING: This will make actual API calls if credentials are configured
curl -X POST "$BASE_URL/api/v1/jobs/scrape/trigger" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test J5: Trigger Enrich Job
```bash
curl -X POST "$BASE_URL/api/v1/jobs/enrich/trigger" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test J6: Trigger Merge Job
```bash
curl -X POST "$BASE_URL/api/v1/jobs/merge/trigger" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test J7: Trigger Validate Job
```bash
curl -X POST "$BASE_URL/api/v1/jobs/validate/trigger" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test J8: Trigger Auto-Enroll Job
```bash
curl -X POST "$BASE_URL/api/v1/jobs/enroll/trigger" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

---

### 4.7 Template Tests

#### Test T1: Create Template
```bash
curl -X POST "$BASE_URL/api/v1/templates" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "name": "Test SMS Template",
    "channel": "SMS",
    "body": "Hi {{firstName}}, this is a test message from {{companyName}}. Reply STOP to unsubscribe.",
    "description": "Test template for E2E testing",
    "variables": ["firstName", "companyName"]
  }' | jq

export TEMPLATE_ID="<returned-id>"
```

#### Test T2: List Templates
```bash
curl -X GET "$BASE_URL/api/v1/templates" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq

# Filter by channel
curl -X GET "$BASE_URL/api/v1/templates?channel=SMS" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test T3: Get Template
```bash
curl -X GET "$BASE_URL/api/v1/templates/$TEMPLATE_ID" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test T4: Preview Template
```bash
curl -X POST "$BASE_URL/api/v1/templates/$TEMPLATE_ID/preview" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "firstName": "John",
    "companyName": "Test Corp"
  }' | jq
```

#### Test T5: Set Default Template
```bash
curl -X POST "$BASE_URL/api/v1/templates/$TEMPLATE_ID/set-default" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test T6: Get Default Template
```bash
curl -X GET "$BASE_URL/api/v1/templates/default/SMS" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

---

### 4.8 Metrics Tests

#### Test M1: Get Daily Metrics
```bash
curl -X GET "$BASE_URL/api/v1/metrics/daily?days=7" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test M2: Get Metrics by Date Range
```bash
curl -X GET "$BASE_URL/api/v1/metrics/range?startDate=2026-01-01&endDate=2026-01-13" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test M3: Get Aggregated Metrics
```bash
curl -X GET "$BASE_URL/api/v1/metrics/aggregated" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test M4: Recalculate Metrics
```bash
curl -X POST "$BASE_URL/api/v1/metrics/recalculate" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "date": "2026-01-13"
  }' | jq
```

---

### 4.9 Activity Tests

#### Test A1: Get Activity Logs
```bash
curl -X GET "$BASE_URL/api/v1/activity" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq

# With filters
curl -X GET "$BASE_URL/api/v1/activity?type=contact_created&limit=20" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test A2: Get Recent Activity
```bash
curl -X GET "$BASE_URL/api/v1/activity/recent?limit=10" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

#### Test A3: Get Activity Stats
```bash
curl -X GET "$BASE_URL/api/v1/activity/stats" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" | jq
```

---

### 4.10 GHL (GoHighLevel) Tests

#### Test G1: Sync Single Contact
```bash
curl -X POST "$BASE_URL/api/v1/ghl/sync/contact" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "contactId": "<contact-uuid>"
  }' | jq
```

#### Test G2: Bulk Sync Contacts
```bash
curl -X POST "$BASE_URL/api/v1/ghl/sync/bulk" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "contactIds": ["<id1>", "<id2>"]
  }' | jq
```

#### Test G3: Send SMS
```bash
curl -X POST "$BASE_URL/api/v1/ghl/sms/send" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "contactId": "<contact-uuid>",
    "message": "Test SMS message"
  }' | jq
```

#### Test G4: Preview SMS with Template
```bash
curl -X POST "$BASE_URL/api/v1/ghl/sms/preview-template" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "contactId": "<contact-uuid>",
    "templateId": "<template-uuid>"
  }' | jq
```

---

### 4.11 Contractor Presets Tests

#### Test CP1: Import Solar from Apollo
```bash
# WARNING: Uses API credits
curl -X POST "$BASE_URL/api/v1/contractors/apollo/solar" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "locations": ["California, US"],
    "limit": 5
  }' | jq
```

#### Test CP2: Import HVAC from Google Maps
```bash
# WARNING: Uses Apify credits
curl -X POST "$BASE_URL/api/v1/contractors/google-maps/hvac" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "location": "Los Angeles, CA",
    "maxResults": 5
  }' | jq
```

---

### 4.12 Webhook Tests (Simulating External Services)

#### Test W1: Simulate Instantly Reply Webhook
```bash
curl -X POST "$BASE_URL/api/v1/webhooks/instantly/reply" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "reply_received",
    "email": "contact@example.com",
    "subject": "Re: Your email",
    "message_id": "test-msg-123",
    "timestamp": "2026-01-13T10:00:00Z"
  }' | jq
```

#### Test W2: Simulate GHL Inbound SMS Webhook
```bash
curl -X POST "$BASE_URL/api/v1/webhooks/ghl/inbound" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "InboundMessage",
    "locationId": "test-location",
    "contactId": "test-contact",
    "body": "Test reply message",
    "phone": "+14155551234"
  }' | jq
```

---

## 5. curl Command Reference

### Common Options
```bash
-X METHOD    # HTTP method (GET, POST, PATCH, DELETE)
-H "Header"  # Add header
-d 'data'    # POST/PATCH body
-s           # Silent mode (no progress)
-v           # Verbose (show headers)
-o file      # Output to file
| jq         # Pretty-print JSON
```

### Useful Variations
```bash
# With verbose output (debugging)
curl -v -X GET "$BASE_URL/health" 2>&1 | head -50

# Save response to file
curl -s -X GET "$BASE_URL/api/v1/contacts" \
  -H "$AUTH_HEADER" > contacts.json

# Time the request
time curl -s -X GET "$BASE_URL/health" > /dev/null

# Show only HTTP status
curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health"

# With timing info
curl -w "@curl-format.txt" -s -o /dev/null "$BASE_URL/health"
```

---

## 6. Logging & Debugging

### Enable Debug Logging
```bash
# Set in .env or export before running server
export LOG_LEVEL=debug

# View logs in real-time
npm run dev 2>&1 | tee server.log
```

### Google Cloud Logging Format (Local)
The server uses structured JSON logging (pino) which is compatible with Google Cloud Logging format. When running locally:

```bash
# Pretty print logs (development)
LOG_LEVEL=debug npm run dev

# JSON format (production-like)
NODE_ENV=production LOG_LEVEL=debug npm run dev
```

### Log Fields
```json
{
  "level": "info",
  "time": "2026-01-13T10:00:00.000Z",
  "requestId": "abc123",
  "method": "GET",
  "path": "/api/v1/contacts",
  "statusCode": 200,
  "duration": "45ms",
  "msg": "Request completed"
}
```

### Filtering Logs
```bash
# Filter by log level
npm run dev 2>&1 | grep '"level":"error"'

# Filter by path
npm run dev 2>&1 | grep '/api/v1/contacts'

# Follow with jq
npm run dev 2>&1 | while read line; do echo "$line" | jq -r '.msg' 2>/dev/null; done
```

---

## 7. Automated Test Script

Run the complete test suite:

```bash
# Make executable
chmod +x scripts/test-api.sh

# Run all tests
./scripts/test-api.sh

# Run specific category
./scripts/test-api.sh health
./scripts/test-api.sh contacts
./scripts/test-api.sh campaigns
```

---

## 8. Integration Testing Checklist

### Pre-Test Checklist
- [ ] Server running (`npm run dev`)
- [ ] Worker running (`npm run worker`)
- [ ] Redis connected
- [ ] Database connected
- [ ] Environment variables set

### Health & System
- [ ] `/health` returns 200
- [ ] `/api/v1/health` returns database healthy
- [ ] `/api/v1/health` returns redis healthy
- [ ] `/api/v1/health/extended` shows integration status
- [ ] `/api/v1/version` returns version info

### Contacts
- [ ] Create contact works
- [ ] List contacts with pagination
- [ ] Get single contact
- [ ] Update contact
- [ ] Contact stats work
- [ ] Export to CSV works
- [ ] Delete contact works

### Companies
- [ ] Create company works
- [ ] List companies
- [ ] Get single company
- [ ] Update company
- [ ] Delete company

### Campaigns
- [ ] Create campaign works
- [ ] List campaigns
- [ ] Get single campaign
- [ ] Update campaign status
- [ ] Enroll contacts
- [ ] Get enrollments
- [ ] Get campaign stats
- [ ] Stop enrollment

### Settings
- [ ] Get settings works
- [ ] Update settings works
- [ ] Pipeline controls work
- [ ] Emergency stop works
- [ ] Resume pipeline works
- [ ] Apify settings work
- [ ] Apollo settings work

### Jobs
- [ ] Job status works
- [ ] Job history works
- [ ] Job stats work
- [ ] Trigger jobs work (manual verification)

### Templates
- [ ] Create template works
- [ ] List templates
- [ ] Get template
- [ ] Preview template
- [ ] Set default template

### Metrics
- [ ] Daily metrics work
- [ ] Range metrics work
- [ ] Aggregated metrics work

---

## 9. Troubleshooting

### Common Issues

#### 401 Unauthorized
```bash
# Check API key is set correctly
echo $AUTH_HEADER

# Verify against .env
grep API_KEY .env
```

#### 500 Internal Server Error
```bash
# Check server logs for stack trace
# Look for Prisma errors (database issues)
# Check Redis connection
```

#### Connection Refused
```bash
# Verify server is running
curl -s http://localhost:3000/health || echo "Server not running"

# Check port isn't blocked
lsof -i :3000
```

#### Database Errors
```bash
# Run Prisma migrations
npm run prisma:migrate

# Generate Prisma client
npm run prisma:generate

# Check database connection
npx prisma db pull
```

#### Redis Errors
```bash
# Check Redis connection
redis-cli ping

# Or for Upstash
curl -X POST "$REDIS_URL" -d '*1\r\n$4\r\nPING\r\n'
```

### Performance Testing
```bash
# Simple load test with ab (Apache Bench)
ab -n 100 -c 10 -H "$AUTH_HEADER" "$BASE_URL/api/v1/contacts"

# With hey
hey -n 100 -c 10 -H "$AUTH_HEADER" "$BASE_URL/api/v1/contacts"
```

---

## Quick Reference Card

```bash
# Environment Setup
export BASE_URL="http://localhost:3000"
export API_KEY="your-api-key"
export AUTH_HEADER="Authorization: Bearer $API_KEY"

# Health Check
curl -s $BASE_URL/health | jq

# List Contacts
curl -s -H "$AUTH_HEADER" $BASE_URL/api/v1/contacts | jq

# Create Contact
curl -s -X POST $BASE_URL/api/v1/contacts \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"User","email":"test@example.com"}' | jq

# Get Settings
curl -s -H "$AUTH_HEADER" $BASE_URL/api/v1/settings | jq

# Trigger Job
curl -s -X POST -H "$AUTH_HEADER" $BASE_URL/api/v1/jobs/merge/trigger | jq
```

---

**Happy Testing! 🧪**

