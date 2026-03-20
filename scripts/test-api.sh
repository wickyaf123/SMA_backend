#!/bin/bash
# =====================================================
# James Outbound Automation - E2E API Test Script
# =====================================================
# Usage:
#   ./scripts/test-api.sh              # Run all tests
#   ./scripts/test-api.sh health       # Run health tests only
#   ./scripts/test-api.sh contacts     # Run contact tests only
#   ./scripts/test-api.sh quick        # Run quick smoke tests
#
# Prerequisites:
#   - Server running on localhost:3000
#   - jq installed (for JSON parsing)
#   - curl installed
# =====================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-}"
VERBOSE="${VERBOSE:-false}"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Temporary data storage
CREATED_CONTACT_ID=""
CREATED_COMPANY_ID=""
CREATED_CAMPAIGN_ID=""
CREATED_TEMPLATE_ID=""

# =====================================================
# Helper Functions
# =====================================================

print_header() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC} $1"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
}

print_test() {
    echo -e "  ${YELLOW}→${NC} $1"
}

print_pass() {
    ((TESTS_PASSED++))
    echo -e "    ${GREEN}✓ PASS${NC}: $1"
}

print_fail() {
    ((TESTS_FAILED++))
    echo -e "    ${RED}✗ FAIL${NC}: $1"
    if [ "$VERBOSE" = "true" ]; then
        echo -e "    ${RED}Response:${NC} $2"
    fi
}

print_skip() {
    ((TESTS_SKIPPED++))
    echo -e "    ${YELLOW}⊘ SKIP${NC}: $1"
}

print_info() {
    echo -e "    ${BLUE}ℹ${NC} $1"
}

# Make a curl request and return the response
# Args: METHOD URL [DATA]
make_request() {
    local method=$1
    local url=$2
    local data=$3
    
    if [ -n "$data" ]; then
        if [ -n "$API_KEY" ]; then
            curl -s -X "$method" "$url" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $API_KEY" \
                -d "$data"
        else
            curl -s -X "$method" "$url" \
                -H "Content-Type: application/json" \
                -d "$data"
        fi
    else
        if [ -n "$API_KEY" ]; then
            curl -s -X "$method" "$url" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $API_KEY"
        else
            curl -s -X "$method" "$url" \
                -H "Content-Type: application/json"
        fi
    fi
}

# Get HTTP status code
# Args: METHOD URL [DATA]
get_status() {
    local method=$1
    local url=$2
    local data=$3
    
    if [ -n "$data" ]; then
        if [ -n "$API_KEY" ]; then
            curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $API_KEY" \
                -d "$data"
        else
            curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
                -H "Content-Type: application/json" \
                -d "$data"
        fi
    else
        if [ -n "$API_KEY" ]; then
            curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $API_KEY"
        else
            curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
                -H "Content-Type: application/json"
        fi
    fi
}

# Check if a JSON response has a field with expected value
check_json_field() {
    local json=$1
    local field=$2
    local expected=$3
    
    local actual=$(echo "$json" | jq -r "$field" 2>/dev/null)
    
    if [ "$actual" = "$expected" ]; then
        return 0
    else
        return 1
    fi
}

# =====================================================
# Test Suites
# =====================================================

