/**
 * Apify Data Normalizer
 * Converts Apify Google Maps data to our Contact/Company format
 */

import { logger } from '../../utils/logger';
import type {
  ApifyBusinessListing,
  NormalizedApifyContact,
} from './types';

/**
 * Extract domain from website URL
 */
function extractDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;

  try {
    // Add protocol if missing
    const urlWithProtocol = url.startsWith('http') ? url : `https://${url}`;
    const urlObj = new URL(urlWithProtocol);
    return urlObj.hostname.replace('www.', '');
  } catch (error) {
    logger.warn({ url, error }, 'Failed to extract domain from URL');
    return undefined;
  }
}

/**
 * Format phone number to E.164 format (best effort)
 */
function formatPhoneNumber(phone: string | undefined): string | undefined {
  if (!phone) return undefined;

  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, '');

  // If it's a US number (10 or 11 digits)
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `+${digitsOnly}`;
  }

  // Return original if we can't format it
  return phone;
}

/**
 * Normalize Apify business listing to our Contact format
 */
export function normalizeApifyListing(
  listing: ApifyBusinessListing
): NormalizedApifyContact | null {
  try {
    // Must have business name
    if (!listing.title) {
      logger.warn({ listing }, 'Skipping listing without title');
      return null;
    }

    // Extract address parts
    const addressParts = listing.addressParts || {};
    const city = addressParts.city || listing.address?.split(',')[1]?.trim();
    const state = addressParts.state;
    const postalCode = addressParts.postalCode;

    // Phone formatting
    const phoneRaw = listing.phoneUnformatted || listing.phone;
    const phoneFormatted = formatPhoneNumber(phoneRaw);

    // Website and domain
    const website = listing.website;
    const domain = extractDomain(website);

    // Extract email from Apify scraping (if scrapeContacts was enabled)
    const email = extractEmailFromListing(listing);
    
    // Extract social media profiles
    const socialProfiles = extractSocialProfiles(listing);
    
    // Extract reviews (if scraped)
    const reviews = listing.reviews?.slice(0, 5); // Top 5 reviews

    const normalized: NormalizedApifyContact = {
      // Business Info
      businessName: listing.title.trim(),
      category: listing.categoryName || listing.categories?.[0],

      // Contact Info
      phone: phoneRaw,
      phoneFormatted: phoneFormatted,
      website: website,
      email: email, // NOW extracted from Apify if available!

      // Address
      address: listing.address,
      city: city,
      state: state,
      postalCode: postalCode,
      country: addressParts.countryCode || 'US',

      // Location
      latitude: listing.location?.lat,
      longitude: listing.location?.lng,

      // Additional
      googleMapsUrl: listing.url || listing.googleMapsUrl,
      placeId: listing.placeId,
      rating: listing.totalScore,
      reviewCount: listing.reviewsCount,
      
      // Extended data
      socialProfiles: socialProfiles,
      reviews: reviews,
      openingHours: listing.openingHours,

      // Metadata
      dataSource: 'GOOGLE_MAPS',
      scrapedAt: new Date(),
      rawData: listing,
    };

    return normalized;
  } catch (error) {
    logger.error({ error, listing }, 'Failed to normalize Apify listing');
    return null;
  }
}

/**
 * Normalize multiple listings
 */
export function normalizeApifyListings(
  listings: ApifyBusinessListing[]
): NormalizedApifyContact[] {
  logger.info({ count: listings.length }, 'Normalizing Apify listings');

  const normalized = listings
    .map((listing) => normalizeApifyListing(listing))
    .filter((contact): contact is NormalizedApifyContact => contact !== null);

  logger.info(
    {
      input: listings.length,
      output: normalized.length,
      filtered: listings.length - normalized.length,
    },
    'Apify listings normalized'
  );

  return normalized;
}

/**
 * Filter listings by criteria
 */
export function filterApifyListings(
  listings: ApifyBusinessListing[],
  criteria: {
    minRating?: number;
    minReviews?: number;
    requirePhone?: boolean;
    requireWebsite?: boolean;
    excludeClosed?: boolean;
    categories?: string[];
  }
): ApifyBusinessListing[] {
  logger.info({ criteria, inputCount: listings.length }, 'Filtering Apify listings');

  let filtered = [...listings];

  // Filter by rating
  if (criteria.minRating !== undefined) {
    filtered = filtered.filter(
      (l) => (l.totalScore || 0) >= criteria.minRating!
    );
  }

  // Filter by review count
  if (criteria.minReviews !== undefined) {
    filtered = filtered.filter(
      (l) => (l.reviewsCount || 0) >= criteria.minReviews!
    );
  }

  // Filter by phone
  if (criteria.requirePhone) {
    filtered = filtered.filter((l) => l.phone || l.phoneUnformatted);
  }

  // Filter by website
  if (criteria.requireWebsite) {
    filtered = filtered.filter((l) => l.website);
  }

  // Filter closed places
  if (criteria.excludeClosed) {
    filtered = filtered.filter(
      (l) => !l.temporarilyClosed && !l.permanentlyClosed
    );
  }

  // Filter by categories
  if (criteria.categories && criteria.categories.length > 0) {
    filtered = filtered.filter((l) => {
      const listingCategories = [
        l.categoryName,
        ...(l.categories || []),
      ].filter(Boolean);

      return criteria.categories!.some((cat) =>
        listingCategories.some((lc) =>
          lc?.toLowerCase().includes(cat.toLowerCase())
        )
      );
    });
  }

  logger.info(
    {
      inputCount: listings.length,
      outputCount: filtered.length,
      filteredOut: listings.length - filtered.length,
    },
    'Apify listings filtered'
  );

  return filtered;
}

