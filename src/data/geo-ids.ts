/**
 * FIPS County Code Lookup
 * Maps city/county names to their FIPS GeoID codes
 * Source: US Census Bureau
 */

export interface GeoIdEntry {
  geoId: string;
  county: string;
  state: string;
  stateAbbr: string;
}

// Map of lowercase city/county name -> GeoIdEntry
// Keys use format: "city, state" or "county, state" (lowercase)
export const GEO_ID_MAP: Map<string, GeoIdEntry> = new Map([
  // Alabama
  ['birmingham, al', { geoId: '01073', county: 'Jefferson County', state: 'Alabama', stateAbbr: 'AL' }],
  ['huntsville, al', { geoId: '01089', county: 'Madison County', state: 'Alabama', stateAbbr: 'AL' }],
  ['montgomery, al', { geoId: '01101', county: 'Montgomery County', state: 'Alabama', stateAbbr: 'AL' }],
  ['mobile, al', { geoId: '01097', county: 'Mobile County', state: 'Alabama', stateAbbr: 'AL' }],

  // Arizona
  ['phoenix, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ' }],
  ['tucson, az', { geoId: '04019', county: 'Pima County', state: 'Arizona', stateAbbr: 'AZ' }],
  ['mesa, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ' }],
  ['scottsdale, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ' }],
  ['chandler, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ' }],
  ['tempe, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ' }],
  ['gilbert, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ' }],
  ['glendale, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ' }],

  // California
  ['los angeles, ca', { geoId: '06037', county: 'Los Angeles County', state: 'California', stateAbbr: 'CA' }],
  ['la, ca', { geoId: '06037', county: 'Los Angeles County', state: 'California', stateAbbr: 'CA' }],
  ['san francisco, ca', { geoId: '06075', county: 'San Francisco County', state: 'California', stateAbbr: 'CA' }],
  ['sf, ca', { geoId: '06075', county: 'San Francisco County', state: 'California', stateAbbr: 'CA' }],
  ['san diego, ca', { geoId: '06073', county: 'San Diego County', state: 'California', stateAbbr: 'CA' }],
  ['san jose, ca', { geoId: '06085', county: 'Santa Clara County', state: 'California', stateAbbr: 'CA' }],
  ['sacramento, ca', { geoId: '06067', county: 'Sacramento County', state: 'California', stateAbbr: 'CA' }],
  ['fresno, ca', { geoId: '06019', county: 'Fresno County', state: 'California', stateAbbr: 'CA' }],
  ['oakland, ca', { geoId: '06001', county: 'Alameda County', state: 'California', stateAbbr: 'CA' }],
  ['long beach, ca', { geoId: '06037', county: 'Los Angeles County', state: 'California', stateAbbr: 'CA' }],
  ['bakersfield, ca', { geoId: '06029', county: 'Kern County', state: 'California', stateAbbr: 'CA' }],
  ['anaheim, ca', { geoId: '06059', county: 'Orange County', state: 'California', stateAbbr: 'CA' }],
  ['riverside, ca', { geoId: '06065', county: 'Riverside County', state: 'California', stateAbbr: 'CA' }],
  ['santa ana, ca', { geoId: '06059', county: 'Orange County', state: 'California', stateAbbr: 'CA' }],
  ['irvine, ca', { geoId: '06059', county: 'Orange County', state: 'California', stateAbbr: 'CA' }],
  ['stockton, ca', { geoId: '06077', county: 'San Joaquin County', state: 'California', stateAbbr: 'CA' }],
  ['pasadena, ca', { geoId: '06037', county: 'Los Angeles County', state: 'California', stateAbbr: 'CA' }],
  ['santa barbara, ca', { geoId: '06083', county: 'Santa Barbara County', state: 'California', stateAbbr: 'CA' }],

  // Colorado
  ['denver, co', { geoId: '08031', county: 'Denver County', state: 'Colorado', stateAbbr: 'CO' }],
  ['colorado springs, co', { geoId: '08041', county: 'El Paso County', state: 'Colorado', stateAbbr: 'CO' }],
  ['aurora, co', { geoId: '08005', county: 'Arapahoe County', state: 'Colorado', stateAbbr: 'CO' }],
  ['boulder, co', { geoId: '08013', county: 'Boulder County', state: 'Colorado', stateAbbr: 'CO' }],
  ['fort collins, co', { geoId: '08069', county: 'Larimer County', state: 'Colorado', stateAbbr: 'CO' }],

  // Connecticut
  ['hartford, ct', { geoId: '09003', county: 'Hartford County', state: 'Connecticut', stateAbbr: 'CT' }],
  ['new haven, ct', { geoId: '09009', county: 'New Haven County', state: 'Connecticut', stateAbbr: 'CT' }],
  ['stamford, ct', { geoId: '09001', county: 'Fairfield County', state: 'Connecticut', stateAbbr: 'CT' }],

  // Florida
  ['miami, fl', { geoId: '12086', county: 'Miami-Dade County', state: 'Florida', stateAbbr: 'FL' }],
  ['orlando, fl', { geoId: '12095', county: 'Orange County', state: 'Florida', stateAbbr: 'FL' }],
  ['tampa, fl', { geoId: '12057', county: 'Hillsborough County', state: 'Florida', stateAbbr: 'FL' }],
  ['jacksonville, fl', { geoId: '12031', county: 'Duval County', state: 'Florida', stateAbbr: 'FL' }],
  ['fort lauderdale, fl', { geoId: '12011', county: 'Broward County', state: 'Florida', stateAbbr: 'FL' }],
  ['st. petersburg, fl', { geoId: '12103', county: 'Pinellas County', state: 'Florida', stateAbbr: 'FL' }],
  ['west palm beach, fl', { geoId: '12099', county: 'Palm Beach County', state: 'Florida', stateAbbr: 'FL' }],
  ['naples, fl', { geoId: '12021', county: 'Collier County', state: 'Florida', stateAbbr: 'FL' }],
  ['sarasota, fl', { geoId: '12115', county: 'Sarasota County', state: 'Florida', stateAbbr: 'FL' }],
  ['tallahassee, fl', { geoId: '12073', county: 'Leon County', state: 'Florida', stateAbbr: 'FL' }],
  ['cape coral, fl', { geoId: '12071', county: 'Lee County', state: 'Florida', stateAbbr: 'FL' }],
  ['gainesville, fl', { geoId: '12001', county: 'Alachua County', state: 'Florida', stateAbbr: 'FL' }],
  ['pensacola, fl', { geoId: '12033', county: 'Escambia County', state: 'Florida', stateAbbr: 'FL' }],

  // Georgia
  ['atlanta, ga', { geoId: '13121', county: 'Fulton County', state: 'Georgia', stateAbbr: 'GA' }],
  ['savannah, ga', { geoId: '13051', county: 'Chatham County', state: 'Georgia', stateAbbr: 'GA' }],
  ['augusta, ga', { geoId: '13245', county: 'Richmond County', state: 'Georgia', stateAbbr: 'GA' }],

  // Illinois
  ['chicago, il', { geoId: '17031', county: 'Cook County', state: 'Illinois', stateAbbr: 'IL' }],
  ['naperville, il', { geoId: '17043', county: 'DuPage County', state: 'Illinois', stateAbbr: 'IL' }],
  ['aurora, il', { geoId: '17089', county: 'Kane County', state: 'Illinois', stateAbbr: 'IL' }],
  ['springfield, il', { geoId: '17167', county: 'Sangamon County', state: 'Illinois', stateAbbr: 'IL' }],

  // Indiana
  ['indianapolis, in', { geoId: '18097', county: 'Marion County', state: 'Indiana', stateAbbr: 'IN' }],
  ['fort wayne, in', { geoId: '18003', county: 'Allen County', state: 'Indiana', stateAbbr: 'IN' }],

  // Louisiana
  ['new orleans, la', { geoId: '22071', county: 'Orleans Parish', state: 'Louisiana', stateAbbr: 'LA' }],
  ['baton rouge, la', { geoId: '22033', county: 'East Baton Rouge Parish', state: 'Louisiana', stateAbbr: 'LA' }],

  // Maryland
  ['baltimore, md', { geoId: '24510', county: 'Baltimore City', state: 'Maryland', stateAbbr: 'MD' }],
  ['bethesda, md', { geoId: '24031', county: 'Montgomery County', state: 'Maryland', stateAbbr: 'MD' }],

  // Massachusetts
  ['boston, ma', { geoId: '25025', county: 'Suffolk County', state: 'Massachusetts', stateAbbr: 'MA' }],
  ['cambridge, ma', { geoId: '25017', county: 'Middlesex County', state: 'Massachusetts', stateAbbr: 'MA' }],
  ['worcester, ma', { geoId: '25027', county: 'Worcester County', state: 'Massachusetts', stateAbbr: 'MA' }],

  // Michigan
  ['detroit, mi', { geoId: '26163', county: 'Wayne County', state: 'Michigan', stateAbbr: 'MI' }],
  ['grand rapids, mi', { geoId: '26081', county: 'Kent County', state: 'Michigan', stateAbbr: 'MI' }],
  ['ann arbor, mi', { geoId: '26161', county: 'Washtenaw County', state: 'Michigan', stateAbbr: 'MI' }],

  // Minnesota
  ['minneapolis, mn', { geoId: '27053', county: 'Hennepin County', state: 'Minnesota', stateAbbr: 'MN' }],
  ['st. paul, mn', { geoId: '27123', county: 'Ramsey County', state: 'Minnesota', stateAbbr: 'MN' }],

  // Missouri
  ['kansas city, mo', { geoId: '29095', county: 'Jackson County', state: 'Missouri', stateAbbr: 'MO' }],
  ['st. louis, mo', { geoId: '29510', county: 'St. Louis City', state: 'Missouri', stateAbbr: 'MO' }],

  // Nevada
  ['las vegas, nv', { geoId: '32003', county: 'Clark County', state: 'Nevada', stateAbbr: 'NV' }],
  ['reno, nv', { geoId: '32031', county: 'Washoe County', state: 'Nevada', stateAbbr: 'NV' }],
  ['henderson, nv', { geoId: '32003', county: 'Clark County', state: 'Nevada', stateAbbr: 'NV' }],

  // New Jersey
  ['newark, nj', { geoId: '34013', county: 'Essex County', state: 'New Jersey', stateAbbr: 'NJ' }],
  ['jersey city, nj', { geoId: '34017', county: 'Hudson County', state: 'New Jersey', stateAbbr: 'NJ' }],

  // New York
  ['new york, ny', { geoId: '36061', county: 'New York County', state: 'New York', stateAbbr: 'NY' }],
  ['nyc, ny', { geoId: '36061', county: 'New York County', state: 'New York', stateAbbr: 'NY' }],
  ['brooklyn, ny', { geoId: '36047', county: 'Kings County', state: 'New York', stateAbbr: 'NY' }],
  ['queens, ny', { geoId: '36081', county: 'Queens County', state: 'New York', stateAbbr: 'NY' }],
  ['bronx, ny', { geoId: '36005', county: 'Bronx County', state: 'New York', stateAbbr: 'NY' }],
  ['staten island, ny', { geoId: '36085', county: 'Richmond County', state: 'New York', stateAbbr: 'NY' }],
  ['buffalo, ny', { geoId: '36029', county: 'Erie County', state: 'New York', stateAbbr: 'NY' }],
  ['rochester, ny', { geoId: '36055', county: 'Monroe County', state: 'New York', stateAbbr: 'NY' }],
  ['albany, ny', { geoId: '36001', county: 'Albany County', state: 'New York', stateAbbr: 'NY' }],
  ['long island, ny', { geoId: '36059', county: 'Nassau County', state: 'New York', stateAbbr: 'NY' }],
  ['westchester, ny', { geoId: '36119', county: 'Westchester County', state: 'New York', stateAbbr: 'NY' }],

  // North Carolina
  ['charlotte, nc', { geoId: '37119', county: 'Mecklenburg County', state: 'North Carolina', stateAbbr: 'NC' }],
  ['raleigh, nc', { geoId: '37183', county: 'Wake County', state: 'North Carolina', stateAbbr: 'NC' }],
  ['durham, nc', { geoId: '37063', county: 'Durham County', state: 'North Carolina', stateAbbr: 'NC' }],
  ['greensboro, nc', { geoId: '37081', county: 'Guilford County', state: 'North Carolina', stateAbbr: 'NC' }],
  ['asheville, nc', { geoId: '37021', county: 'Buncombe County', state: 'North Carolina', stateAbbr: 'NC' }],

  // Ohio
  ['columbus, oh', { geoId: '39049', county: 'Franklin County', state: 'Ohio', stateAbbr: 'OH' }],
  ['cleveland, oh', { geoId: '39035', county: 'Cuyahoga County', state: 'Ohio', stateAbbr: 'OH' }],
  ['cincinnati, oh', { geoId: '39061', county: 'Hamilton County', state: 'Ohio', stateAbbr: 'OH' }],

  // Oregon
  ['portland, or', { geoId: '41051', county: 'Multnomah County', state: 'Oregon', stateAbbr: 'OR' }],
  ['salem, or', { geoId: '41047', county: 'Marion County', state: 'Oregon', stateAbbr: 'OR' }],
  ['eugene, or', { geoId: '41039', county: 'Lane County', state: 'Oregon', stateAbbr: 'OR' }],

  // Pennsylvania
  ['philadelphia, pa', { geoId: '42101', county: 'Philadelphia County', state: 'Pennsylvania', stateAbbr: 'PA' }],
  ['pittsburgh, pa', { geoId: '42003', county: 'Allegheny County', state: 'Pennsylvania', stateAbbr: 'PA' }],

  // South Carolina
  ['charleston, sc', { geoId: '45019', county: 'Charleston County', state: 'South Carolina', stateAbbr: 'SC' }],
  ['columbia, sc', { geoId: '45079', county: 'Richland County', state: 'South Carolina', stateAbbr: 'SC' }],

  // Tennessee
  ['nashville, tn', { geoId: '47037', county: 'Davidson County', state: 'Tennessee', stateAbbr: 'TN' }],
  ['memphis, tn', { geoId: '47157', county: 'Shelby County', state: 'Tennessee', stateAbbr: 'TN' }],
  ['knoxville, tn', { geoId: '47093', county: 'Knox County', state: 'Tennessee', stateAbbr: 'TN' }],
  ['chattanooga, tn', { geoId: '47065', county: 'Hamilton County', state: 'Tennessee', stateAbbr: 'TN' }],

  // Texas
  ['houston, tx', { geoId: '48201', county: 'Harris County', state: 'Texas', stateAbbr: 'TX' }],
  ['dallas, tx', { geoId: '48113', county: 'Dallas County', state: 'Texas', stateAbbr: 'TX' }],
  ['san antonio, tx', { geoId: '48029', county: 'Bexar County', state: 'Texas', stateAbbr: 'TX' }],
  ['austin, tx', { geoId: '48453', county: 'Travis County', state: 'Texas', stateAbbr: 'TX' }],
  ['fort worth, tx', { geoId: '48439', county: 'Tarrant County', state: 'Texas', stateAbbr: 'TX' }],
  ['el paso, tx', { geoId: '48141', county: 'El Paso County', state: 'Texas', stateAbbr: 'TX' }],
  ['arlington, tx', { geoId: '48439', county: 'Tarrant County', state: 'Texas', stateAbbr: 'TX' }],
  ['plano, tx', { geoId: '48085', county: 'Collin County', state: 'Texas', stateAbbr: 'TX' }],
  ['irving, tx', { geoId: '48113', county: 'Dallas County', state: 'Texas', stateAbbr: 'TX' }],
  ['frisco, tx', { geoId: '48085', county: 'Collin County', state: 'Texas', stateAbbr: 'TX' }],
  ['mckinney, tx', { geoId: '48085', county: 'Collin County', state: 'Texas', stateAbbr: 'TX' }],
  ['corpus christi, tx', { geoId: '48355', county: 'Nueces County', state: 'Texas', stateAbbr: 'TX' }],

  // Utah
  ['salt lake city, ut', { geoId: '49035', county: 'Salt Lake County', state: 'Utah', stateAbbr: 'UT' }],
  ['provo, ut', { geoId: '49049', county: 'Utah County', state: 'Utah', stateAbbr: 'UT' }],

  // Virginia
  ['richmond, va', { geoId: '51760', county: 'Richmond City', state: 'Virginia', stateAbbr: 'VA' }],
  ['virginia beach, va', { geoId: '51810', county: 'Virginia Beach City', state: 'Virginia', stateAbbr: 'VA' }],
  ['norfolk, va', { geoId: '51710', county: 'Norfolk City', state: 'Virginia', stateAbbr: 'VA' }],
  ['arlington, va', { geoId: '51013', county: 'Arlington County', state: 'Virginia', stateAbbr: 'VA' }],
  ['alexandria, va', { geoId: '51510', county: 'Alexandria City', state: 'Virginia', stateAbbr: 'VA' }],

  // Washington
  ['seattle, wa', { geoId: '53033', county: 'King County', state: 'Washington', stateAbbr: 'WA' }],
  ['tacoma, wa', { geoId: '53053', county: 'Pierce County', state: 'Washington', stateAbbr: 'WA' }],
  ['spokane, wa', { geoId: '53063', county: 'Spokane County', state: 'Washington', stateAbbr: 'WA' }],
  ['bellevue, wa', { geoId: '53033', county: 'King County', state: 'Washington', stateAbbr: 'WA' }],

  // Washington DC
  ['washington, dc', { geoId: '11001', county: 'District of Columbia', state: 'District of Columbia', stateAbbr: 'DC' }],
  ['dc', { geoId: '11001', county: 'District of Columbia', state: 'District of Columbia', stateAbbr: 'DC' }],

  // Wisconsin
  ['milwaukee, wi', { geoId: '55079', county: 'Milwaukee County', state: 'Wisconsin', stateAbbr: 'WI' }],
  ['madison, wi', { geoId: '55025', county: 'Dane County', state: 'Wisconsin', stateAbbr: 'WI' }],
]);