test_health() {
    print_header "HEALTH & SYSTEM TESTS"
    
    # Test H1: Basic Health (Public)
    print_test "H1: Basic Health Check (Public)"
    ((TESTS_RUN++))
    local response=$(curl -s "$BASE_URL/health")
    if check_json_field "$response" ".success" "true"; then
        print_pass "Health endpoint returns success"
    else
        print_fail "Health endpoint failed" "$response"
    fi
    
    # Test H2: Basic Health Status
    print_test "H2: Health Status is OK"
    ((TESTS_RUN++))
    if check_json_field "$response" ".data.status" "ok"; then
        print_pass "Status is 'ok'"
    else
        print_fail "Status is not 'ok'" "$response"
    fi
    
    # Test H3: System Health (Protected)
    print_test "H3: System Health (Protected)"
    ((TESTS_RUN++))
    if [ -z "$API_KEY" ]; then
        print_skip "API_KEY not set"
    else
        local response=$(make_request "GET" "$BASE_URL/api/v1/health")
        if check_json_field "$response" ".success" "true"; then
            print_pass "System health returns success"
            
            # Check database status
            local db_status=$(echo "$response" | jq -r '.data.services.database' 2>/dev/null)
            print_info "Database: $db_status"
            
            # Check redis status
            local redis_status=$(echo "$response" | jq -r '.data.services.redis' 2>/dev/null)
            print_info "Redis: $redis_status"
        else
            print_fail "System health failed" "$response"
        fi
    fi
    
    # Test H4: 401 without auth
    print_test "H4: Protected endpoint requires auth"
    ((TESTS_RUN++))
    local status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/health")
    if [ "$status" = "401" ]; then
        print_pass "Returns 401 without auth"
    else
        print_fail "Expected 401, got $status"
    fi
    
    # Test H5: Extended Health
    print_test "H5: Extended Health Check"
    ((TESTS_RUN++))
    if [ -z "$API_KEY" ]; then
        print_skip "API_KEY not set"
    else
        local response=$(make_request "GET" "$BASE_URL/api/v1/health/extended")
        if check_json_field "$response" ".success" "true"; then
            print_pass "Extended health returns success"
        else
            print_fail "Extended health failed" "$response"
        fi
    fi
    
    # Test H6: Version Info
    print_test "H6: Version Info"
    ((TESTS_RUN++))
    if [ -z "$API_KEY" ]; then
        print_skip "API_KEY not set"
    else
        local response=$(make_request "GET" "$BASE_URL/api/v1/version")
        if check_json_field "$response" ".success" "true"; then
            local version=$(echo "$response" | jq -r '.data.version' 2>/dev/null)
            print_pass "Version: $version"
        else
            print_fail "Version endpoint failed" "$response"
        fi
    fi
}