/**
 * Deduplicate listings by Google Place ID
 */
export function deduplicateByPlaceId(
  listings: ApifyBusinessListing[]
): ApifyBusinessListing[] {
  const seen = new Set<string>();
  const unique: ApifyBusinessListing[] = [];

  for (const listing of listings) {
    if (!listing.placeId) {
      // If no place ID, keep it (will be handled by contact deduplication later)
      unique.push(listing);
      continue;
    }

    if (!seen.has(listing.placeId)) {
      seen.add(listing.placeId);
      unique.push(listing);
    }
  }

  logger.info(
    {
      input: listings.length,
      unique: unique.length,
      duplicates: listings.length - unique.length,
    },
    'Deduplicated Apify listings by Place ID'
  );

  return unique;
}

/**
 * Convert normalized Apify contact to Contact creation data
 */
export function toContactCreateData(contact: NormalizedApifyContact) {
  return {
    // Contact fields
    firstName: undefined, // Will be enriched later
    lastName: undefined,
    fullName: undefined,
    email: contact.email,
    phone: contact.phone,
    phoneFormatted: contact.phoneFormatted,
    title: undefined,
    linkedinUrl: undefined,

    // Address
    city: contact.city,
    state: contact.state,
    postalCode: contact.postalCode,
    country: contact.country,

    // Metadata
    status: 'NEW' as const,
    dataSources: ['GOOGLE_MAPS'],
    dataQuality: calculateDataQuality(contact),

    // Company data
    company: {
      name: contact.businessName,
      domain: contact.website ? extractDomain(contact.website) : undefined,
      website: contact.website,
      address: contact.address,
      city: contact.city,
      state: contact.state,
      postalCode: contact.postalCode,
      country: contact.country,
      industry: contact.category,
      phone: contact.phone,
      latitude: contact.latitude,
      longitude: contact.longitude,
    },
  };
}

/**
 * Helper function to extract email from various fields
 */
function extractEmailFromListing(listing: ApifyBusinessListing): string | undefined {
  // Apify might put emails in different fields depending on scrapeContacts
  const email = listing.email 
    || (listing as any).emails?.[0] 
    || (listing as any).contactEmail
    || (listing as any).primaryEmail;
  
  if (email && isValidEmail(email)) {
    return email;
  }
  
  return undefined;
}

/**
 * Helper function to extract social profiles
 */
function extractSocialProfiles(listing: ApifyBusinessListing): Record<string, string> {
  const profiles: Record<string, string> = {};
  
  if ((listing as any).facebook) profiles.facebook = (listing as any).facebook;
  if ((listing as any).instagram) profiles.instagram = (listing as any).instagram;
  if ((listing as any).linkedin) profiles.linkedin = (listing as any).linkedin;
  if ((listing as any).twitter) profiles.twitter = (listing as any).twitter;
  if ((listing as any).youtube) profiles.youtube = (listing as any).youtube;
  if ((listing as any).tiktok) profiles.tiktok = (listing as any).tiktok;
  
  return profiles;
}

/**
 * Helper to validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Calculate data quality score (0-100)
 */
function calculateDataQuality(contact: NormalizedApifyContact): number {
  let score = 0;

  // Base score for having a name
  score += 20;

  // Phone number
  if (contact.phone) score += 25;
  if (contact.phoneFormatted) score += 5;

  // Website
  if (contact.website) score += 20;

  // Email
  if (contact.email) score += 25;

  // Address completeness
  if (contact.address) score += 5;
  if (contact.city) score += 2;
  if (contact.state) score += 2;
  if (contact.postalCode) score += 1;

  // Rating/Reviews (credibility)
  if (contact.rating && contact.rating >= 4) score += 5;
  if (contact.reviewCount && contact.reviewCount >= 10) score += 3;
  
  // Bonus for extended data
  if (contact.socialProfiles && Object.keys(contact.socialProfiles).length > 0) {
    score += 5; // Social media presence
  }
  if (contact.reviews && contact.reviews.length > 0) {
    score += 3; // Has customer reviews
  }

  return Math.min(score, 100);
}