// State abbreviation to full name mapping
export const STATE_ABBR_MAP: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
  'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia',
};

/**
 * Look up a GeoID/FIPS code by city and state
 * Supports fuzzy matching: abbreviations, common nicknames, partial matches
 */
export function lookupGeoId(city: string, state?: string): GeoIdEntry | GeoIdEntry[] | null {
  const cityLower = city.toLowerCase().trim();
  const stateLower = state?.toLowerCase().trim();

  // Normalize state: convert full name to abbreviation
  let stateAbbr = stateLower?.toUpperCase();
  if (stateLower && stateLower.length > 2) {
    const entry = Object.entries(STATE_ABBR_MAP).find(
      ([, name]) => name.toLowerCase() === stateLower
    );
    if (entry) stateAbbr = entry[0];
  }

  // Try exact match: "city, state"
  if (stateAbbr) {
    const key = `${cityLower}, ${stateAbbr.toLowerCase()}`;
    const exact = GEO_ID_MAP.get(key);
    if (exact) return exact;
  }

  // Try just city name (no state) - may return multiple
  const matches: GeoIdEntry[] = [];
  for (const [key, entry] of GEO_ID_MAP.entries()) {
    const [keyCity] = key.split(', ');
    if (keyCity === cityLower) {
      if (!stateAbbr || entry.stateAbbr === stateAbbr) {
        matches.push(entry);
      }
    }
  }

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return matches;

  // Fuzzy: check if city contains or is contained in any key
  for (const [key, entry] of GEO_ID_MAP.entries()) {
    const [keyCity] = key.split(', ');
    if (keyCity.includes(cityLower) || cityLower.includes(keyCity)) {
      if (!stateAbbr || entry.stateAbbr === stateAbbr) {
        matches.push(entry);
      }
    }
  }

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return matches;

  return null;
}