test_contacts() {
    print_header "CONTACT TESTS"
    
    if [ -z "$API_KEY" ]; then
        print_info "Skipping contact tests - API_KEY not set"
        return
    fi
    
    # Test C1: Create Contact
    print_test "C1: Create Contact"
    ((TESTS_RUN++))
    local ts=$(date +%s)
    local create_data='{"firstName":"E2ETest","lastName":"User_'"$ts"'","email":"e2etest_'"$ts"'@example.com","phone":"+14155551234","title":"Test Owner","source":"e2e_test"}'
    local response=$(make_request "POST" "$BASE_URL/api/v1/contacts" "$create_data")
    if check_json_field "$response" ".success" "true"; then
        CREATED_CONTACT_ID=$(echo "$response" | jq -r '.data.id' 2>/dev/null)
        print_pass "Created contact: $CREATED_CONTACT_ID"
    else
        print_fail "Failed to create contact" "$response"
    fi
    
    # Test C2: Get Contact
    if [ -n "$CREATED_CONTACT_ID" ]; then
        print_test "C2: Get Contact"
        ((TESTS_RUN++))
        local response=$(make_request "GET" "$BASE_URL/api/v1/contacts/$CREATED_CONTACT_ID")
        if check_json_field "$response" ".success" "true"; then
            print_pass "Retrieved contact"
        else
            print_fail "Failed to get contact" "$response"
        fi
    fi
    
    # Test C3: List Contacts
    print_test "C3: List Contacts"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/contacts?limit=5")
    if check_json_field "$response" ".success" "true"; then
        local count=$(echo "$response" | jq -r '.data | length' 2>/dev/null)
        print_pass "Listed contacts (count: $count)"
    else
        print_fail "Failed to list contacts" "$response"
    fi
    
    # Test C4: List with Pagination
    print_test "C4: List with Pagination"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/contacts?page=1&limit=2")
    if check_json_field "$response" ".success" "true"; then
        print_pass "Pagination works"
    else
        print_fail "Pagination failed" "$response"
    fi
    
    # Test C5: Update Contact
    if [ -n "$CREATED_CONTACT_ID" ]; then
        print_test "C5: Update Contact"
        ((TESTS_RUN++))
        local update_data='{"title":"Updated Title","tags":["e2e","test"]}'
        local response=$(make_request "PATCH" "$BASE_URL/api/v1/contacts/$CREATED_CONTACT_ID" "$update_data")
        if check_json_field "$response" ".success" "true"; then
            print_pass "Updated contact"
        else
            print_fail "Failed to update contact" "$response"
        fi
    fi
    
    # Test C6: Contact Statistics
    print_test "C6: Contact Statistics"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/contacts/stats")
    if check_json_field "$response" ".success" "true"; then
        local total=$(echo "$response" | jq -r '.data.total // .data.totalContacts // "N/A"' 2>/dev/null)
        print_pass "Stats retrieved (total: $total)"
    else
        print_fail "Failed to get stats" "$response"
    fi
    
    # Test C7: Get Contact Activity
    if [ -n "$CREATED_CONTACT_ID" ]; then
        print_test "C7: Get Contact Activity"
        ((TESTS_RUN++))
        local response=$(make_request "GET" "$BASE_URL/api/v1/contacts/$CREATED_CONTACT_ID/activity")
        if check_json_field "$response" ".success" "true"; then
            print_pass "Activity retrieved"
        else
            print_fail "Failed to get activity" "$response"
        fi
    fi
    
    # Test C8: Delete Contact
    if [ -n "$CREATED_CONTACT_ID" ]; then
        print_test "C8: Delete Contact"
        ((TESTS_RUN++))
        local response=$(make_request "DELETE" "$BASE_URL/api/v1/contacts/$CREATED_CONTACT_ID")
        if check_json_field "$response" ".success" "true"; then
            print_pass "Deleted contact"
            CREATED_CONTACT_ID=""
        else
            print_fail "Failed to delete contact" "$response"
        fi
    fi
}

test_companies() {
    print_header "COMPANY TESTS"
    
    if [ -z "$API_KEY" ]; then
        print_info "Skipping company tests - API_KEY not set"
        return
    fi
    
    # Test CO1: Create Company
    print_test "CO1: Create Company"
    ((TESTS_RUN++))
    local ts=$(date +%s)
    local create_data='{"name":"E2E Test Company '"$ts"'","domain":"e2etest'"$ts"'.com","industry":"HVAC","size":"11-50","city":"San Francisco","state":"CA","country":"US"}'
    local response=$(make_request "POST" "$BASE_URL/api/v1/companies" "$create_data")
    if check_json_field "$response" ".success" "true"; then
        CREATED_COMPANY_ID=$(echo "$response" | jq -r '.data.id' 2>/dev/null)
        print_pass "Created company: $CREATED_COMPANY_ID"
    else
        print_fail "Failed to create company" "$response"
    fi
    
    # Test CO2: List Companies
    print_test "CO2: List Companies"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/companies?limit=5")
    if check_json_field "$response" ".success" "true"; then
        local count=$(echo "$response" | jq -r '.data | length' 2>/dev/null)
        print_pass "Listed companies (count: $count)"
    else
        print_fail "Failed to list companies" "$response"
    fi
    
    # Test CO3: Get Company
    if [ -n "$CREATED_COMPANY_ID" ]; then
        print_test "CO3: Get Company"
        ((TESTS_RUN++))
        local response=$(make_request "GET" "$BASE_URL/api/v1/companies/$CREATED_COMPANY_ID")
        if check_json_field "$response" ".success" "true"; then
            print_pass "Retrieved company"
        else
            print_fail "Failed to get company" "$response"
        fi
    fi
    
    # Test CO4: Update Company
    if [ -n "$CREATED_COMPANY_ID" ]; then
        print_test "CO4: Update Company"
        ((TESTS_RUN++))
        local update_data='{"industry":"HVAC and Plumbing","website":"https://e2etest.com"}'
        local response=$(make_request "PATCH" "$BASE_URL/api/v1/companies/$CREATED_COMPANY_ID" "$update_data")
        if check_json_field "$response" ".success" "true"; then
            print_pass "Updated company"
        else
            print_fail "Failed to update company" "$response"
        fi
    fi
    
    # Test CO5: Delete Company
    if [ -n "$CREATED_COMPANY_ID" ]; then
        print_test "CO5: Delete Company"
        ((TESTS_RUN++))
        local response=$(make_request "DELETE" "$BASE_URL/api/v1/companies/$CREATED_COMPANY_ID")
        if check_json_field "$response" ".success" "true"; then
            print_pass "Deleted company"
            CREATED_COMPANY_ID=""
        else
            print_fail "Failed to delete company" "$response"
        fi
    fi
}

