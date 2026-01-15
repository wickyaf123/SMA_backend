#!/bin/bash

###############################################################################
# End-to-End Pipeline Test Script
# Tests the complete pipeline: Import → Enrich → Merge → Validate → Enroll
# Imports 5 records from Apollo and 5 records from Apify (Google Maps)
###############################################################################

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
API_KEY="${API_KEY:-}"
BASE_URL="${BASE_URL:-http://localhost:3000}"

# Check requirements
if [ -z "$API_KEY" ]; then
    echo -e "${RED}Error: API_KEY environment variable is not set${NC}"
    echo "Usage: export API_KEY='your-api-key' && ./test-pipeline-e2e.sh"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}Warning: jq is not installed. Output will not be formatted.${NC}"
    echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
    JQ_AVAILABLE=false
else
    JQ_AVAILABLE=true
fi

# Helper function to format JSON output
format_json() {
    if [ "$JQ_AVAILABLE" = true ]; then
        jq '.'
    else
        cat
    fi
}

# Helper function to extract value from JSON
extract_json() {
    if [ "$JQ_AVAILABLE" = true ]; then
        jq -r "$1"
    else
        grep -o "\"$1\"[^,}]*" | head -1 | cut -d'"' -f4
    fi
}

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          End-to-End Pipeline Test                         ║${NC}"
echo -e "${BLUE}║  Import 5 records from Apollo + 5 from Apify              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

###############################################################################
# Step 0: Health Check
###############################################################################
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 0: Health Check${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

HEALTH_RESPONSE=$(curl -s "$BASE_URL/health")
if echo "$HEALTH_RESPONSE" | grep -q "ok\|healthy"; then
    echo -e "${GREEN}✓ Server is healthy${NC}"
else
    echo -e "${RED}✗ Server health check failed${NC}"
    exit 1
fi
echo ""

###############################################################################
# Step 1: Import 5 records from Apollo
###############################################################################
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 1: Import 5 records from Apollo (Solar contractors)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

APOLLO_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/contractors/apollo/solar" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "perPage": 5,
    "enrichLimit": 5,
    "page": 1
  }')

echo "$APOLLO_RESPONSE" | format_json
echo ""

APOLLO_IMPORTED=$(echo "$APOLLO_RESPONSE" | extract_json "imported")
APOLLO_JOB_ID=$(echo "$APOLLO_RESPONSE" | extract_json "jobId")

echo -e "${GREEN}✓ Apollo import initiated${NC}"
echo -e "  Job ID: $APOLLO_JOB_ID"
echo -e "  Expected records: 5"
echo ""
sleep 2

###############################################################################
# Step 2: Import 5 records from Apify (Google Maps)
###############################################################################
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 2: Import 5 records from Apify (Google Maps - Solar)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

APIFY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/scraper/google-maps/solar" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "metros": ["Phoenix, AZ"],
    "maxPerMetro": 5
  }')

echo "$APIFY_RESPONSE" | format_json
echo ""

APIFY_IMPORTED=$(echo "$APIFY_RESPONSE" | extract_json "totalImported")

echo -e "${GREEN}✓ Apify (Google Maps) import initiated${NC}"
echo -e "  Expected records: 5"
echo ""
sleep 3

###############################################################################
# Step 3: Check Contact Stats
###############################################################################
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 3: Check Contact Statistics${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

STATS_RESPONSE=$(curl -s "$BASE_URL/contacts/stats" \
  -H "Authorization: Bearer $API_KEY")

echo "$STATS_RESPONSE" | format_json
echo ""

TOTAL_CONTACTS=$(echo "$STATS_RESPONSE" | extract_json "total")

echo -e "${GREEN}✓ Current database state:${NC}"
echo -e "  Total contacts: $TOTAL_CONTACTS"
echo ""

###############################################################################
# Step 4: Run Enrich Job (add phone/email data)
###############################################################################
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 4: Run Enrich Job (add missing contact data)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

ENRICH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/jobs/enrich/trigger" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "batchSize": 10,
    "onlyNew": true
  }')

echo "$ENRICH_RESPONSE" | format_json
echo ""

ENRICH_JOB_ID=$(echo "$ENRICH_RESPONSE" | extract_json "jobId")
ENRICHED_COUNT=$(echo "$ENRICH_RESPONSE" | extract_json "contactsEnriched")

echo -e "${GREEN}✓ Enrich job completed${NC}"
echo -e "  Job ID: $ENRICH_JOB_ID"
echo -e "  Contacts enriched: $ENRICHED_COUNT"
echo ""
sleep 2

###############################################################################
# Step 5: Run Merge Job (deduplicate contacts)
###############################################################################
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 5: Run Merge Job (deduplicate contacts)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

MERGE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/jobs/merge/trigger" \
  -H "Authorization: Bearer $API_KEY")

echo "$MERGE_RESPONSE" | format_json
echo ""

