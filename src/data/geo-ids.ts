/**
 * FIPS County Code + Zip Code Lookup
 * Maps city/county names to their FIPS GeoID codes and primary zip codes
 * Source: US Census Bureau, USPS
 *
 * Used by: lookup_geo_id tool, search_permits tool, scrapeByCity fallback
 */

export interface GeoIdEntry {
  geoId: string;
  county: string;
  state: string;
  stateAbbr: string;
  zips?: string[];
}

// Map of lowercase city/county name -> GeoIdEntry
// Keys use format: "city, state" (lowercase)
export const GEO_ID_MAP: Map<string, GeoIdEntry> = new Map([
  // ── Alabama ──────────────────────────────────────────────
  ['birmingham, al', { geoId: '01073', county: 'Jefferson County', state: 'Alabama', stateAbbr: 'AL', zips: ['35203', '35205', '35209', '35213', '35222'] }],
  ['huntsville, al', { geoId: '01089', county: 'Madison County', state: 'Alabama', stateAbbr: 'AL', zips: ['35801', '35802', '35805', '35806'] }],
  ['montgomery, al', { geoId: '01101', county: 'Montgomery County', state: 'Alabama', stateAbbr: 'AL', zips: ['36104', '36106', '36109', '36116'] }],
  ['mobile, al', { geoId: '01097', county: 'Mobile County', state: 'Alabama', stateAbbr: 'AL', zips: ['36602', '36604', '36606', '36608'] }],
  ['tuscaloosa, al', { geoId: '01125', county: 'Tuscaloosa County', state: 'Alabama', stateAbbr: 'AL', zips: ['35401', '35404', '35405', '35406'] }],
  ['hoover, al', { geoId: '01073', county: 'Jefferson County', state: 'Alabama', stateAbbr: 'AL', zips: ['35226', '35244'] }],
  ['dothan, al', { geoId: '01069', county: 'Houston County', state: 'Alabama', stateAbbr: 'AL', zips: ['36301', '36303', '36305'] }],
  ['auburn, al', { geoId: '01081', county: 'Lee County', state: 'Alabama', stateAbbr: 'AL', zips: ['36830', '36832'] }],

  // ── Alaska ───────────────────────────────────────────────
  ['anchorage, ak', { geoId: '02020', county: 'Anchorage Municipality', state: 'Alaska', stateAbbr: 'AK', zips: ['99501', '99502', '99503', '99504', '99507', '99508'] }],
  ['fairbanks, ak', { geoId: '02090', county: 'Fairbanks North Star Borough', state: 'Alaska', stateAbbr: 'AK', zips: ['99701', '99709'] }],
  ['juneau, ak', { geoId: '02110', county: 'Juneau City and Borough', state: 'Alaska', stateAbbr: 'AK', zips: ['99801'] }],

  // ── Arizona ──────────────────────────────────────────────
  ['phoenix, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ', zips: ['85003', '85004', '85006', '85008', '85012', '85014', '85016', '85018', '85020', '85022', '85024', '85028', '85032', '85034', '85040', '85042', '85044', '85048', '85050', '85054'] }],
  ['tucson, az', { geoId: '04019', county: 'Pima County', state: 'Arizona', stateAbbr: 'AZ', zips: ['85701', '85710', '85711', '85712', '85713', '85716', '85718', '85719', '85730', '85741', '85743', '85745', '85748', '85749'] }],
  ['mesa, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ', zips: ['85201', '85202', '85203', '85204', '85205', '85206', '85207', '85208', '85209', '85210', '85212', '85213', '85215'] }],
  ['scottsdale, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ', zips: ['85250', '85251', '85253', '85254', '85255', '85257', '85258', '85259', '85260', '85262', '85266'] }],
  ['chandler, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ', zips: ['85224', '85225', '85226', '85248', '85249', '85286'] }],
  ['tempe, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ', zips: ['85281', '85282', '85283', '85284'] }],
  ['gilbert, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ', zips: ['85233', '85234', '85295', '85296', '85297', '85298'] }],
  ['glendale, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ', zips: ['85301', '85302', '85303', '85304', '85305', '85306', '85308', '85310'] }],
  ['peoria, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ', zips: ['85345', '85381', '85382', '85383'] }],
  ['surprise, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ', zips: ['85374', '85378', '85379', '85387', '85388'] }],
  ['goodyear, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ', zips: ['85338', '85395'] }],
  ['avondale, az', { geoId: '04013', county: 'Maricopa County', state: 'Arizona', stateAbbr: 'AZ', zips: ['85323', '85392'] }],
  ['flagstaff, az', { geoId: '04005', county: 'Coconino County', state: 'Arizona', stateAbbr: 'AZ', zips: ['86001', '86004'] }],
  ['yuma, az', { geoId: '04027', county: 'Yuma County', state: 'Arizona', stateAbbr: 'AZ', zips: ['85364', '85365', '85367'] }],
  ['prescott, az', { geoId: '04025', county: 'Yavapai County', state: 'Arizona', stateAbbr: 'AZ', zips: ['86301', '86303', '86305'] }],

  // ── Arkansas ─────────────────────────────────────────────
  ['little rock, ar', { geoId: '05119', county: 'Pulaski County', state: 'Arkansas', stateAbbr: 'AR', zips: ['72201', '72204', '72205', '72207', '72209', '72211', '72212'] }],
  ['fayetteville, ar', { geoId: '05143', county: 'Washington County', state: 'Arkansas', stateAbbr: 'AR', zips: ['72701', '72703', '72704'] }],
  ['fort smith, ar', { geoId: '05131', county: 'Sebastian County', state: 'Arkansas', stateAbbr: 'AR', zips: ['72901', '72903', '72904'] }],
  ['springdale, ar', { geoId: '05143', county: 'Washington County', state: 'Arkansas', stateAbbr: 'AR', zips: ['72762', '72764'] }],
  ['jonesboro, ar', { geoId: '05031', county: 'Craighead County', state: 'Arkansas', stateAbbr: 'AR', zips: ['72401', '72404'] }],

  // ── California ───────────────────────────────────────────
  ['los angeles, ca', { geoId: '06037', county: 'Los Angeles County', state: 'California', stateAbbr: 'CA', zips: ['90001', '90004', '90006', '90012', '90015', '90017', '90019', '90024', '90027', '90028', '90034', '90036', '90038', '90042', '90046', '90048', '90064', '90066', '90068', '90069', '90077', '90210', '90291', '90292', '90401', '90402'] }],
  ['la, ca', { geoId: '06037', county: 'Los Angeles County', state: 'California', stateAbbr: 'CA' }],
  ['san francisco, ca', { geoId: '06075', county: 'San Francisco County', state: 'California', stateAbbr: 'CA', zips: ['94102', '94103', '94104', '94105', '94107', '94108', '94109', '94110', '94112', '94114', '94115', '94116', '94117', '94118', '94121', '94122', '94123', '94124', '94127', '94131', '94132', '94133', '94134'] }],
  ['sf, ca', { geoId: '06075', county: 'San Francisco County', state: 'California', stateAbbr: 'CA' }],
  ['san diego, ca', { geoId: '06073', county: 'San Diego County', state: 'California', stateAbbr: 'CA', zips: ['92101', '92102', '92103', '92104', '92105', '92106', '92107', '92108', '92109', '92110', '92111', '92113', '92114', '92115', '92116', '92117', '92119', '92120', '92121', '92122', '92123', '92124', '92126', '92127', '92128', '92129', '92130', '92131'] }],
  ['san jose, ca', { geoId: '06085', county: 'Santa Clara County', state: 'California', stateAbbr: 'CA', zips: ['95110', '95111', '95112', '95113', '95116', '95117', '95118', '95119', '95120', '95121', '95122', '95123', '95124', '95125', '95126', '95127', '95128', '95129', '95130', '95131', '95132', '95133', '95134', '95135', '95136', '95138', '95139', '95148'] }],
  ['sacramento, ca', { geoId: '06067', county: 'Sacramento County', state: 'California', stateAbbr: 'CA', zips: ['95811', '95814', '95815', '95816', '95817', '95818', '95819', '95820', '95822', '95823', '95824', '95825', '95826', '95828', '95829', '95831', '95832', '95833', '95834', '95835', '95838'] }],
  ['fresno, ca', { geoId: '06019', county: 'Fresno County', state: 'California', stateAbbr: 'CA', zips: ['93701', '93702', '93703', '93704', '93705', '93706', '93710', '93711', '93720', '93721', '93722', '93726', '93727', '93728', '93730'] }],
  ['oakland, ca', { geoId: '06001', county: 'Alameda County', state: 'California', stateAbbr: 'CA', zips: ['94601', '94602', '94603', '94605', '94606', '94607', '94608', '94609', '94610', '94611', '94612', '94613', '94618', '94619', '94621'] }],
  ['long beach, ca', { geoId: '06037', county: 'Los Angeles County', state: 'California', stateAbbr: 'CA', zips: ['90802', '90803', '90804', '90805', '90806', '90807', '90808', '90810', '90813', '90814', '90815'] }],
  ['bakersfield, ca', { geoId: '06029', county: 'Kern County', state: 'California', stateAbbr: 'CA', zips: ['93301', '93304', '93305', '93306', '93307', '93308', '93309', '93311', '93312', '93313', '93314'] }],
  ['anaheim, ca', { geoId: '06059', county: 'Orange County', state: 'California', stateAbbr: 'CA', zips: ['92801', '92802', '92804', '92805', '92806', '92807'] }],
  ['riverside, ca', { geoId: '06065', county: 'Riverside County', state: 'California', stateAbbr: 'CA', zips: ['92501', '92503', '92504', '92505', '92506', '92507', '92508'] }],
  ['santa ana, ca', { geoId: '06059', county: 'Orange County', state: 'California', stateAbbr: 'CA', zips: ['92701', '92703', '92704', '92705', '92706', '92707'] }],
  ['irvine, ca', { geoId: '06059', county: 'Orange County', state: 'California', stateAbbr: 'CA', zips: ['92602', '92603', '92604', '92606', '92612', '92614', '92618', '92620'] }],
  ['stockton, ca', { geoId: '06077', county: 'San Joaquin County', state: 'California', stateAbbr: 'CA', zips: ['95202', '95203', '95204', '95205', '95206', '95207', '95209', '95210', '95212', '95219'] }],
  ['pasadena, ca', { geoId: '06037', county: 'Los Angeles County', state: 'California', stateAbbr: 'CA', zips: ['91101', '91103', '91104', '91105', '91106', '91107'] }],
  ['santa barbara, ca', { geoId: '06083', county: 'Santa Barbara County', state: 'California', stateAbbr: 'CA', zips: ['93101', '93103', '93105', '93109', '93110', '93111'] }],
  ['modesto, ca', { geoId: '06099', county: 'Stanislaus County', state: 'California', stateAbbr: 'CA', zips: ['95350', '95351', '95354', '95355', '95356', '95357', '95358'] }],
  ['fontana, ca', { geoId: '06071', county: 'San Bernardino County', state: 'California', stateAbbr: 'CA', zips: ['92335', '92336', '92337'] }],
  ['moreno valley, ca', { geoId: '06065', county: 'Riverside County', state: 'California', stateAbbr: 'CA', zips: ['92551', '92553', '92555', '92557'] }],
  ['santa clarita, ca', { geoId: '06037', county: 'Los Angeles County', state: 'California', stateAbbr: 'CA', zips: ['91321', '91350', '91351', '91354', '91355'] }],
  ['glendale, ca', { geoId: '06037', county: 'Los Angeles County', state: 'California', stateAbbr: 'CA', zips: ['91201', '91202', '91203', '91204', '91205', '91206', '91207', '91208'] }],
  ['huntington beach, ca', { geoId: '06059', county: 'Orange County', state: 'California', stateAbbr: 'CA', zips: ['92646', '92647', '92648', '92649'] }],
  ['santa rosa, ca', { geoId: '06097', county: 'Sonoma County', state: 'California', stateAbbr: 'CA', zips: ['95401', '95403', '95404', '95405', '95407', '95409'] }],
  ['oceanside, ca', { geoId: '06073', county: 'San Diego County', state: 'California', stateAbbr: 'CA', zips: ['92054', '92056', '92057', '92058'] }],
  ['rancho cucamonga, ca', { geoId: '06071', county: 'San Bernardino County', state: 'California', stateAbbr: 'CA', zips: ['91701', '91730', '91737', '91739'] }],
  ['ontario, ca', { geoId: '06071', county: 'San Bernardino County', state: 'California', stateAbbr: 'CA', zips: ['91761', '91762', '91764'] }],
  ['elk grove, ca', { geoId: '06067', county: 'Sacramento County', state: 'California', stateAbbr: 'CA', zips: ['95624', '95757', '95758'] }],
  ['corona, ca', { geoId: '06065', county: 'Riverside County', state: 'California', stateAbbr: 'CA', zips: ['92879', '92880', '92881', '92882', '92883'] }],
  ['lancaster, ca', { geoId: '06037', county: 'Los Angeles County', state: 'California', stateAbbr: 'CA', zips: ['93534', '93535', '93536'] }],
  ['palmdale, ca', { geoId: '06037', county: 'Los Angeles County', state: 'California', stateAbbr: 'CA', zips: ['93550', '93551', '93552'] }],
  ['salinas, ca', { geoId: '06053', county: 'Monterey County', state: 'California', stateAbbr: 'CA', zips: ['93901', '93905', '93906', '93907'] }],
  ['pomona, ca', { geoId: '06037', county: 'Los Angeles County', state: 'California', stateAbbr: 'CA', zips: ['91766', '91767', '91768'] }],
  ['escondido, ca', { geoId: '06073', county: 'San Diego County', state: 'California', stateAbbr: 'CA', zips: ['92025', '92026', '92027', '92029'] }],
  ['torrance, ca', { geoId: '06037', county: 'Los Angeles County', state: 'California', stateAbbr: 'CA', zips: ['90501', '90502', '90503', '90504', '90505'] }],
  ['sunnyvale, ca', { geoId: '06085', county: 'Santa Clara County', state: 'California', stateAbbr: 'CA', zips: ['94085', '94086', '94087', '94089'] }],
  ['roseville, ca', { geoId: '06061', county: 'Placer County', state: 'California', stateAbbr: 'CA', zips: ['95661', '95678', '95747'] }],
  ['visalia, ca', { geoId: '06107', county: 'Tulare County', state: 'California', stateAbbr: 'CA', zips: ['93277', '93291', '93292'] }],
  ['concord, ca', { geoId: '06013', county: 'Contra Costa County', state: 'California', stateAbbr: 'CA', zips: ['94518', '94519', '94520', '94521'] }],
  ['thousand oaks, ca', { geoId: '06111', county: 'Ventura County', state: 'California', stateAbbr: 'CA', zips: ['91320', '91360', '91362'] }],
  ['simi valley, ca', { geoId: '06111', county: 'Ventura County', state: 'California', stateAbbr: 'CA', zips: ['93063', '93065'] }],
  ['santa maria, ca', { geoId: '06083', county: 'Santa Barbara County', state: 'California', stateAbbr: 'CA', zips: ['93454', '93455', '93458'] }],
  ['victorville, ca', { geoId: '06071', county: 'San Bernardino County', state: 'California', stateAbbr: 'CA', zips: ['92392', '92394', '92395'] }],
  ['santa cruz, ca', { geoId: '06087', county: 'Santa Cruz County', state: 'California', stateAbbr: 'CA', zips: ['95060', '95062', '95064', '95065'] }],
  ['temecula, ca', { geoId: '06065', county: 'Riverside County', state: 'California', stateAbbr: 'CA', zips: ['92590', '92591', '92592'] }],
  ['vallejo, ca', { geoId: '06095', county: 'Solano County', state: 'California', stateAbbr: 'CA', zips: ['94589', '94590', '94591'] }],
  ['berkeley, ca', { geoId: '06001', county: 'Alameda County', state: 'California', stateAbbr: 'CA', zips: ['94702', '94703', '94704', '94705', '94707', '94708', '94709', '94710'] }],
  ['san bernardino, ca', { geoId: '06071', county: 'San Bernardino County', state: 'California', stateAbbr: 'CA', zips: ['92401', '92404', '92405', '92407', '92408', '92410', '92411'] }],
  ['murrieta, ca', { geoId: '06065', county: 'Riverside County', state: 'California', stateAbbr: 'CA', zips: ['92562', '92563'] }],
  ['clovis, ca', { geoId: '06019', county: 'Fresno County', state: 'California', stateAbbr: 'CA', zips: ['93611', '93612', '93619'] }],
  ['ventura, ca', { geoId: '06111', county: 'Ventura County', state: 'California', stateAbbr: 'CA', zips: ['93001', '93003', '93004'] }],
  ['oxnard, ca', { geoId: '06111', county: 'Ventura County', state: 'California', stateAbbr: 'CA', zips: ['93030', '93033', '93035', '93036'] }],
  ['santa clara, ca', { geoId: '06085', county: 'Santa Clara County', state: 'California', stateAbbr: 'CA', zips: ['95050', '95051', '95054'] }],
  ['fremont, ca', { geoId: '06001', county: 'Alameda County', state: 'California', stateAbbr: 'CA', zips: ['94536', '94538', '94539'] }],
  ['hayward, ca', { geoId: '06001', county: 'Alameda County', state: 'California', stateAbbr: 'CA', zips: ['94541', '94542', '94544', '94545'] }],

  // ── Colorado ─────────────────────────────────────────────
  ['denver, co', { geoId: '08031', county: 'Denver County', state: 'Colorado', stateAbbr: 'CO', zips: ['80202', '80203', '80204', '80205', '80206', '80207', '80209', '80210', '80211', '80212', '80216', '80218', '80219', '80220', '80222', '80223', '80224', '80227', '80230', '80231', '80235', '80236', '80237', '80238', '80239', '80246', '80247', '80249'] }],
  ['colorado springs, co', { geoId: '08041', county: 'El Paso County', state: 'Colorado', stateAbbr: 'CO', zips: ['80903', '80904', '80905', '80906', '80907', '80909', '80910', '80911', '80915', '80916', '80917', '80918', '80919', '80920', '80921', '80922', '80923', '80924', '80925', '80927', '80938', '80951'] }],
  ['aurora, co', { geoId: '08005', county: 'Arapahoe County', state: 'Colorado', stateAbbr: 'CO', zips: ['80010', '80011', '80012', '80013', '80014', '80015', '80016', '80017', '80018', '80019'] }],
  ['boulder, co', { geoId: '08013', county: 'Boulder County', state: 'Colorado', stateAbbr: 'CO', zips: ['80301', '80302', '80303', '80304', '80305'] }],
  ['fort collins, co', { geoId: '08069', county: 'Larimer County', state: 'Colorado', stateAbbr: 'CO', zips: ['80521', '80524', '80525', '80526', '80528'] }],
  ['lakewood, co', { geoId: '08059', county: 'Jefferson County', state: 'Colorado', stateAbbr: 'CO', zips: ['80214', '80215', '80226', '80228', '80232'] }],
  ['thornton, co', { geoId: '08001', county: 'Adams County', state: 'Colorado', stateAbbr: 'CO', zips: ['80229', '80233', '80241', '80260'] }],
  ['arvada, co', { geoId: '08059', county: 'Jefferson County', state: 'Colorado', stateAbbr: 'CO', zips: ['80002', '80003', '80004', '80005'] }],
  ['westminster, co', { geoId: '08059', county: 'Jefferson County', state: 'Colorado', stateAbbr: 'CO', zips: ['80020', '80021', '80023', '80030', '80031', '80234'] }],
  ['pueblo, co', { geoId: '08101', county: 'Pueblo County', state: 'Colorado', stateAbbr: 'CO', zips: ['81001', '81003', '81004', '81005', '81006', '81008'] }],
  ['longmont, co', { geoId: '08013', county: 'Boulder County', state: 'Colorado', stateAbbr: 'CO', zips: ['80501', '80503', '80504'] }],
  ['loveland, co', { geoId: '08069', county: 'Larimer County', state: 'Colorado', stateAbbr: 'CO', zips: ['80537', '80538'] }],
  ['greeley, co', { geoId: '08123', county: 'Weld County', state: 'Colorado', stateAbbr: 'CO', zips: ['80631', '80634'] }],

  // ── Connecticut ──────────────────────────────────────────
  ['hartford, ct', { geoId: '09003', county: 'Hartford County', state: 'Connecticut', stateAbbr: 'CT', zips: ['06101', '06103', '06105', '06106', '06112', '06114'] }],
  ['new haven, ct', { geoId: '09009', county: 'New Haven County', state: 'Connecticut', stateAbbr: 'CT', zips: ['06510', '06511', '06513', '06515', '06519'] }],
  ['stamford, ct', { geoId: '09001', county: 'Fairfield County', state: 'Connecticut', stateAbbr: 'CT', zips: ['06901', '06902', '06905', '06906', '06907'] }],
  ['bridgeport, ct', { geoId: '09001', county: 'Fairfield County', state: 'Connecticut', stateAbbr: 'CT', zips: ['06604', '06605', '06606', '06607', '06608', '06610'] }],
  ['waterbury, ct', { geoId: '09009', county: 'New Haven County', state: 'Connecticut', stateAbbr: 'CT', zips: ['06702', '06704', '06705', '06706', '06708', '06710'] }],
  ['norwalk, ct', { geoId: '09001', county: 'Fairfield County', state: 'Connecticut', stateAbbr: 'CT', zips: ['06850', '06851', '06853', '06854', '06855'] }],
  ['danbury, ct', { geoId: '09001', county: 'Fairfield County', state: 'Connecticut', stateAbbr: 'CT', zips: ['06810', '06811'] }],

  // ── Delaware ─────────────────────────────────────────────
  ['wilmington, de', { geoId: '10003', county: 'New Castle County', state: 'Delaware', stateAbbr: 'DE', zips: ['19801', '19802', '19803', '19804', '19805', '19806'] }],
  ['dover, de', { geoId: '10001', county: 'Kent County', state: 'Delaware', stateAbbr: 'DE', zips: ['19901', '19904'] }],

  // ── Florida ──────────────────────────────────────────────
  ['miami, fl', { geoId: '12086', county: 'Miami-Dade County', state: 'Florida', stateAbbr: 'FL', zips: ['33125', '33126', '33127', '33128', '33129', '33130', '33131', '33132', '33133', '33134', '33135', '33136', '33137', '33138', '33139', '33140', '33141', '33142', '33143', '33144', '33145', '33146', '33147', '33149', '33150', '33155', '33156', '33157', '33158', '33160', '33161', '33162', '33165', '33166', '33167', '33168', '33169', '33170', '33172', '33173', '33174', '33175', '33176', '33177', '33178', '33179', '33180', '33181', '33182', '33183', '33184', '33185', '33186', '33187', '33189', '33190', '33193', '33194', '33196'] }],
  ['orlando, fl', { geoId: '12095', county: 'Orange County', state: 'Florida', stateAbbr: 'FL', zips: ['32801', '32803', '32804', '32805', '32806', '32807', '32808', '32809', '32810', '32811', '32812', '32814', '32817', '32818', '32819', '32821', '32822', '32824', '32825', '32826', '32827', '32828', '32829', '32832', '32833', '32835', '32836', '32837', '32839'] }],
  ['tampa, fl', { geoId: '12057', county: 'Hillsborough County', state: 'Florida', stateAbbr: 'FL', zips: ['33602', '33603', '33604', '33605', '33606', '33607', '33609', '33610', '33611', '33612', '33613', '33614', '33615', '33616', '33617', '33618', '33619', '33624', '33625', '33626', '33629', '33634', '33635', '33637', '33647'] }],
  ['jacksonville, fl', { geoId: '12031', county: 'Duval County', state: 'Florida', stateAbbr: 'FL', zips: ['32202', '32204', '32205', '32206', '32207', '32208', '32209', '32210', '32211', '32212', '32216', '32217', '32218', '32219', '32220', '32221', '32222', '32223', '32224', '32225', '32226', '32227', '32233', '32234', '32244', '32246', '32250', '32254', '32256', '32257', '32258', '32266', '32277'] }],
  ['fort lauderdale, fl', { geoId: '12011', county: 'Broward County', state: 'Florida', stateAbbr: 'FL', zips: ['33301', '33304', '33305', '33306', '33308', '33309', '33311', '33312', '33313', '33314', '33315', '33316', '33317', '33319', '33321', '33322', '33323', '33324', '33325', '33326', '33327', '33328', '33330', '33331', '33332', '33334', '33351'] }],
  ['st. petersburg, fl', { geoId: '12103', county: 'Pinellas County', state: 'Florida', stateAbbr: 'FL', zips: ['33701', '33702', '33703', '33704', '33705', '33707', '33708', '33709', '33710', '33711', '33712', '33713', '33714', '33716'] }],
  ['west palm beach, fl', { geoId: '12099', county: 'Palm Beach County', state: 'Florida', stateAbbr: 'FL', zips: ['33401', '33403', '33404', '33405', '33406', '33407', '33409', '33411', '33412', '33413', '33414', '33415', '33417', '33418'] }],
  ['naples, fl', { geoId: '12021', county: 'Collier County', state: 'Florida', stateAbbr: 'FL', zips: ['34102', '34103', '34104', '34105', '34108', '34109', '34110', '34112', '34113', '34116', '34117', '34119', '34120'] }],
  ['sarasota, fl', { geoId: '12115', county: 'Sarasota County', state: 'Florida', stateAbbr: 'FL', zips: ['34231', '34232', '34233', '34234', '34235', '34236', '34237', '34238', '34239', '34240', '34241', '34242', '34243'] }],
  ['tallahassee, fl', { geoId: '12073', county: 'Leon County', state: 'Florida', stateAbbr: 'FL', zips: ['32301', '32303', '32304', '32305', '32308', '32309', '32310', '32311', '32312'] }],
  ['cape coral, fl', { geoId: '12071', county: 'Lee County', state: 'Florida', stateAbbr: 'FL', zips: ['33904', '33909', '33914', '33990', '33991', '33993'] }],
  ['gainesville, fl', { geoId: '12001', county: 'Alachua County', state: 'Florida', stateAbbr: 'FL', zips: ['32601', '32603', '32605', '32606', '32607', '32608', '32609', '32641'] }],
  ['pensacola, fl', { geoId: '12033', county: 'Escambia County', state: 'Florida', stateAbbr: 'FL', zips: ['32501', '32502', '32503', '32504', '32505', '32506', '32507', '32514'] }],
  ['port st. lucie, fl', { geoId: '12111', county: 'St. Lucie County', state: 'Florida', stateAbbr: 'FL', zips: ['34952', '34953', '34983', '34984', '34986', '34987'] }],
  ['coral springs, fl', { geoId: '12011', county: 'Broward County', state: 'Florida', stateAbbr: 'FL', zips: ['33065', '33067', '33071', '33073', '33076'] }],
  ['clearwater, fl', { geoId: '12103', county: 'Pinellas County', state: 'Florida', stateAbbr: 'FL', zips: ['33755', '33756', '33759', '33760', '33761', '33763', '33764', '33765'] }],
  ['lakeland, fl', { geoId: '12105', county: 'Polk County', state: 'Florida', stateAbbr: 'FL', zips: ['33801', '33803', '33805', '33809', '33810', '33811', '33813'] }],
  ['pompano beach, fl', { geoId: '12011', county: 'Broward County', state: 'Florida', stateAbbr: 'FL', zips: ['33060', '33062', '33063', '33064', '33069'] }],
  ['boca raton, fl', { geoId: '12099', county: 'Palm Beach County', state: 'Florida', stateAbbr: 'FL', zips: ['33428', '33431', '33432', '33433', '33434', '33486', '33487', '33496', '33498'] }],
  ['davie, fl', { geoId: '12011', county: 'Broward County', state: 'Florida', stateAbbr: 'FL', zips: ['33314', '33317', '33324', '33325', '33328', '33330'] }],
  ['palm bay, fl', { geoId: '12009', county: 'Brevard County', state: 'Florida', stateAbbr: 'FL', zips: ['32905', '32907', '32908', '32909'] }],
  ['melbourne, fl', { geoId: '12009', county: 'Brevard County', state: 'Florida', stateAbbr: 'FL', zips: ['32901', '32903', '32904', '32934', '32935', '32940'] }],
  ['ocala, fl', { geoId: '12083', county: 'Marion County', state: 'Florida', stateAbbr: 'FL', zips: ['34470', '34471', '34472', '34473', '34474', '34475', '34476', '34480', '34481', '34482'] }],

  // ── Georgia ──────────────────────────────────────────────
  ['atlanta, ga', { geoId: '13121', county: 'Fulton County', state: 'Georgia', stateAbbr: 'GA', zips: ['30303', '30305', '30306', '30307', '30308', '30309', '30310', '30311', '30312', '30313', '30314', '30315', '30316', '30317', '30318', '30319', '30324', '30326', '30327', '30331', '30332', '30336', '30337', '30339', '30340', '30341', '30342', '30344', '30345', '30349', '30350', '30354'] }],
  ['savannah, ga', { geoId: '13051', county: 'Chatham County', state: 'Georgia', stateAbbr: 'GA', zips: ['31401', '31404', '31405', '31406', '31407', '31408', '31410', '31419'] }],
  ['augusta, ga', { geoId: '13245', county: 'Richmond County', state: 'Georgia', stateAbbr: 'GA', zips: ['30901', '30904', '30906', '30907', '30909'] }],
  ['columbus, ga', { geoId: '13215', county: 'Muscogee County', state: 'Georgia', stateAbbr: 'GA', zips: ['31901', '31903', '31904', '31906', '31907', '31909'] }],
  ['macon, ga', { geoId: '13021', county: 'Bibb County', state: 'Georgia', stateAbbr: 'GA', zips: ['31201', '31204', '31206', '31210', '31211'] }],
  ['athens, ga', { geoId: '13059', county: 'Clarke County', state: 'Georgia', stateAbbr: 'GA', zips: ['30601', '30605', '30606', '30607'] }],
  ['sandy springs, ga', { geoId: '13121', county: 'Fulton County', state: 'Georgia', stateAbbr: 'GA', zips: ['30328', '30338', '30342', '30350'] }],
  ['roswell, ga', { geoId: '13121', county: 'Fulton County', state: 'Georgia', stateAbbr: 'GA', zips: ['30075', '30076', '30077'] }],
  ['marietta, ga', { geoId: '13067', county: 'Cobb County', state: 'Georgia', stateAbbr: 'GA', zips: ['30060', '30062', '30064', '30066', '30067', '30068'] }],

  // ── Hawaii ───────────────────────────────────────────────
  ['honolulu, hi', { geoId: '15003', county: 'Honolulu County', state: 'Hawaii', stateAbbr: 'HI', zips: ['96813', '96814', '96815', '96816', '96817', '96818', '96819', '96822', '96825', '96826'] }],

  // ── Idaho ────────────────────────────────────────────────
  ['boise, id', { geoId: '16001', county: 'Ada County', state: 'Idaho', stateAbbr: 'ID', zips: ['83702', '83703', '83704', '83705', '83706', '83709', '83712', '83713', '83714', '83716'] }],
  ['meridian, id', { geoId: '16001', county: 'Ada County', state: 'Idaho', stateAbbr: 'ID', zips: ['83642', '83646'] }],
  ['nampa, id', { geoId: '16027', county: 'Canyon County', state: 'Idaho', stateAbbr: 'ID', zips: ['83651', '83686', '83687'] }],
  ['idaho falls, id', { geoId: '16019', county: 'Bonneville County', state: 'Idaho', stateAbbr: 'ID', zips: ['83401', '83402', '83404'] }],

  // ── Illinois ─────────────────────────────────────────────
  ['chicago, il', { geoId: '17031', county: 'Cook County', state: 'Illinois', stateAbbr: 'IL', zips: ['60601', '60602', '60603', '60604', '60605', '60606', '60607', '60608', '60609', '60610', '60611', '60612', '60613', '60614', '60615', '60616', '60617', '60618', '60619', '60620', '60621', '60622', '60623', '60624', '60625', '60626', '60628', '60629', '60630', '60631', '60632', '60634', '60636', '60637', '60638', '60639', '60640', '60641', '60642', '60643', '60644', '60645', '60646', '60647', '60649', '60651', '60652', '60653', '60654', '60655', '60656', '60657', '60659', '60660', '60661'] }],
  ['naperville, il', { geoId: '17043', county: 'DuPage County', state: 'Illinois', stateAbbr: 'IL', zips: ['60540', '60563', '60564', '60565'] }],
  ['aurora, il', { geoId: '17089', county: 'Kane County', state: 'Illinois', stateAbbr: 'IL', zips: ['60502', '60503', '60504', '60505', '60506', '60507'] }],
  ['springfield, il', { geoId: '17167', county: 'Sangamon County', state: 'Illinois', stateAbbr: 'IL', zips: ['62701', '62702', '62703', '62704', '62707', '62711', '62712'] }],
  ['rockford, il', { geoId: '17201', county: 'Winnebago County', state: 'Illinois', stateAbbr: 'IL', zips: ['61101', '61102', '61103', '61104', '61107', '61108', '61109', '61114'] }],
  ['joliet, il', { geoId: '17197', county: 'Will County', state: 'Illinois', stateAbbr: 'IL', zips: ['60431', '60432', '60433', '60435', '60436'] }],
  ['elgin, il', { geoId: '17089', county: 'Kane County', state: 'Illinois', stateAbbr: 'IL', zips: ['60120', '60123', '60124'] }],
  ['peoria, il', { geoId: '17143', county: 'Peoria County', state: 'Illinois', stateAbbr: 'IL', zips: ['61602', '61603', '61604', '61605', '61606', '61614', '61615'] }],
  ['champaign, il', { geoId: '17019', county: 'Champaign County', state: 'Illinois', stateAbbr: 'IL', zips: ['61820', '61821', '61822'] }],
  ['waukegan, il', { geoId: '17097', county: 'Lake County', state: 'Illinois', stateAbbr: 'IL', zips: ['60085', '60087'] }],
  ['schaumburg, il', { geoId: '17031', county: 'Cook County', state: 'Illinois', stateAbbr: 'IL', zips: ['60173', '60194', '60195'] }],

  // ── Indiana ──────────────────────────────────────────────
  ['indianapolis, in', { geoId: '18097', county: 'Marion County', state: 'Indiana', stateAbbr: 'IN', zips: ['46201', '46202', '46203', '46204', '46205', '46208', '46214', '46216', '46217', '46218', '46219', '46220', '46221', '46222', '46224', '46225', '46226', '46227', '46228', '46229', '46231', '46234', '46235', '46236', '46237', '46239', '46240', '46241', '46250', '46254', '46256', '46259', '46260', '46268', '46278'] }],
  ['fort wayne, in', { geoId: '18003', county: 'Allen County', state: 'Indiana', stateAbbr: 'IN', zips: ['46802', '46803', '46804', '46805', '46806', '46807', '46808', '46809', '46814', '46815', '46816', '46818', '46819', '46825', '46835', '46845'] }],
  ['evansville, in', { geoId: '18163', county: 'Vanderburgh County', state: 'Indiana', stateAbbr: 'IN', zips: ['47710', '47711', '47712', '47713', '47714', '47715'] }],
  ['south bend, in', { geoId: '18141', county: 'St. Joseph County', state: 'Indiana', stateAbbr: 'IN', zips: ['46601', '46613', '46614', '46615', '46616', '46617', '46619', '46628', '46637'] }],
  ['carmel, in', { geoId: '18057', county: 'Hamilton County', state: 'Indiana', stateAbbr: 'IN', zips: ['46032', '46033', '46074', '46082'] }],
  ['fishers, in', { geoId: '18057', county: 'Hamilton County', state: 'Indiana', stateAbbr: 'IN', zips: ['46037', '46038'] }],

  // ── Iowa ─────────────────────────────────────────────────
  ['des moines, ia', { geoId: '19153', county: 'Polk County', state: 'Iowa', stateAbbr: 'IA', zips: ['50309', '50310', '50311', '50312', '50313', '50314', '50315', '50316', '50317', '50320', '50321'] }],
  ['cedar rapids, ia', { geoId: '19113', county: 'Linn County', state: 'Iowa', stateAbbr: 'IA', zips: ['52401', '52402', '52403', '52404', '52405'] }],
  ['davenport, ia', { geoId: '19163', county: 'Scott County', state: 'Iowa', stateAbbr: 'IA', zips: ['52801', '52802', '52803', '52804', '52806', '52807'] }],

  // ── Kansas ───────────────────────────────────────────────
  ['wichita, ks', { geoId: '20173', county: 'Sedgwick County', state: 'Kansas', stateAbbr: 'KS', zips: ['67202', '67203', '67204', '67207', '67208', '67209', '67210', '67211', '67212', '67213', '67214', '67215', '67216', '67217', '67218', '67219', '67220', '67226', '67228', '67230', '67235'] }],
  ['overland park, ks', { geoId: '20091', county: 'Johnson County', state: 'Kansas', stateAbbr: 'KS', zips: ['66204', '66207', '66209', '66210', '66211', '66212', '66213', '66214', '66221', '66223'] }],
  ['kansas city, ks', { geoId: '20209', county: 'Wyandotte County', state: 'Kansas', stateAbbr: 'KS', zips: ['66101', '66102', '66103', '66104', '66105', '66106', '66109', '66111', '66112'] }],
  ['olathe, ks', { geoId: '20091', county: 'Johnson County', state: 'Kansas', stateAbbr: 'KS', zips: ['66061', '66062'] }],
  ['topeka, ks', { geoId: '20177', county: 'Shawnee County', state: 'Kansas', stateAbbr: 'KS', zips: ['66603', '66604', '66605', '66606', '66607', '66608', '66609', '66610', '66611', '66614', '66615', '66616', '66617', '66618', '66619'] }],

  // ── Kentucky ─────────────────────────────────────────────
  ['louisville, ky', { geoId: '21111', county: 'Jefferson County', state: 'Kentucky', stateAbbr: 'KY', zips: ['40202', '40203', '40204', '40205', '40206', '40207', '40208', '40209', '40210', '40211', '40212', '40213', '40214', '40215', '40216', '40217', '40218', '40219', '40220', '40222', '40223', '40228', '40229', '40241', '40242', '40243', '40245', '40258', '40272', '40291', '40299'] }],
  ['lexington, ky', { geoId: '21067', county: 'Fayette County', state: 'Kentucky', stateAbbr: 'KY', zips: ['40502', '40503', '40504', '40505', '40507', '40508', '40509', '40510', '40511', '40513', '40514', '40515', '40516', '40517'] }],
  ['bowling green, ky', { geoId: '21227', county: 'Warren County', state: 'Kentucky', stateAbbr: 'KY', zips: ['42101', '42103', '42104'] }],

  // ── Louisiana ────────────────────────────────────────────
  ['new orleans, la', { geoId: '22071', county: 'Orleans Parish', state: 'Louisiana', stateAbbr: 'LA', zips: ['70112', '70113', '70114', '70115', '70116', '70117', '70118', '70119', '70122', '70124', '70125', '70126', '70127', '70128', '70129', '70130', '70131'] }],
  ['baton rouge, la', { geoId: '22033', county: 'East Baton Rouge Parish', state: 'Louisiana', stateAbbr: 'LA', zips: ['70801', '70802', '70803', '70805', '70806', '70807', '70808', '70809', '70810', '70811', '70812', '70814', '70815', '70816', '70817', '70819', '70820'] }],
  ['shreveport, la', { geoId: '22017', county: 'Caddo Parish', state: 'Louisiana', stateAbbr: 'LA', zips: ['71101', '71103', '71104', '71105', '71106', '71107', '71108', '71109', '71118', '71119'] }],
  ['lafayette, la', { geoId: '22055', county: 'Lafayette Parish', state: 'Louisiana', stateAbbr: 'LA', zips: ['70501', '70503', '70506', '70507', '70508'] }],

  // ── Maine ────────────────────────────────────────────────
  ['portland, me', { geoId: '23005', county: 'Cumberland County', state: 'Maine', stateAbbr: 'ME', zips: ['04101', '04102', '04103'] }],

  // ── Maryland ─────────────────────────────────────────────
  ['baltimore, md', { geoId: '24510', county: 'Baltimore City', state: 'Maryland', stateAbbr: 'MD', zips: ['21201', '21202', '21205', '21206', '21207', '21208', '21209', '21210', '21211', '21212', '21213', '21214', '21215', '21216', '21217', '21218', '21223', '21224', '21225', '21226', '21227', '21228', '21229', '21230', '21231', '21234', '21236', '21237', '21239'] }],
  ['bethesda, md', { geoId: '24031', county: 'Montgomery County', state: 'Maryland', stateAbbr: 'MD', zips: ['20814', '20816', '20817'] }],
  ['silver spring, md', { geoId: '24031', county: 'Montgomery County', state: 'Maryland', stateAbbr: 'MD', zips: ['20901', '20902', '20903', '20904', '20906', '20910'] }],
  ['rockville, md', { geoId: '24031', county: 'Montgomery County', state: 'Maryland', stateAbbr: 'MD', zips: ['20850', '20851', '20852', '20853'] }],
  ['frederick, md', { geoId: '24021', county: 'Frederick County', state: 'Maryland', stateAbbr: 'MD', zips: ['21701', '21702', '21703'] }],
  ['annapolis, md', { geoId: '24003', county: 'Anne Arundel County', state: 'Maryland', stateAbbr: 'MD', zips: ['21401', '21403', '21409'] }],

  // ── Massachusetts ────────────────────────────────────────
  ['boston, ma', { geoId: '25025', county: 'Suffolk County', state: 'Massachusetts', stateAbbr: 'MA', zips: ['02101', '02108', '02109', '02110', '02111', '02113', '02114', '02115', '02116', '02118', '02119', '02120', '02121', '02122', '02124', '02125', '02126', '02127', '02128', '02129', '02130', '02131', '02132', '02134', '02135', '02136', '02210', '02215'] }],
  ['cambridge, ma', { geoId: '25017', county: 'Middlesex County', state: 'Massachusetts', stateAbbr: 'MA', zips: ['02138', '02139', '02140', '02141', '02142'] }],
  ['worcester, ma', { geoId: '25027', county: 'Worcester County', state: 'Massachusetts', stateAbbr: 'MA', zips: ['01602', '01603', '01604', '01605', '01606', '01607', '01608', '01609', '01610'] }],
  ['springfield, ma', { geoId: '25013', county: 'Hampden County', state: 'Massachusetts', stateAbbr: 'MA', zips: ['01103', '01104', '01105', '01107', '01108', '01109'] }],
  ['lowell, ma', { geoId: '25017', county: 'Middlesex County', state: 'Massachusetts', stateAbbr: 'MA', zips: ['01850', '01851', '01852', '01854'] }],
  ['new bedford, ma', { geoId: '25005', county: 'Bristol County', state: 'Massachusetts', stateAbbr: 'MA', zips: ['02740', '02744', '02745', '02746'] }],

  // ── Michigan ─────────────────────────────────────────────
  ['detroit, mi', { geoId: '26163', county: 'Wayne County', state: 'Michigan', stateAbbr: 'MI', zips: ['48201', '48202', '48203', '48204', '48205', '48206', '48207', '48208', '48209', '48210', '48211', '48212', '48213', '48214', '48215', '48216', '48217', '48219', '48221', '48223', '48224', '48226', '48227', '48228', '48234', '48235', '48236', '48238', '48239'] }],
  ['grand rapids, mi', { geoId: '26081', county: 'Kent County', state: 'Michigan', stateAbbr: 'MI', zips: ['49503', '49504', '49505', '49506', '49507', '49508', '49509', '49512', '49525', '49534', '49544', '49546'] }],
  ['ann arbor, mi', { geoId: '26161', county: 'Washtenaw County', state: 'Michigan', stateAbbr: 'MI', zips: ['48103', '48104', '48105', '48108', '48109'] }],
  ['lansing, mi', { geoId: '26065', county: 'Ingham County', state: 'Michigan', stateAbbr: 'MI', zips: ['48906', '48910', '48911', '48912', '48915', '48917'] }],
  ['sterling heights, mi', { geoId: '26099', county: 'Macomb County', state: 'Michigan', stateAbbr: 'MI', zips: ['48310', '48311', '48312', '48313', '48314'] }],
  ['warren, mi', { geoId: '26099', county: 'Macomb County', state: 'Michigan', stateAbbr: 'MI', zips: ['48088', '48089', '48091', '48092', '48093'] }],
  ['kalamazoo, mi', { geoId: '26077', county: 'Kalamazoo County', state: 'Michigan', stateAbbr: 'MI', zips: ['49001', '49006', '49007', '49008', '49009', '49048'] }],
  ['flint, mi', { geoId: '26049', county: 'Genesee County', state: 'Michigan', stateAbbr: 'MI', zips: ['48502', '48503', '48504', '48505', '48506', '48507'] }],

  // ── Minnesota ────────────────────────────────────────────
  ['minneapolis, mn', { geoId: '27053', county: 'Hennepin County', state: 'Minnesota', stateAbbr: 'MN', zips: ['55401', '55402', '55403', '55404', '55405', '55406', '55407', '55408', '55409', '55410', '55411', '55412', '55413', '55414', '55415', '55416', '55417', '55418', '55419', '55420', '55421', '55422', '55423', '55424', '55425', '55426', '55427', '55428', '55429', '55430', '55431', '55432', '55433', '55435', '55436', '55437', '55438', '55439', '55441', '55442', '55443', '55444', '55445', '55446', '55447'] }],
  ['st. paul, mn', { geoId: '27123', county: 'Ramsey County', state: 'Minnesota', stateAbbr: 'MN', zips: ['55101', '55102', '55103', '55104', '55105', '55106', '55107', '55108', '55109', '55110', '55112', '55113', '55114', '55116', '55117', '55119', '55126', '55127', '55128', '55129', '55130'] }],
  ['rochester, mn', { geoId: '27109', county: 'Olmsted County', state: 'Minnesota', stateAbbr: 'MN', zips: ['55901', '55902', '55904', '55906'] }],
  ['bloomington, mn', { geoId: '27053', county: 'Hennepin County', state: 'Minnesota', stateAbbr: 'MN', zips: ['55420', '55425', '55431', '55435', '55437', '55438'] }],
  ['duluth, mn', { geoId: '27137', county: 'St. Louis County', state: 'Minnesota', stateAbbr: 'MN', zips: ['55802', '55803', '55804', '55805', '55806', '55807', '55808', '55810', '55811', '55812'] }],

  // ── Mississippi ──────────────────────────────────────────
  ['jackson, ms', { geoId: '28049', county: 'Hinds County', state: 'Mississippi', stateAbbr: 'MS', zips: ['39201', '39202', '39203', '39204', '39206', '39209', '39211', '39212', '39213'] }],
  ['gulfport, ms', { geoId: '28047', county: 'Harrison County', state: 'Mississippi', stateAbbr: 'MS', zips: ['39501', '39503', '39507'] }],

  // ── Missouri ─────────────────────────────────────────────
  ['kansas city, mo', { geoId: '29095', county: 'Jackson County', state: 'Missouri', stateAbbr: 'MO', zips: ['64101', '64102', '64105', '64106', '64108', '64109', '64110', '64111', '64112', '64113', '64114', '64116', '64117', '64118', '64119', '64120', '64123', '64124', '64125', '64126', '64127', '64128', '64129', '64130', '64131', '64132', '64133', '64134', '64136', '64137', '64138', '64139', '64145', '64146', '64149', '64151', '64152', '64153', '64154', '64155', '64156', '64157', '64158'] }],
  ['st. louis, mo', { geoId: '29510', county: 'St. Louis City', state: 'Missouri', stateAbbr: 'MO', zips: ['63101', '63102', '63103', '63104', '63106', '63107', '63108', '63109', '63110', '63111', '63112', '63113', '63115', '63116', '63118', '63119', '63120', '63130', '63133', '63135', '63136', '63137', '63138', '63139', '63143'] }],
  ['springfield, mo', { geoId: '29077', county: 'Greene County', state: 'Missouri', stateAbbr: 'MO', zips: ['65802', '65803', '65804', '65806', '65807', '65809', '65810'] }],
  ['columbia, mo', { geoId: '29019', county: 'Boone County', state: 'Missouri', stateAbbr: 'MO', zips: ['65201', '65202', '65203'] }],

  // ── Montana ──────────────────────────────────────────────
  ['billings, mt', { geoId: '30111', county: 'Yellowstone County', state: 'Montana', stateAbbr: 'MT', zips: ['59101', '59102', '59105', '59106'] }],
  ['missoula, mt', { geoId: '30063', county: 'Missoula County', state: 'Montana', stateAbbr: 'MT', zips: ['59801', '59802', '59803', '59808'] }],
  ['great falls, mt', { geoId: '30013', county: 'Cascade County', state: 'Montana', stateAbbr: 'MT', zips: ['59401', '59404', '59405'] }],
  ['helena, mt', { geoId: '30049', county: 'Lewis and Clark County', state: 'Montana', stateAbbr: 'MT', zips: ['59601', '59602'] }],

  // ── Nebraska ─────────────────────────────────────────────
  ['omaha, ne', { geoId: '31055', county: 'Douglas County', state: 'Nebraska', stateAbbr: 'NE', zips: ['68102', '68104', '68105', '68106', '68107', '68108', '68110', '68111', '68112', '68114', '68116', '68117', '68118', '68122', '68124', '68127', '68130', '68131', '68132', '68134', '68135', '68137', '68142', '68144', '68152', '68154', '68164'] }],
  ['lincoln, ne', { geoId: '31109', county: 'Lancaster County', state: 'Nebraska', stateAbbr: 'NE', zips: ['68502', '68503', '68504', '68505', '68506', '68507', '68508', '68510', '68512', '68516', '68520', '68521', '68522', '68523', '68524', '68526', '68528'] }],

  // ── Nevada ───────────────────────────────────────────────
  ['las vegas, nv', { geoId: '32003', county: 'Clark County', state: 'Nevada', stateAbbr: 'NV', zips: ['89101', '89102', '89103', '89104', '89106', '89107', '89108', '89109', '89110', '89113', '89115', '89117', '89118', '89119', '89120', '89121', '89122', '89123', '89128', '89129', '89130', '89131', '89134', '89135', '89138', '89139', '89141', '89142', '89143', '89144', '89145', '89146', '89147', '89148', '89149', '89156', '89166', '89178', '89179', '89183'] }],
  ['reno, nv', { geoId: '32031', county: 'Washoe County', state: 'Nevada', stateAbbr: 'NV', zips: ['89501', '89502', '89503', '89506', '89509', '89511', '89512', '89519', '89521', '89523'] }],
  ['henderson, nv', { geoId: '32003', county: 'Clark County', state: 'Nevada', stateAbbr: 'NV', zips: ['89002', '89011', '89012', '89014', '89015', '89044', '89052', '89074'] }],
  ['north las vegas, nv', { geoId: '32003', county: 'Clark County', state: 'Nevada', stateAbbr: 'NV', zips: ['89030', '89031', '89032', '89081', '89084', '89085', '89086'] }],
  ['sparks, nv', { geoId: '32031', county: 'Washoe County', state: 'Nevada', stateAbbr: 'NV', zips: ['89431', '89434', '89436', '89441'] }],

  // ── New Hampshire ────────────────────────────────────────
  ['manchester, nh', { geoId: '33011', county: 'Hillsborough County', state: 'New Hampshire', stateAbbr: 'NH', zips: ['03101', '03102', '03103', '03104'] }],
  ['nashua, nh', { geoId: '33011', county: 'Hillsborough County', state: 'New Hampshire', stateAbbr: 'NH', zips: ['03060', '03062', '03063', '03064'] }],
  ['concord, nh', { geoId: '33013', county: 'Merrimack County', state: 'New Hampshire', stateAbbr: 'NH', zips: ['03301', '03303'] }],

  // ── New Jersey ───────────────────────────────────────────
  ['newark, nj', { geoId: '34013', county: 'Essex County', state: 'New Jersey', stateAbbr: 'NJ', zips: ['07102', '07103', '07104', '07105', '07106', '07107', '07108', '07112', '07114'] }],
  ['jersey city, nj', { geoId: '34017', county: 'Hudson County', state: 'New Jersey', stateAbbr: 'NJ', zips: ['07302', '07304', '07305', '07306', '07307'] }],
  ['paterson, nj', { geoId: '34031', county: 'Passaic County', state: 'New Jersey', stateAbbr: 'NJ', zips: ['07501', '07502', '07503', '07504', '07505', '07513', '07514'] }],
  ['elizabeth, nj', { geoId: '34039', county: 'Union County', state: 'New Jersey', stateAbbr: 'NJ', zips: ['07201', '07202', '07206', '07208'] }],
  ['trenton, nj', { geoId: '34021', county: 'Mercer County', state: 'New Jersey', stateAbbr: 'NJ', zips: ['08608', '08609', '08610', '08611', '08618', '08619', '08628', '08638'] }],
  ['edison, nj', { geoId: '34023', county: 'Middlesex County', state: 'New Jersey', stateAbbr: 'NJ', zips: ['08817', '08818', '08820', '08837'] }],

  // ── New Mexico ───────────────────────────────────────────
  ['albuquerque, nm', { geoId: '35001', county: 'Bernalillo County', state: 'New Mexico', stateAbbr: 'NM', zips: ['87102', '87104', '87105', '87106', '87107', '87108', '87109', '87110', '87111', '87112', '87113', '87114', '87120', '87121', '87122', '87123'] }],
  ['santa fe, nm', { geoId: '35049', county: 'Santa Fe County', state: 'New Mexico', stateAbbr: 'NM', zips: ['87501', '87505', '87506', '87507', '87508'] }],
  ['las cruces, nm', { geoId: '35013', county: 'Dona Ana County', state: 'New Mexico', stateAbbr: 'NM', zips: ['88001', '88005', '88007', '88011', '88012'] }],
  ['rio rancho, nm', { geoId: '35043', county: 'Sandoval County', state: 'New Mexico', stateAbbr: 'NM', zips: ['87124', '87144'] }],

  // ── New York ─────────────────────────────────────────────
  ['new york, ny', { geoId: '36061', county: 'New York County', state: 'New York', stateAbbr: 'NY', zips: ['10001', '10002', '10003', '10004', '10005', '10006', '10007', '10009', '10010', '10011', '10012', '10013', '10014', '10016', '10017', '10018', '10019', '10020', '10021', '10022', '10023', '10024', '10025', '10026', '10027', '10028', '10029', '10030', '10031', '10032', '10033', '10034', '10035', '10036', '10037', '10038', '10039', '10040', '10044', '10065', '10069', '10075', '10128', '10280', '10282'] }],
  ['nyc, ny', { geoId: '36061', county: 'New York County', state: 'New York', stateAbbr: 'NY' }],
  ['brooklyn, ny', { geoId: '36047', county: 'Kings County', state: 'New York', stateAbbr: 'NY', zips: ['11201', '11203', '11204', '11205', '11206', '11207', '11208', '11209', '11210', '11211', '11212', '11213', '11214', '11215', '11216', '11217', '11218', '11219', '11220', '11221', '11222', '11223', '11224', '11225', '11226', '11228', '11229', '11230', '11231', '11232', '11233', '11234', '11235', '11236', '11237', '11238', '11239'] }],
  ['queens, ny', { geoId: '36081', county: 'Queens County', state: 'New York', stateAbbr: 'NY' }],
  ['bronx, ny', { geoId: '36005', county: 'Bronx County', state: 'New York', stateAbbr: 'NY' }],
  ['staten island, ny', { geoId: '36085', county: 'Richmond County', state: 'New York', stateAbbr: 'NY' }],
  ['buffalo, ny', { geoId: '36029', county: 'Erie County', state: 'New York', stateAbbr: 'NY', zips: ['14201', '14202', '14204', '14206', '14207', '14208', '14209', '14210', '14211', '14212', '14213', '14214', '14215', '14216', '14217', '14218', '14220', '14222', '14223', '14224', '14225', '14226', '14227'] }],
  ['rochester, ny', { geoId: '36055', county: 'Monroe County', state: 'New York', stateAbbr: 'NY', zips: ['14604', '14605', '14606', '14607', '14608', '14609', '14610', '14611', '14612', '14613', '14614', '14615', '14616', '14617', '14618', '14619', '14620', '14621', '14622', '14623', '14624', '14625', '14626'] }],
  ['albany, ny', { geoId: '36001', county: 'Albany County', state: 'New York', stateAbbr: 'NY', zips: ['12202', '12203', '12204', '12205', '12206', '12207', '12208', '12209', '12210', '12211'] }],
  ['long island, ny', { geoId: '36059', county: 'Nassau County', state: 'New York', stateAbbr: 'NY' }],
  ['westchester, ny', { geoId: '36119', county: 'Westchester County', state: 'New York', stateAbbr: 'NY' }],
  ['syracuse, ny', { geoId: '36067', county: 'Onondaga County', state: 'New York', stateAbbr: 'NY', zips: ['13202', '13203', '13204', '13205', '13206', '13207', '13208', '13209', '13210', '13211', '13212', '13214', '13215', '13219', '13224'] }],
  ['yonkers, ny', { geoId: '36119', county: 'Westchester County', state: 'New York', stateAbbr: 'NY', zips: ['10701', '10703', '10704', '10705', '10710'] }],
  ['white plains, ny', { geoId: '36119', county: 'Westchester County', state: 'New York', stateAbbr: 'NY', zips: ['10601', '10603', '10604', '10605', '10606', '10607'] }],

  // ── North Carolina ───────────────────────────────────────
  ['charlotte, nc', { geoId: '37119', county: 'Mecklenburg County', state: 'North Carolina', stateAbbr: 'NC', zips: ['28202', '28203', '28204', '28205', '28206', '28207', '28208', '28209', '28210', '28211', '28212', '28213', '28214', '28215', '28216', '28217', '28226', '28227', '28244', '28262', '28269', '28270', '28273', '28277', '28278', '28280', '28282'] }],
  ['raleigh, nc', { geoId: '37183', county: 'Wake County', state: 'North Carolina', stateAbbr: 'NC', zips: ['27601', '27603', '27604', '27605', '27606', '27607', '27608', '27609', '27610', '27612', '27613', '27614', '27615', '27616', '27617'] }],
  ['durham, nc', { geoId: '37063', county: 'Durham County', state: 'North Carolina', stateAbbr: 'NC', zips: ['27701', '27703', '27704', '27705', '27707', '27712', '27713'] }],
  ['greensboro, nc', { geoId: '37081', county: 'Guilford County', state: 'North Carolina', stateAbbr: 'NC', zips: ['27401', '27403', '27405', '27406', '27407', '27408', '27409', '27410', '27455'] }],
  ['asheville, nc', { geoId: '37021', county: 'Buncombe County', state: 'North Carolina', stateAbbr: 'NC', zips: ['28801', '28803', '28804', '28805', '28806'] }],
  ['winston-salem, nc', { geoId: '37067', county: 'Forsyth County', state: 'North Carolina', stateAbbr: 'NC', zips: ['27101', '27103', '27104', '27105', '27106', '27107', '27127'] }],
  ['fayetteville, nc', { geoId: '37051', county: 'Cumberland County', state: 'North Carolina', stateAbbr: 'NC', zips: ['28301', '28303', '28304', '28305', '28306', '28311', '28314'] }],
  ['wilmington, nc', { geoId: '37129', county: 'New Hanover County', state: 'North Carolina', stateAbbr: 'NC', zips: ['28401', '28403', '28405', '28409', '28411', '28412'] }],
  ['cary, nc', { geoId: '37183', county: 'Wake County', state: 'North Carolina', stateAbbr: 'NC', zips: ['27511', '27513', '27518', '27519'] }],

  // ── North Dakota ─────────────────────────────────────────
  ['fargo, nd', { geoId: '38017', county: 'Cass County', state: 'North Dakota', stateAbbr: 'ND', zips: ['58102', '58103', '58104'] }],
  ['bismarck, nd', { geoId: '38015', county: 'Burleigh County', state: 'North Dakota', stateAbbr: 'ND', zips: ['58501', '58503', '58504'] }],

  // ── Ohio ─────────────────────────────────────────────────
  ['columbus, oh', { geoId: '39049', county: 'Franklin County', state: 'Ohio', stateAbbr: 'OH', zips: ['43201', '43202', '43203', '43204', '43205', '43206', '43207', '43209', '43210', '43211', '43212', '43213', '43214', '43215', '43219', '43220', '43221', '43222', '43223', '43224', '43227', '43228', '43229', '43230', '43231', '43232', '43235'] }],
  ['cleveland, oh', { geoId: '39035', county: 'Cuyahoga County', state: 'Ohio', stateAbbr: 'OH', zips: ['44101', '44102', '44103', '44104', '44105', '44106', '44107', '44108', '44109', '44110', '44111', '44112', '44113', '44114', '44115', '44118', '44119', '44120', '44121', '44125', '44127', '44128', '44129', '44130', '44134', '44135', '44144'] }],
  ['cincinnati, oh', { geoId: '39061', county: 'Hamilton County', state: 'Ohio', stateAbbr: 'OH', zips: ['45201', '45202', '45203', '45204', '45205', '45206', '45207', '45208', '45209', '45210', '45211', '45212', '45213', '45214', '45215', '45216', '45217', '45219', '45220', '45223', '45224', '45225', '45226', '45227', '45229', '45230', '45231', '45232', '45233', '45236', '45237', '45238', '45239', '45240', '45241', '45242', '45243', '45244', '45245', '45246', '45247', '45248', '45249', '45251', '45252', '45255'] }],
  ['toledo, oh', { geoId: '39095', county: 'Lucas County', state: 'Ohio', stateAbbr: 'OH', zips: ['43604', '43605', '43606', '43607', '43608', '43609', '43610', '43611', '43612', '43613', '43614', '43615', '43620', '43623'] }],
  ['akron, oh', { geoId: '39153', county: 'Summit County', state: 'Ohio', stateAbbr: 'OH', zips: ['44301', '44302', '44303', '44304', '44305', '44306', '44307', '44310', '44311', '44312', '44313', '44314', '44319', '44320', '44321'] }],
  ['dayton, oh', { geoId: '39113', county: 'Montgomery County', state: 'Ohio', stateAbbr: 'OH', zips: ['45402', '45403', '45404', '45405', '45406', '45409', '45410', '45414', '45415', '45416', '45417', '45419', '45420', '45424', '45426', '45429', '45431', '45432', '45440'] }],

  // ── Oklahoma ─────────────────────────────────────────────
  ['oklahoma city, ok', { geoId: '40109', county: 'Oklahoma County', state: 'Oklahoma', stateAbbr: 'OK', zips: ['73102', '73103', '73104', '73105', '73106', '73107', '73108', '73109', '73110', '73111', '73112', '73114', '73115', '73116', '73117', '73118', '73119', '73120', '73121', '73122', '73127', '73128', '73129', '73130', '73131', '73132', '73134', '73135', '73139', '73141', '73142', '73145', '73149', '73150', '73159', '73160', '73162', '73165', '73170', '73173'] }],
  ['tulsa, ok', { geoId: '40143', county: 'Tulsa County', state: 'Oklahoma', stateAbbr: 'OK', zips: ['74103', '74104', '74105', '74106', '74107', '74108', '74110', '74112', '74114', '74115', '74116', '74119', '74120', '74126', '74127', '74128', '74129', '74130', '74132', '74133', '74134', '74135', '74136', '74137', '74145', '74146'] }],
  ['norman, ok', { geoId: '40027', county: 'Cleveland County', state: 'Oklahoma', stateAbbr: 'OK', zips: ['73019', '73026', '73069', '73071', '73072'] }],
  ['broken arrow, ok', { geoId: '40143', county: 'Tulsa County', state: 'Oklahoma', stateAbbr: 'OK', zips: ['74011', '74012', '74014'] }],
  ['edmond, ok', { geoId: '40109', county: 'Oklahoma County', state: 'Oklahoma', stateAbbr: 'OK', zips: ['73003', '73012', '73013', '73025', '73034'] }],

  // ── Oregon ───────────────────────────────────────────────
  ['portland, or', { geoId: '41051', county: 'Multnomah County', state: 'Oregon', stateAbbr: 'OR', zips: ['97201', '97202', '97203', '97204', '97205', '97206', '97209', '97210', '97211', '97212', '97213', '97214', '97215', '97216', '97217', '97218', '97219', '97220', '97221', '97222', '97223', '97225', '97227', '97229', '97230', '97231', '97232', '97233', '97236', '97239', '97266'] }],
  ['salem, or', { geoId: '41047', county: 'Marion County', state: 'Oregon', stateAbbr: 'OR', zips: ['97301', '97302', '97303', '97304', '97305', '97306', '97317'] }],
  ['eugene, or', { geoId: '41039', county: 'Lane County', state: 'Oregon', stateAbbr: 'OR', zips: ['97401', '97402', '97403', '97404', '97405'] }],
  ['bend, or', { geoId: '41017', county: 'Deschutes County', state: 'Oregon', stateAbbr: 'OR', zips: ['97701', '97702', '97703'] }],
  ['medford, or', { geoId: '41029', county: 'Jackson County', state: 'Oregon', stateAbbr: 'OR', zips: ['97501', '97504'] }],
  ['hillsboro, or', { geoId: '41067', county: 'Washington County', state: 'Oregon', stateAbbr: 'OR', zips: ['97123', '97124'] }],
  ['beaverton, or', { geoId: '41067', county: 'Washington County', state: 'Oregon', stateAbbr: 'OR', zips: ['97005', '97006', '97007', '97008'] }],

  // ── Pennsylvania ─────────────────────────────────────────
  ['philadelphia, pa', { geoId: '42101', county: 'Philadelphia County', state: 'Pennsylvania', stateAbbr: 'PA', zips: ['19102', '19103', '19104', '19106', '19107', '19109', '19111', '19112', '19114', '19115', '19116', '19118', '19119', '19120', '19121', '19122', '19123', '19124', '19125', '19126', '19127', '19128', '19129', '19130', '19131', '19132', '19133', '19134', '19135', '19136', '19137', '19138', '19139', '19140', '19141', '19142', '19143', '19144', '19145', '19146', '19147', '19148', '19149', '19150', '19151', '19152', '19153', '19154'] }],
  ['pittsburgh, pa', { geoId: '42003', county: 'Allegheny County', state: 'Pennsylvania', stateAbbr: 'PA', zips: ['15201', '15203', '15204', '15205', '15206', '15207', '15208', '15210', '15211', '15212', '15213', '15214', '15215', '15216', '15217', '15218', '15219', '15220', '15221', '15222', '15223', '15224', '15226', '15227', '15228', '15229', '15232', '15233', '15234', '15235', '15236', '15237', '15238', '15239'] }],
  ['allentown, pa', { geoId: '42077', county: 'Lehigh County', state: 'Pennsylvania', stateAbbr: 'PA', zips: ['18101', '18102', '18103', '18104', '18109'] }],
  ['reading, pa', { geoId: '42011', county: 'Berks County', state: 'Pennsylvania', stateAbbr: 'PA', zips: ['19601', '19602', '19604', '19605', '19606', '19607', '19608', '19610', '19611'] }],
  ['erie, pa', { geoId: '42049', county: 'Erie County', state: 'Pennsylvania', stateAbbr: 'PA', zips: ['16501', '16502', '16503', '16504', '16505', '16506', '16507', '16508', '16509', '16510', '16511'] }],
  ['harrisburg, pa', { geoId: '42043', county: 'Dauphin County', state: 'Pennsylvania', stateAbbr: 'PA', zips: ['17101', '17102', '17103', '17104', '17109', '17110', '17111', '17112'] }],
  ['scranton, pa', { geoId: '42069', county: 'Lackawanna County', state: 'Pennsylvania', stateAbbr: 'PA', zips: ['18503', '18504', '18505', '18508', '18509', '18510'] }],

  // ── Rhode Island ─────────────────────────────────────────
  ['providence, ri', { geoId: '44007', county: 'Providence County', state: 'Rhode Island', stateAbbr: 'RI', zips: ['02903', '02904', '02905', '02906', '02907', '02908', '02909', '02910', '02911', '02912', '02914'] }],
  ['cranston, ri', { geoId: '44007', county: 'Providence County', state: 'Rhode Island', stateAbbr: 'RI', zips: ['02910', '02920', '02921'] }],
  ['warwick, ri', { geoId: '44003', county: 'Kent County', state: 'Rhode Island', stateAbbr: 'RI', zips: ['02886', '02888', '02889'] }],

  // ── South Carolina ───────────────────────────────────────
  ['charleston, sc', { geoId: '45019', county: 'Charleston County', state: 'South Carolina', stateAbbr: 'SC', zips: ['29401', '29403', '29405', '29406', '29407', '29412', '29414', '29418'] }],
  ['columbia, sc', { geoId: '45079', county: 'Richland County', state: 'South Carolina', stateAbbr: 'SC', zips: ['29201', '29203', '29204', '29205', '29206', '29207', '29209', '29210', '29212', '29223', '29229'] }],
  ['greenville, sc', { geoId: '45045', county: 'Greenville County', state: 'South Carolina', stateAbbr: 'SC', zips: ['29601', '29605', '29607', '29609', '29611', '29615', '29617'] }],
  ['north charleston, sc', { geoId: '45019', county: 'Charleston County', state: 'South Carolina', stateAbbr: 'SC', zips: ['29405', '29406', '29418', '29420'] }],
  ['myrtle beach, sc', { geoId: '45051', county: 'Horry County', state: 'South Carolina', stateAbbr: 'SC', zips: ['29572', '29575', '29577', '29579', '29588'] }],

  // ── South Dakota ─────────────────────────────────────────
  ['sioux falls, sd', { geoId: '46099', county: 'Minnehaha County', state: 'South Dakota', stateAbbr: 'SD', zips: ['57103', '57104', '57105', '57106', '57107', '57108', '57110'] }],
  ['rapid city, sd', { geoId: '46103', county: 'Pennington County', state: 'South Dakota', stateAbbr: 'SD', zips: ['57701', '57702', '57703'] }],

  // ── Tennessee ────────────────────────────────────────────
  ['nashville, tn', { geoId: '47037', county: 'Davidson County', state: 'Tennessee', stateAbbr: 'TN', zips: ['37201', '37203', '37204', '37205', '37206', '37207', '37208', '37209', '37210', '37211', '37212', '37213', '37214', '37215', '37216', '37217', '37218', '37219', '37220', '37221', '37228'] }],
  ['memphis, tn', { geoId: '47157', county: 'Shelby County', state: 'Tennessee', stateAbbr: 'TN', zips: ['38103', '38104', '38105', '38106', '38107', '38108', '38109', '38111', '38112', '38114', '38115', '38116', '38117', '38118', '38119', '38120', '38122', '38125', '38126', '38127', '38128', '38131', '38132', '38133', '38134', '38135', '38138', '38139', '38141'] }],
  ['knoxville, tn', { geoId: '47093', county: 'Knox County', state: 'Tennessee', stateAbbr: 'TN', zips: ['37902', '37909', '37912', '37914', '37915', '37916', '37917', '37918', '37919', '37920', '37921', '37922', '37923', '37924', '37931', '37932', '37934'] }],
  ['chattanooga, tn', { geoId: '47065', county: 'Hamilton County', state: 'Tennessee', stateAbbr: 'TN', zips: ['37402', '37403', '37404', '37405', '37406', '37407', '37408', '37409', '37410', '37411', '37412', '37415', '37416', '37421'] }],
  ['clarksville, tn', { geoId: '47125', county: 'Montgomery County', state: 'Tennessee', stateAbbr: 'TN', zips: ['37040', '37042', '37043'] }],
  ['murfreesboro, tn', { geoId: '47149', county: 'Rutherford County', state: 'Tennessee', stateAbbr: 'TN', zips: ['37127', '37128', '37129', '37130'] }],
  ['franklin, tn', { geoId: '47187', county: 'Williamson County', state: 'Tennessee', stateAbbr: 'TN', zips: ['37064', '37067', '37069'] }],

  // ── Texas ────────────────────────────────────────────────
  ['houston, tx', { geoId: '48201', county: 'Harris County', state: 'Texas', stateAbbr: 'TX', zips: ['77001', '77002', '77003', '77004', '77005', '77006', '77007', '77008', '77009', '77010', '77011', '77012', '77013', '77014', '77015', '77016', '77017', '77018', '77019', '77020', '77021', '77022', '77023', '77024', '77025', '77026', '77027', '77028', '77029', '77030', '77031', '77032', '77033', '77034', '77035', '77036', '77037', '77038', '77039', '77040', '77041', '77042', '77043', '77044', '77045', '77046', '77047', '77048', '77049', '77050', '77051', '77053', '77054', '77055', '77056', '77057', '77058', '77059', '77060', '77061', '77062', '77063', '77064', '77065', '77066', '77067', '77068', '77069', '77070', '77071', '77072', '77073', '77074', '77075', '77076', '77077', '77078', '77079', '77080', '77081', '77082', '77083', '77084', '77085', '77086', '77087', '77088', '77089', '77090', '77091', '77092', '77093', '77094', '77095', '77096', '77098', '77099'] }],
  ['dallas, tx', { geoId: '48113', county: 'Dallas County', state: 'Texas', stateAbbr: 'TX', zips: ['75201', '75202', '75203', '75204', '75205', '75206', '75207', '75208', '75209', '75210', '75211', '75212', '75214', '75215', '75216', '75217', '75218', '75219', '75220', '75223', '75224', '75225', '75226', '75227', '75228', '75229', '75230', '75231', '75232', '75233', '75234', '75235', '75236', '75237', '75238', '75240', '75241', '75243', '75244', '75246', '75247', '75248', '75249', '75251', '75252', '75253', '75254'] }],
  ['san antonio, tx', { geoId: '48029', county: 'Bexar County', state: 'Texas', stateAbbr: 'TX', zips: ['78201', '78202', '78203', '78204', '78205', '78206', '78207', '78208', '78209', '78210', '78211', '78212', '78213', '78214', '78215', '78216', '78217', '78218', '78219', '78220', '78221', '78222', '78223', '78224', '78225', '78226', '78227', '78228', '78229', '78230', '78231', '78232', '78233', '78234', '78235', '78236', '78237', '78238', '78239', '78240', '78242', '78244', '78245', '78247', '78248', '78249', '78250', '78251', '78252', '78253', '78254', '78255', '78256', '78257', '78258', '78259', '78260', '78261', '78263', '78264', '78266'] }],
  ['austin, tx', { geoId: '48453', county: 'Travis County', state: 'Texas', stateAbbr: 'TX', zips: ['78701', '78702', '78703', '78704', '78705', '78712', '78717', '78719', '78721', '78722', '78723', '78724', '78725', '78726', '78727', '78728', '78729', '78730', '78731', '78732', '78733', '78734', '78735', '78736', '78737', '78738', '78739', '78741', '78742', '78744', '78745', '78746', '78747', '78748', '78749', '78750', '78751', '78752', '78753', '78754', '78756', '78757', '78758', '78759'] }],
  ['fort worth, tx', { geoId: '48439', county: 'Tarrant County', state: 'Texas', stateAbbr: 'TX', zips: ['76102', '76103', '76104', '76105', '76106', '76107', '76108', '76109', '76110', '76111', '76112', '76114', '76115', '76116', '76117', '76118', '76119', '76120', '76123', '76126', '76127', '76129', '76131', '76132', '76133', '76134', '76135', '76137', '76140', '76148', '76155', '76164', '76177', '76179', '76244'] }],
  ['el paso, tx', { geoId: '48141', county: 'El Paso County', state: 'Texas', stateAbbr: 'TX', zips: ['79901', '79902', '79903', '79904', '79905', '79906', '79907', '79908', '79911', '79912', '79915', '79920', '79922', '79924', '79925', '79927', '79928', '79930', '79932', '79934', '79935', '79936', '79938'] }],
  ['arlington, tx', { geoId: '48439', county: 'Tarrant County', state: 'Texas', stateAbbr: 'TX', zips: ['76001', '76002', '76006', '76010', '76011', '76012', '76013', '76014', '76015', '76016', '76017', '76018'] }],
  ['plano, tx', { geoId: '48085', county: 'Collin County', state: 'Texas', stateAbbr: 'TX', zips: ['75023', '75024', '75025', '75074', '75075', '75082', '75093'] }],
  ['irving, tx', { geoId: '48113', county: 'Dallas County', state: 'Texas', stateAbbr: 'TX', zips: ['75038', '75039', '75060', '75061', '75062', '75063'] }],
  ['frisco, tx', { geoId: '48085', county: 'Collin County', state: 'Texas', stateAbbr: 'TX', zips: ['75033', '75034', '75035', '75036'] }],
  ['mckinney, tx', { geoId: '48085', county: 'Collin County', state: 'Texas', stateAbbr: 'TX', zips: ['75069', '75070', '75071'] }],
  ['corpus christi, tx', { geoId: '48355', county: 'Nueces County', state: 'Texas', stateAbbr: 'TX', zips: ['78401', '78404', '78405', '78407', '78408', '78410', '78411', '78412', '78413', '78414', '78415', '78416', '78417', '78418'] }],
  ['laredo, tx', { geoId: '48479', county: 'Webb County', state: 'Texas', stateAbbr: 'TX', zips: ['78040', '78041', '78043', '78045', '78046'] }],
  ['lubbock, tx', { geoId: '48303', county: 'Lubbock County', state: 'Texas', stateAbbr: 'TX', zips: ['79401', '79403', '79404', '79407', '79410', '79411', '79412', '79413', '79414', '79415', '79416', '79423', '79424'] }],
  ['garland, tx', { geoId: '48113', county: 'Dallas County', state: 'Texas', stateAbbr: 'TX', zips: ['75040', '75041', '75042', '75043', '75044'] }],
  ['amarillo, tx', { geoId: '48375', county: 'Potter County', state: 'Texas', stateAbbr: 'TX', zips: ['79101', '79102', '79103', '79104', '79106', '79107', '79108', '79109', '79110', '79118', '79119', '79121', '79124'] }],
  ['grand prairie, tx', { geoId: '48113', county: 'Dallas County', state: 'Texas', stateAbbr: 'TX', zips: ['75050', '75051', '75052', '75053', '75054'] }],
  ['brownsville, tx', { geoId: '48061', county: 'Cameron County', state: 'Texas', stateAbbr: 'TX', zips: ['78520', '78521', '78526'] }],
  ['killeen, tx', { geoId: '48027', county: 'Bell County', state: 'Texas', stateAbbr: 'TX', zips: ['76541', '76542', '76543', '76544', '76549'] }],
  ['pasadena, tx', { geoId: '48201', county: 'Harris County', state: 'Texas', stateAbbr: 'TX', zips: ['77502', '77503', '77504', '77505', '77506'] }],
  ['mesquite, tx', { geoId: '48113', county: 'Dallas County', state: 'Texas', stateAbbr: 'TX', zips: ['75149', '75150'] }],
  ['mcallen, tx', { geoId: '48215', county: 'Hidalgo County', state: 'Texas', stateAbbr: 'TX', zips: ['78501', '78503', '78504'] }],
  ['midland, tx', { geoId: '48329', county: 'Midland County', state: 'Texas', stateAbbr: 'TX', zips: ['79701', '79703', '79705', '79706', '79707'] }],
  ['denton, tx', { geoId: '48121', county: 'Denton County', state: 'Texas', stateAbbr: 'TX', zips: ['76201', '76205', '76207', '76208', '76209', '76210'] }],
  ['round rock, tx', { geoId: '48491', county: 'Williamson County', state: 'Texas', stateAbbr: 'TX', zips: ['78664', '78665', '78681'] }],
  ['cedar park, tx', { geoId: '48491', county: 'Williamson County', state: 'Texas', stateAbbr: 'TX', zips: ['78613'] }],
  ['pflugerville, tx', { geoId: '48453', county: 'Travis County', state: 'Texas', stateAbbr: 'TX', zips: ['78660'] }],
  ['sugar land, tx', { geoId: '48157', county: 'Fort Bend County', state: 'Texas', stateAbbr: 'TX', zips: ['77478', '77479', '77498'] }],
  ['leander, tx', { geoId: '48491', county: 'Williamson County', state: 'Texas', stateAbbr: 'TX', zips: ['78641'] }],
  ['georgetown, tx', { geoId: '48491', county: 'Williamson County', state: 'Texas', stateAbbr: 'TX', zips: ['78626', '78628', '78633'] }],
  ['new braunfels, tx', { geoId: '48091', county: 'Comal County', state: 'Texas', stateAbbr: 'TX', zips: ['78130', '78132'] }],
  ['san marcos, tx', { geoId: '48209', county: 'Hays County', state: 'Texas', stateAbbr: 'TX', zips: ['78666'] }],
  ['beaumont, tx', { geoId: '48245', county: 'Jefferson County', state: 'Texas', stateAbbr: 'TX', zips: ['77701', '77702', '77703', '77705', '77706', '77707', '77708'] }],
  ['abilene, tx', { geoId: '48441', county: 'Taylor County', state: 'Texas', stateAbbr: 'TX', zips: ['79601', '79602', '79603', '79605', '79606'] }],
  ['odessa, tx', { geoId: '48135', county: 'Ector County', state: 'Texas', stateAbbr: 'TX', zips: ['79761', '79762', '79763', '79764', '79765'] }],
  ['waco, tx', { geoId: '48309', county: 'McLennan County', state: 'Texas', stateAbbr: 'TX', zips: ['76701', '76704', '76705', '76706', '76707', '76708', '76710', '76711', '76712'] }],
  ['tyler, tx', { geoId: '48423', county: 'Smith County', state: 'Texas', stateAbbr: 'TX', zips: ['75701', '75702', '75703', '75707', '75708', '75709'] }],

  // ── Utah ─────────────────────────────────────────────────
  ['salt lake city, ut', { geoId: '49035', county: 'Salt Lake County', state: 'Utah', stateAbbr: 'UT', zips: ['84101', '84102', '84103', '84104', '84105', '84106', '84107', '84108', '84109', '84111', '84112', '84113', '84115', '84116', '84117', '84118', '84119', '84120', '84121', '84123', '84124', '84128', '84129'] }],
  ['provo, ut', { geoId: '49049', county: 'Utah County', state: 'Utah', stateAbbr: 'UT', zips: ['84601', '84604', '84606'] }],
  ['west valley city, ut', { geoId: '49035', county: 'Salt Lake County', state: 'Utah', stateAbbr: 'UT', zips: ['84118', '84119', '84120', '84128'] }],
  ['west jordan, ut', { geoId: '49035', county: 'Salt Lake County', state: 'Utah', stateAbbr: 'UT', zips: ['84081', '84084', '84088'] }],
  ['orem, ut', { geoId: '49049', county: 'Utah County', state: 'Utah', stateAbbr: 'UT', zips: ['84057', '84058', '84097'] }],
  ['sandy, ut', { geoId: '49035', county: 'Salt Lake County', state: 'Utah', stateAbbr: 'UT', zips: ['84070', '84092', '84093', '84094'] }],
  ['ogden, ut', { geoId: '49057', county: 'Weber County', state: 'Utah', stateAbbr: 'UT', zips: ['84401', '84403', '84404', '84405'] }],
  ['st. george, ut', { geoId: '49053', county: 'Washington County', state: 'Utah', stateAbbr: 'UT', zips: ['84770', '84790'] }],
  ['layton, ut', { geoId: '49011', county: 'Davis County', state: 'Utah', stateAbbr: 'UT', zips: ['84040', '84041'] }],
  ['lehi, ut', { geoId: '49049', county: 'Utah County', state: 'Utah', stateAbbr: 'UT', zips: ['84043'] }],

  // ── Vermont ──────────────────────────────────────────────
  ['burlington, vt', { geoId: '50007', county: 'Chittenden County', state: 'Vermont', stateAbbr: 'VT', zips: ['05401', '05408'] }],

  // ── Virginia ─────────────────────────────────────────────
  ['richmond, va', { geoId: '51760', county: 'Richmond City', state: 'Virginia', stateAbbr: 'VA', zips: ['23219', '23220', '23221', '23222', '23223', '23224', '23225', '23226', '23227', '23228', '23229', '23230', '23231', '23234', '23235', '23236'] }],
  ['virginia beach, va', { geoId: '51810', county: 'Virginia Beach City', state: 'Virginia', stateAbbr: 'VA', zips: ['23451', '23452', '23453', '23454', '23455', '23456', '23457', '23460', '23461', '23462', '23464'] }],
  ['norfolk, va', { geoId: '51710', county: 'Norfolk City', state: 'Virginia', stateAbbr: 'VA', zips: ['23502', '23503', '23504', '23505', '23507', '23508', '23509', '23510', '23511', '23513', '23517', '23518', '23523'] }],
  ['arlington, va', { geoId: '51013', county: 'Arlington County', state: 'Virginia', stateAbbr: 'VA', zips: ['22201', '22202', '22203', '22204', '22205', '22206', '22207', '22209', '22213'] }],
  ['alexandria, va', { geoId: '51510', county: 'Alexandria City', state: 'Virginia', stateAbbr: 'VA', zips: ['22301', '22302', '22304', '22305', '22311', '22312', '22314'] }],
  ['chesapeake, va', { geoId: '51550', county: 'Chesapeake City', state: 'Virginia', stateAbbr: 'VA', zips: ['23320', '23321', '23322', '23323', '23324', '23325'] }],
  ['newport news, va', { geoId: '51700', county: 'Newport News City', state: 'Virginia', stateAbbr: 'VA', zips: ['23601', '23602', '23603', '23604', '23605', '23606', '23607', '23608'] }],
  ['hampton, va', { geoId: '51650', county: 'Hampton City', state: 'Virginia', stateAbbr: 'VA', zips: ['23661', '23663', '23664', '23666', '23669'] }],
  ['roanoke, va', { geoId: '51770', county: 'Roanoke City', state: 'Virginia', stateAbbr: 'VA', zips: ['24011', '24012', '24013', '24014', '24015', '24016', '24017', '24018', '24019'] }],

  // ── Washington ───────────────────────────────────────────
  ['seattle, wa', { geoId: '53033', county: 'King County', state: 'Washington', stateAbbr: 'WA', zips: ['98101', '98102', '98103', '98104', '98105', '98106', '98107', '98108', '98109', '98112', '98115', '98116', '98117', '98118', '98119', '98121', '98122', '98125', '98126', '98133', '98134', '98136', '98144', '98146', '98155', '98168', '98177', '98178', '98188', '98198', '98199'] }],
  ['tacoma, wa', { geoId: '53053', county: 'Pierce County', state: 'Washington', stateAbbr: 'WA', zips: ['98402', '98403', '98404', '98405', '98406', '98407', '98408', '98409', '98418', '98421', '98422', '98424', '98443', '98444', '98445', '98446', '98465', '98466', '98467'] }],
  ['spokane, wa', { geoId: '53063', county: 'Spokane County', state: 'Washington', stateAbbr: 'WA', zips: ['99201', '99202', '99203', '99204', '99205', '99206', '99207', '99208', '99212', '99217', '99218', '99223', '99224'] }],
  ['bellevue, wa', { geoId: '53033', county: 'King County', state: 'Washington', stateAbbr: 'WA', zips: ['98004', '98005', '98006', '98007', '98008'] }],
  ['vancouver, wa', { geoId: '53011', county: 'Clark County', state: 'Washington', stateAbbr: 'WA', zips: ['98660', '98661', '98662', '98663', '98664', '98665', '98682', '98683', '98684', '98685', '98686'] }],
  ['kent, wa', { geoId: '53033', county: 'King County', state: 'Washington', stateAbbr: 'WA', zips: ['98030', '98031', '98032', '98042'] }],
  ['everett, wa', { geoId: '53061', county: 'Snohomish County', state: 'Washington', stateAbbr: 'WA', zips: ['98201', '98203', '98204', '98208'] }],
  ['renton, wa', { geoId: '53033', county: 'King County', state: 'Washington', stateAbbr: 'WA', zips: ['98055', '98056', '98057', '98058', '98059'] }],
  ['federal way, wa', { geoId: '53033', county: 'King County', state: 'Washington', stateAbbr: 'WA', zips: ['98003', '98023'] }],
  ['olympia, wa', { geoId: '53067', county: 'Thurston County', state: 'Washington', stateAbbr: 'WA', zips: ['98501', '98502', '98506'] }],

  // ── Washington DC ────────────────────────────────────────
  ['washington, dc', { geoId: '11001', county: 'District of Columbia', state: 'District of Columbia', stateAbbr: 'DC', zips: ['20001', '20002', '20003', '20004', '20005', '20006', '20007', '20008', '20009', '20010', '20011', '20012', '20015', '20016', '20017', '20018', '20019', '20020', '20024', '20032', '20036', '20037'] }],
  ['dc', { geoId: '11001', county: 'District of Columbia', state: 'District of Columbia', stateAbbr: 'DC' }],

  // ── West Virginia ────────────────────────────────────────
  ['charleston, wv', { geoId: '54039', county: 'Kanawha County', state: 'West Virginia', stateAbbr: 'WV', zips: ['25301', '25302', '25303', '25304', '25309', '25311', '25312', '25314', '25315'] }],
  ['huntington, wv', { geoId: '54011', county: 'Cabell County', state: 'West Virginia', stateAbbr: 'WV', zips: ['25701', '25702', '25703', '25704', '25705'] }],

  // ── Wisconsin ────────────────────────────────────────────
  ['milwaukee, wi', { geoId: '55079', county: 'Milwaukee County', state: 'Wisconsin', stateAbbr: 'WI', zips: ['53202', '53203', '53204', '53205', '53206', '53207', '53208', '53209', '53210', '53211', '53212', '53213', '53214', '53215', '53216', '53218', '53219', '53220', '53221', '53222', '53223', '53224', '53225', '53226', '53227', '53228', '53233', '53235'] }],
  ['madison, wi', { geoId: '55025', county: 'Dane County', state: 'Wisconsin', stateAbbr: 'WI', zips: ['53703', '53704', '53705', '53706', '53711', '53713', '53714', '53715', '53716', '53717', '53718', '53719'] }],
  ['green bay, wi', { geoId: '55009', county: 'Brown County', state: 'Wisconsin', stateAbbr: 'WI', zips: ['54301', '54302', '54303', '54304', '54311', '54313'] }],
  ['kenosha, wi', { geoId: '55059', county: 'Kenosha County', state: 'Wisconsin', stateAbbr: 'WI', zips: ['53140', '53142', '53143', '53144'] }],
  ['racine, wi', { geoId: '55101', county: 'Racine County', state: 'Wisconsin', stateAbbr: 'WI', zips: ['53402', '53403', '53404', '53405', '53406'] }],
  ['appleton, wi', { geoId: '55087', county: 'Outagamie County', state: 'Wisconsin', stateAbbr: 'WI', zips: ['54911', '54913', '54914', '54915'] }],

  // ── Wyoming ──────────────────────────────────────────────
  ['cheyenne, wy', { geoId: '56021', county: 'Laramie County', state: 'Wyoming', stateAbbr: 'WY', zips: ['82001', '82007', '82009'] }],
  ['casper, wy', { geoId: '56025', county: 'Natrona County', state: 'Wyoming', stateAbbr: 'WY', zips: ['82601', '82604', '82609'] }],
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

  // Handle "City, ST" format in the city field
  let parsedCity = cityLower;
  if (!stateAbbr && cityLower.includes(',')) {
    const parts = cityLower.split(',').map(s => s.trim());
    parsedCity = parts[0];
    stateAbbr = parts[1]?.toUpperCase();
  }

  // Try exact match: "city, state"
  if (stateAbbr) {
    const key = `${parsedCity}, ${stateAbbr.toLowerCase()}`;
    const exact = GEO_ID_MAP.get(key);
    if (exact) return exact;
  }

  // Try just city name (no state) - may return multiple
  const matches: GeoIdEntry[] = [];
  for (const [key, entry] of GEO_ID_MAP.entries()) {
    const [keyCity] = key.split(', ');
    if (keyCity === parsedCity) {
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
    if (keyCity.includes(parsedCity) || parsedCity.includes(keyCity)) {
      if (!stateAbbr || entry.stateAbbr === stateAbbr) {
        matches.push(entry);
      }
    }
  }

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return matches;

  return null;
}

/**
 * Get zip codes for a city. Used as fallback when city-slug geo_id fails.
 */
export function getZipsForCity(city: string, state?: string): string[] {
  const result = lookupGeoId(city, state);
  if (!result) return [];
  if (Array.isArray(result)) return result[0]?.zips || [];
  return result.zips || [];
}