test_campaigns() {
    print_header "CAMPAIGN TESTS"
    
    if [ -z "$API_KEY" ]; then
        print_info "Skipping campaign tests - API_KEY not set"
        return
    fi
    
    # Test CA1: Create Campaign
    print_test "CA1: Create Campaign"
    ((TESTS_RUN++))
    local ts=$(date +%s)
    local create_data='{"name":"E2E Test Campaign '"$ts"'","channel":"SMS","description":"Test campaign from E2E script"}'
    local response=$(make_request "POST" "$BASE_URL/api/v1/campaigns" "$create_data")
    if check_json_field "$response" ".success" "true"; then
        CREATED_CAMPAIGN_ID=$(echo "$response" | jq -r '.data.id' 2>/dev/null)
        print_pass "Created campaign: $CREATED_CAMPAIGN_ID"
    else
        print_fail "Failed to create campaign" "$response"
    fi
    
    # Test CA2: List Campaigns
    print_test "CA2: List Campaigns"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/campaigns")
    if check_json_field "$response" ".success" "true"; then
        local count=$(echo "$response" | jq -r '.data | length' 2>/dev/null)
        print_pass "Listed campaigns (count: $count)"
    else
        print_fail "Failed to list campaigns" "$response"
    fi
    
    # Test CA3: Get Campaign
    if [ -n "$CREATED_CAMPAIGN_ID" ]; then
        print_test "CA3: Get Campaign"
        ((TESTS_RUN++))
        local response=$(make_request "GET" "$BASE_URL/api/v1/campaigns/$CREATED_CAMPAIGN_ID")
        if check_json_field "$response" ".success" "true"; then
            print_pass "Retrieved campaign"
        else
            print_fail "Failed to get campaign" "$response"
        fi
    fi
    
    # Test CA4: Update Campaign
    if [ -n "$CREATED_CAMPAIGN_ID" ]; then
        print_test "CA4: Update Campaign"
        ((TESTS_RUN++))
        local update_data='{"description":"Updated description from E2E"}'
        local response=$(make_request "PATCH" "$BASE_URL/api/v1/campaigns/$CREATED_CAMPAIGN_ID" "$update_data")
        if check_json_field "$response" ".success" "true"; then
            print_pass "Updated campaign"
        else
            print_fail "Failed to update campaign" "$response"
        fi
    fi
    
    # Test CA5: Get Campaign Stats
    if [ -n "$CREATED_CAMPAIGN_ID" ]; then
        print_test "CA5: Get Campaign Stats"
        ((TESTS_RUN++))
        local response=$(make_request "GET" "$BASE_URL/api/v1/campaigns/$CREATED_CAMPAIGN_ID/stats")
        if check_json_field "$response" ".success" "true"; then
            print_pass "Retrieved campaign stats"
        else
            print_fail "Failed to get campaign stats" "$response"
        fi
    fi
    
    # Test CA6: Delete Campaign
    if [ -n "$CREATED_CAMPAIGN_ID" ]; then
        print_test "CA6: Delete Campaign"
        ((TESTS_RUN++))
        local response=$(make_request "DELETE" "$BASE_URL/api/v1/campaigns/$CREATED_CAMPAIGN_ID")
        if check_json_field "$response" ".success" "true"; then
            print_pass "Deleted campaign"
            CREATED_CAMPAIGN_ID=""
        else
            print_fail "Failed to delete campaign" "$response"
        fi
    fi
}

