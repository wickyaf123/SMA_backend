/**
 * Apify Integration Types
 * Phase 3.5 - Google Maps Scraper
 */

/**
 * Google Maps search input for Apify actor
 */
export interface ApifyGoogleMapsInput {
  searchStringsArray: string[];
  locationQuery: string;
  maxCrawledPlacesPerSearch: number;
  language?: string;
  searchMatching?: 'all' | 'exact';
  placeMinimumStars?: string;
  website?: 'allPlaces' | 'withWebsite' | 'withoutWebsite';
  skipClosedPlaces?: boolean;
  scrapePlaceDetailPage?: boolean;
  scrapeTableReservationProvider?: boolean;
  includeWebResults?: boolean;
  scrapeDirectories?: boolean;
  maxQuestions?: number;
  scrapeContacts?: boolean;
  scrapeSocialMediaProfiles?: {
    facebooks?: boolean;
    instagrams?: boolean;
    youtubes?: boolean;
    tiktoks?: boolean;
    twitters?: boolean;
  };
  maximumLeadsEnrichmentRecords?: number;
  maxReviews?: number;
  reviewsSort?: 'newest' | 'mostRelevant' | 'highestRanking' | 'lowestRanking';
  reviewsFilterString?: string;
  reviewsOrigin?: 'all' | 'google' | 'tripadvisor';
  scrapeReviewsPersonalData?: boolean;
  maxImages?: number;
  scrapeImageAuthors?: boolean;
  allPlacesNoSearchAction?: string;
}

/**
 * Business listing result from Apify Google Maps scraper
 */
export interface ApifyBusinessListing {
  // Basic Info
  title: string;
  categoryName?: string;
  address?: string;
  addressParts?: {
    neighborhood?: string;
    street?: string;
    city?: string;
    postalCode?: string;
    state?: string;
    countryCode?: string;
  };
  
  // Location
  location?: {
    lat: number;
    lng: number;
  };
  
  // Contact
  phone?: string;
  phoneUnformatted?: string;
  website?: string;
  temporarilyClosed?: boolean;
  permanentlyClosed?: boolean;
  
  // Ratings
  totalScore?: number;
  reviewsCount?: number;
  
  // Additional
  placeId?: string;
  url?: string;
  googleMapsUrl?: string;
  businessStatus?: string;
  categories?: string[];
  
  // Opening Hours
  openingHours?: Array<{
    day: string;
    hours: string;
  }>;
  
  // Images
  imageUrls?: string[];
  
  // Reviews (if scraped)
  reviews?: Array<{
    name: string;
    text: string;
    stars: number;
    publishedAtDate: string;
  }>;
  
  // Raw data
  [key: string]: any;
}

/**
 * Apify actor run response
 */
export interface ApifyActorRun {
  id: string;
  actId: string;
  userId: string;
  startedAt: string;
  finishedAt?: string;
  status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ABORTED';
  statusMessage?: string;
  isStatusMessageTerminal?: boolean;
  meta?: {
    origin: string;
    clientIp: string;
    userAgent: string;
  };
  stats?: {
    inputBodyLen?: number;
    restartCount?: number;
    resurrectCount?: number;
    memAvgBytes?: number;
    memMaxBytes?: number;
    memCurrentBytes?: number;
    cpuAvgUsage?: number;
    cpuMaxUsage?: number;
    cpuCurrentUsage?: number;
    netRxBytes?: number;
    netTxBytes?: number;
    durationMillis?: number;
    runTimeSecs?: number;
    metamorph?: number;
    computeUnits?: number;
  };
  options?: {
    build?: string;
    timeoutSecs?: number;
    memoryMbytes?: number;
  };
  buildId?: string;
  exitCode?: number;
  defaultKeyValueStoreId?: string;
  defaultDatasetId?: string;
  defaultRequestQueueId?: string;
  buildNumber?: string;
  containerUrl?: string;
  usageUsd?: number;
  usageTotalUsd?: number;
}

/**
 * Apify dataset list response
 */
export interface ApifyDatasetListResponse {
  items: ApifyBusinessListing[];
  count: number;
  offset: number;
  limit: number;
  total: number;
}

/**
 * Normalized contact from Apify scraping
 */
export interface NormalizedApifyContact {
  // Business Info
  businessName: string;
  category?: string;
  
  // Contact Info
  phone?: string;
  phoneFormatted?: string;
  website?: string;
  email?: string;
  
  // Address
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  
  // Location
  latitude?: number;
  longitude?: number;
  
  // Additional
  googleMapsUrl?: string;
  placeId?: string;
  rating?: number;
  reviewCount?: number;
  
  // Extended data fields
  socialProfiles?: Record<string, string>;
  reviews?: Array<{
    name: string;
    text: string;
    stars: number;
    publishedAtDate: string;
  }>;
  openingHours?: Array<{
    day: string;
    hours: string;
  }>;
  
  // Metadata
  dataSource: 'GOOGLE_MAPS';
  scrapedAt: Date;
  rawData: ApifyBusinessListing;
}

/**
 * Scraper job configuration
 */
export interface ScraperJobConfig {
  industry: string; // e.g., "HVAC"
  locations: string[]; // e.g., ["Austin, TX", "Dallas, TX"]
  maxPerLocation?: number; // default: 100
  skipClosed?: boolean; // default: true
  requirePhone?: boolean; // default: false
  requireWebsite?: boolean; // default: false
  minRating?: number; // e.g., 3.5
}

/**
 * Scraper job result
 */
export interface ScraperJobResult {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  config: ScraperJobConfig;
  
  // Results
  totalScraped: number;
  totalImported: number;
  duplicates: number;
  errors: number;
  
  // Timing
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  
  // Cost
  computeUnits?: number;
  costUsd?: number;
  
  // Details
  apifyRunId?: string;
  apifyDatasetId?: string;
  errorMessage?: string;
}