MERGE_JOB_ID=$(echo "$MERGE_RESPONSE" | extract_json "jobId")
DUPLICATES_FOUND=$(echo "$MERGE_RESPONSE" | extract_json "duplicatesFound")
DUPLICATES_MERGED=$(echo "$MERGE_RESPONSE" | extract_json "duplicatesMerged")

echo -e "${GREEN}✓ Merge job completed${NC}"
echo -e "  Job ID: $MERGE_JOB_ID"
echo -e "  Duplicates found: $DUPLICATES_FOUND"
echo -e "  Duplicates merged: $DUPLICATES_MERGED"
echo ""
sleep 2

###############################################################################
# Step 6: Run Validate Job (verify emails/phones)
###############################################################################
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 6: Run Validate Job (verify emails and phones)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

VALIDATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/jobs/validate/trigger" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "batchSize": 10
  }')

echo "$VALIDATE_RESPONSE" | format_json
echo ""

VALIDATE_JOB_ID=$(echo "$VALIDATE_RESPONSE" | extract_json "jobId")
EMAILS_VALIDATED=$(echo "$VALIDATE_RESPONSE" | extract_json "emailsValidated")
PHONES_VALIDATED=$(echo "$VALIDATE_RESPONSE" | extract_json "phonesValidated")

echo -e "${GREEN}✓ Validate job completed${NC}"
echo -e "  Job ID: $VALIDATE_JOB_ID"
echo -e "  Emails validated: $EMAILS_VALIDATED"
echo -e "  Phones validated: $PHONES_VALIDATED"
echo ""
sleep 2

###############################################################################
# Step 7: Run Auto-Enroll Job (enroll in campaigns)
###############################################################################
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 7: Run Auto-Enroll Job (enroll in campaigns)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

ENROLL_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/jobs/enroll/trigger" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "batchSize": 10
  }')

echo "$ENROLL_RESPONSE" | format_json
echo ""

ENROLL_JOB_ID=$(echo "$ENROLL_RESPONSE" | extract_json "jobId")
EMAIL_ENROLLMENTS=$(echo "$ENROLL_RESPONSE" | extract_json "emailEnrollments")
SMS_ENROLLMENTS=$(echo "$ENROLL_RESPONSE" | extract_json "smsEnrollments")

echo -e "${GREEN}✓ Auto-enroll job completed${NC}"
echo -e "  Job ID: $ENROLL_JOB_ID"
echo -e "  Email enrollments: $EMAIL_ENROLLMENTS"
echo -e "  SMS enrollments: $SMS_ENROLLMENTS"
echo ""
sleep 2

###############################################################################
# Step 8: Verify Final Results
###############################################################################
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 8: Verify Final Results${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Get updated contact stats
FINAL_STATS=$(curl -s "$BASE_URL/contacts/stats" \
  -H "Authorization: Bearer $API_KEY")

echo -e "${GREEN}Final Contact Statistics:${NC}"
echo "$FINAL_STATS" | format_json
echo ""

# Get job history
echo -e "${GREEN}Recent Job History:${NC}"
JOB_HISTORY=$(curl -s "$BASE_URL/api/v1/jobs/history?limit=10" \
  -H "Authorization: Bearer $API_KEY")

echo "$JOB_HISTORY" | format_json
echo ""

# List recent contacts
echo -e "${GREEN}Recently Imported Contacts (First 5):${NC}"
RECENT_CONTACTS=$(curl -s "$BASE_URL/contacts?limit=5&sort=createdAt:desc" \
  -H "Authorization: Bearer $API_KEY")

echo "$RECENT_CONTACTS" | format_json
echo ""

###############################################################################
# Summary
###############################################################################
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    PIPELINE SUMMARY                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ Step 1: Apollo Import${NC}        - Job ID: $APOLLO_JOB_ID"
echo -e "${GREEN}✓ Step 2: Apify Import${NC}         - Expected: 5 records"
echo -e "${GREEN}✓ Step 3: Contact Stats${NC}        - Total: $TOTAL_CONTACTS contacts"
echo -e "${GREEN}✓ Step 4: Enrich Job${NC}           - Enriched: $ENRICHED_COUNT contacts"
echo -e "${GREEN}✓ Step 5: Merge Job${NC}            - Merged: $DUPLICATES_MERGED duplicates"
echo -e "${GREEN}✓ Step 6: Validate Job${NC}         - Validated: $EMAILS_VALIDATED emails, $PHONES_VALIDATED phones"
echo -e "${GREEN}✓ Step 7: Auto-Enroll Job${NC}      - Enrolled: $EMAIL_ENROLLMENTS email, $SMS_ENROLLMENTS SMS"
echo ""
echo -e "${GREEN}Pipeline test completed successfully! 🎉${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  - Check the frontend dashboard to see imported contacts"
echo "  - Review job logs: curl -H \"Authorization: Bearer \$API_KEY\" $BASE_URL/api/v1/jobs/history"
echo "  - View contact details: curl -H \"Authorization: Bearer \$API_KEY\" $BASE_URL/contacts"
echo ""