test_settings() {
    print_header "SETTINGS TESTS"
    
    if [ -z "$API_KEY" ]; then
        print_info "Skipping settings tests - API_KEY not set"
        return
    fi
    
    # Test S1: Get Settings
    print_test "S1: Get Settings"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/settings")
    if check_json_field "$response" ".success" "true"; then
        print_pass "Retrieved settings"
    else
        print_fail "Failed to get settings" "$response"
    fi
    
    # Test S2: Get Pipeline Controls
    print_test "S2: Get Pipeline Controls"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/settings/pipeline")
    if check_json_field "$response" ".success" "true"; then
        local enabled=$(echo "$response" | jq -r '.data.pipelineEnabled // "N/A"' 2>/dev/null)
        print_pass "Pipeline enabled: $enabled"
    else
        print_fail "Failed to get pipeline controls" "$response"
    fi
    
    # Test S3: Get Apify Settings
    print_test "S3: Get Apify Settings"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/settings/scrapers/apify")
    if check_json_field "$response" ".success" "true"; then
        print_pass "Retrieved Apify settings"
    else
        print_fail "Failed to get Apify settings" "$response"
    fi
    
    # Test S4: Get Apollo Settings
    print_test "S4: Get Apollo Settings"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/settings/scrapers/apollo")
    if check_json_field "$response" ".success" "true"; then
        print_pass "Retrieved Apollo settings"
    else
        print_fail "Failed to get Apollo settings" "$response"
    fi
}

test_jobs() {
    print_header "JOBS TESTS"
    
    if [ -z "$API_KEY" ]; then
        print_info "Skipping jobs tests - API_KEY not set"
        return
    fi
    
    # Test J1: Get Jobs Status
    print_test "J1: Get Jobs Status"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/jobs/status")
    if check_json_field "$response" ".success" "true"; then
        print_pass "Retrieved jobs status"
    else
        print_fail "Failed to get jobs status" "$response"
    fi
    
    # Test J2: Get Jobs History
    print_test "J2: Get Jobs History"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/jobs/history?limit=5")
    if check_json_field "$response" ".success" "true"; then
        print_pass "Retrieved jobs history"
    else
        print_fail "Failed to get jobs history" "$response"
    fi
    
    # Test J3: Get Jobs Stats
    print_test "J3: Get Jobs Stats"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/jobs/stats")
    if check_json_field "$response" ".success" "true"; then
        print_pass "Retrieved jobs stats"
    else
        print_fail "Failed to get jobs stats" "$response"
    fi
}

