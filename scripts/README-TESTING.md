# Pipeline Testing Guide

## End-to-End Pipeline Test

This script tests the complete pipeline with 5 records from Apollo and 5 from Apify (Google Maps).

### Prerequisites

1. **Backend server running** on `http://localhost:3000`
2. **API Key** configured
3. **jq installed** (optional, for pretty output): `brew install jq`

### Quick Start

```bash
# Set your API key
export API_KEY="your-api-key-here"

# Run the test
cd backend/scripts
./test-pipeline-e2e.sh
```

### What It Tests

The script runs through the complete pipeline:

1. **Health Check** - Verify server is running
2. **Apollo Import** - Import 5 solar contractor records from Apollo
3. **Apify Import** - Import 5 solar contractor records from Google Maps
4. **Contact Stats** - Check current database state
5. **Enrich Job** - Add missing phone/email data
6. **Merge Job** - Deduplicate contacts
7. **Validate Job** - Verify emails and phones
8. **Auto-Enroll Job** - Enroll contacts in campaigns
9. **Final Verification** - Review results and job history

### Expected Output

```
╔════════════════════════════════════════════════════════════╗
║          End-to-End Pipeline Test                         ║
║  Import 5 records from Apollo + 5 from Apify              ║
╚════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 0: Health Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Server is healthy

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 1: Import 5 records from Apollo (Solar contractors)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
...
✓ Apollo import initiated
  Job ID: xyz-123
  Expected records: 5
```

### Custom Configuration

You can customize the base URL:

```bash
export API_KEY="your-api-key"
export BASE_URL="http://localhost:4000"  # Custom port
./test-pipeline-e2e.sh
```

### Troubleshooting

**Server not responding:**
```bash
# Check if server is running
curl http://localhost:3000/health
```

**API Key invalid:**
```bash
# Verify API key is set correctly
echo $API_KEY
```

**No jq installed:**
The script will still work but output won't be formatted. Install with:
```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq
```

### Manual Testing (Individual Steps)

You can also run individual steps manually:

```bash
# Import from Apollo
curl -X POST http://localhost:3000/api/v1/contractors/apollo/solar \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"perPage": 5, "enrichLimit": 5}'

# Import from Apify
curl -X POST http://localhost:3000/api/v1/scraper/google-maps/solar \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"metros": ["Phoenix, AZ"], "maxPerMetro": 5}'

# Run enrich job
curl -X POST http://localhost:3000/api/v1/jobs/enrich/trigger \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 10}'

# Check job history
curl http://localhost:3000/api/v1/jobs/history?limit=10 \
  -H "Authorization: Bearer $API_KEY" | jq
```

### What Gets Tested

- ✅ Apollo API integration (person search + bulk enrichment)
- ✅ Apify Google Maps scraper
- ✅ Phone number extraction from both sources
- ✅ Email validation (NeverBounce)
- ✅ Phone validation
- ✅ Duplicate detection and merging
- ✅ Campaign auto-enrollment
- ✅ Job logging and tracking

### Environment Requirements

Ensure these environment variables are set in your `.env`:

```bash
# Required
API_KEY=your-api-key
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# For Apollo (required for Step 1)
APOLLO_API_KEY=your-apollo-key

# For Apify (required for Step 2)
APIFY_API_KEY=your-apify-key

# For validation (required for Step 6)
NEVERBOUNCE_API_KEY=your-neverbounce-key

# Optional: For webhook-based phone enrichment
APOLLO_WEBHOOK_URL=https://your-domain.com/webhooks/apollo/phones
```

### Success Criteria

A successful test should show:

- ✅ Apollo imports ~5 contacts with phones
- ✅ Apify imports ~5 contacts from Google Maps
- ✅ No duplicate emails after merge
- ✅ Emails validated (VALID/INVALID status)
- ✅ Phones validated (MOBILE/LANDLINE status)
- ✅ Contacts enrolled in campaigns (if default campaigns configured)

### Next Steps After Testing

1. **View contacts in dashboard:** http://localhost:5173
2. **Check job logs:** Review the job history in the UI
3. **Verify data quality:** Ensure phones and emails are populated
4. **Test outreach:** Try sending a test SMS to one of the contacts