test_templates() {
    print_header "TEMPLATE TESTS"
    
    if [ -z "$API_KEY" ]; then
        print_info "Skipping template tests - API_KEY not set"
        return
    fi
    
    # Test T1: Create Template
    print_test "T1: Create Template"
    ((TESTS_RUN++))
    local ts=$(date +%s)
    local create_data='{"name":"E2E Test Template '"$ts"'","channel":"SMS","body":"Hi {{firstName}}, this is a test from {{companyName}}.","description":"E2E test template","variables":["firstName","companyName"]}'
    local response=$(make_request "POST" "$BASE_URL/api/v1/templates" "$create_data")
    if check_json_field "$response" ".success" "true"; then
        CREATED_TEMPLATE_ID=$(echo "$response" | jq -r '.data.id' 2>/dev/null)
        print_pass "Created template: $CREATED_TEMPLATE_ID"
    else
        print_fail "Failed to create template" "$response"
    fi
    
    # Test T2: List Templates
    print_test "T2: List Templates"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/templates")
    if check_json_field "$response" ".success" "true"; then
        local count=$(echo "$response" | jq -r '.data | length' 2>/dev/null)
        print_pass "Listed templates (count: $count)"
    else
        print_fail "Failed to list templates" "$response"
    fi
    
    # Test T3: Preview Template
    if [ -n "$CREATED_TEMPLATE_ID" ]; then
        print_test "T3: Preview Template"
        ((TESTS_RUN++))
        local preview_data='{"firstName":"John","companyName":"Test Corp"}'
        local response=$(make_request "POST" "$BASE_URL/api/v1/templates/$CREATED_TEMPLATE_ID/preview" "$preview_data")
        if check_json_field "$response" ".success" "true"; then
            print_pass "Previewed template"
        else
            print_fail "Failed to preview template" "$response"
        fi
    fi
    
    # Test T4: Delete Template
    if [ -n "$CREATED_TEMPLATE_ID" ]; then
        print_test "T4: Delete Template"
        ((TESTS_RUN++))
        local response=$(make_request "DELETE" "$BASE_URL/api/v1/templates/$CREATED_TEMPLATE_ID")
        if check_json_field "$response" ".success" "true"; then
            print_pass "Deleted template"
            CREATED_TEMPLATE_ID=""
        else
            print_fail "Failed to delete template" "$response"
        fi
    fi
}

test_metrics() {
    print_header "METRICS TESTS"
    
    if [ -z "$API_KEY" ]; then
        print_info "Skipping metrics tests - API_KEY not set"
        return
    fi
    
    # Test M1: Get Daily Metrics
    print_test "M1: Get Daily Metrics"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/metrics/daily?days=7")
    if check_json_field "$response" ".success" "true"; then
        print_pass "Retrieved daily metrics"
    else
        print_fail "Failed to get daily metrics" "$response"
    fi
    
    # Test M2: Get Aggregated Metrics
    print_test "M2: Get Aggregated Metrics"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/metrics/aggregated")
    if check_json_field "$response" ".success" "true"; then
        print_pass "Retrieved aggregated metrics"
    else
        print_fail "Failed to get aggregated metrics" "$response"
    fi
}

test_activity() {
    print_header "ACTIVITY TESTS"
    
    if [ -z "$API_KEY" ]; then
        print_info "Skipping activity tests - API_KEY not set"
        return
    fi
    
    # Test A1: Get Activity Logs
    print_test "A1: Get Activity Logs"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/activity?limit=10")
    if check_json_field "$response" ".success" "true"; then
        print_pass "Retrieved activity logs"
    else
        print_fail "Failed to get activity logs" "$response"
    fi
    
    # Test A2: Get Recent Activity
    print_test "A2: Get Recent Activity"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/activity/recent?limit=5")
    if check_json_field "$response" ".success" "true"; then
        print_pass "Retrieved recent activity"
    else
        print_fail "Failed to get recent activity" "$response"
    fi
    
    # Test A3: Get Activity Stats
    print_test "A3: Get Activity Stats"
    ((TESTS_RUN++))
    local response=$(make_request "GET" "$BASE_URL/api/v1/activity/stats")
    if check_json_field "$response" ".success" "true"; then
        print_pass "Retrieved activity stats"
    else
        print_fail "Failed to get activity stats" "$response"
    fi
}

test_quick() {
    print_header "QUICK SMOKE TESTS"
    
    # Health check
    print_test "Server Health"
    ((TESTS_RUN++))
    local status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
    if [ "$status" = "200" ]; then
        print_pass "Server is up (HTTP 200)"
    else
        print_fail "Server returned HTTP $status"
    fi
    
    # Auth check
    print_test "Auth Required"
    ((TESTS_RUN++))
    local status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/health")
    if [ "$status" = "401" ]; then
        print_pass "Auth required on protected endpoints"
    else
        print_fail "Expected 401, got $status"
    fi
    
    # Protected endpoint with auth
    if [ -n "$API_KEY" ]; then
        print_test "Authenticated Request"
        ((TESTS_RUN++))
        local response=$(make_request "GET" "$BASE_URL/api/v1/health")
        if check_json_field "$response" ".success" "true"; then
            print_pass "Authenticated request works"
        else
            print_fail "Authenticated request failed" "$response"
        fi
    fi
}

cleanup() {
    print_header "CLEANUP"
    
    if [ -n "$CREATED_CONTACT_ID" ]; then
        print_info "Cleaning up contact: $CREATED_CONTACT_ID"
        make_request "DELETE" "$BASE_URL/api/v1/contacts/$CREATED_CONTACT_ID" > /dev/null 2>&1
    fi
    
    if [ -n "$CREATED_COMPANY_ID" ]; then
        print_info "Cleaning up company: $CREATED_COMPANY_ID"
        make_request "DELETE" "$BASE_URL/api/v1/companies/$CREATED_COMPANY_ID" > /dev/null 2>&1
    fi
    
    if [ -n "$CREATED_CAMPAIGN_ID" ]; then
        print_info "Cleaning up campaign: $CREATED_CAMPAIGN_ID"
        make_request "DELETE" "$BASE_URL/api/v1/campaigns/$CREATED_CAMPAIGN_ID" > /dev/null 2>&1
    fi
    
    if [ -n "$CREATED_TEMPLATE_ID" ]; then
        print_info "Cleaning up template: $CREATED_TEMPLATE_ID"
        make_request "DELETE" "$BASE_URL/api/v1/templates/$CREATED_TEMPLATE_ID" > /dev/null 2>&1
    fi
    
    print_info "Cleanup complete"
}

print_summary() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}                        TEST SUMMARY                               ${BLUE}${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Total Tests:   $TESTS_RUN"
    echo -e "  ${GREEN}Passed:${NC}        $TESTS_PASSED"
    echo -e "  ${RED}Failed:${NC}        $TESTS_FAILED"
    echo -e "  ${YELLOW}Skipped:${NC}       $TESTS_SKIPPED"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "  ${GREEN}✓ All tests passed!${NC}"
    else
        echo -e "  ${RED}✗ Some tests failed${NC}"
    fi
    echo ""
}

# =====================================================
# Main Execution
# =====================================================

main() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}          JAMES OUTBOUND - E2E API TEST SUITE                      ${BLUE}${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Base URL: ${BLUE}$BASE_URL${NC}"
    echo -e "  API Key:  ${BLUE}${API_KEY:0:10}...${NC}"
    echo ""
    
    # Check prerequisites
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}Error: jq is required but not installed.${NC}"
        echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
        exit 1
    fi
    
    # Check server connectivity
    if ! curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" | grep -q "200"; then
        echo -e "${RED}Error: Cannot connect to $BASE_URL${NC}"
        echo "Make sure the server is running with: npm run dev"
        exit 1
    fi
    
    # Parse command line argument
    local test_suite="${1:-all}"
    
    case "$test_suite" in
        "health")
            test_health
            ;;
        "contacts")
            test_contacts
            ;;
        "companies")
            test_companies
            ;;
        "campaigns")
            test_campaigns
            ;;
        "settings")
            test_settings
            ;;
        "jobs")
            test_jobs
            ;;
        "templates")
            test_templates
            ;;
        "metrics")
            test_metrics
            ;;
        "activity")
            test_activity
            ;;
        "quick")
            test_quick
            ;;
        "all")
            test_health
            test_contacts
            test_companies
            test_campaigns
            test_settings
            test_jobs
            test_templates
            test_metrics
            test_activity
            ;;
        *)
            echo "Usage: $0 [health|contacts|companies|campaigns|settings|jobs|templates|metrics|activity|quick|all]"
            exit 1
            ;;
    esac
    
    cleanup
    print_summary
    
    # Exit with error code if any tests failed
    if [ $TESTS_FAILED -gt 0 ]; then
        exit 1
    fi
}

# Run main with all arguments
main "$@"

