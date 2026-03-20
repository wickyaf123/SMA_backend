import type { ShovelsContractor, ShovelsEmployee, ShovelsPermit, ShovelsResident } from './types';

function computeDateFriendly(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

function computeMonthsAgo(dateStr: string | null): number | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    const now = new Date();
    return Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()));
  } catch { return null; }
}

export interface NormalizedShovelsContact {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phone: string | null;
  title: string | null;
  city: string | null;
  state: string | null;
  source: 'shovels';
  shovelsContractorId: string;
  shovelsEmployeeId: string | null;
  permitType: string | null;
  permitCity: string | null;
  licenseNumber: string | null;
  enrichmentData: Record<string, any>;
  companyName: string;
  companyCity: string | null;
  companyState: string | null;
  companyRevenue: string | null;
  // Promoted permit fields
  permitDate: string | null;
  permitDateFriendly: string | null;
  permitMonthsAgo: number | null;
  permitDescription: string | null;
  permitStatus: string | null;
  permitNumber: string | null;
  permitJobValue: number | null;
  permitFees: number | null;
  permitJurisdiction: string | null;
  // Promoted contractor fields
  avgJobValue: number | null;
  totalJobValue: number | null;
  permitCount: number | null;
  revenue: string | null;
  employeeCount: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  seniorityLevel: string | null;
  department: string | null;
  tagTally: Record<string, number> | null;
}

function extractPrimaryEmail(contractor: ShovelsContractor): string | null {
  if (contractor.primary_email) return contractor.primary_email;
  if (contractor.email) return contractor.email.split(',')[0].trim();
  return null;
}

function extractPrimaryPhone(contractor: ShovelsContractor): string | null {
  if (contractor.primary_phone) return contractor.primary_phone;
  if (contractor.phone) return contractor.phone.split(',')[0].trim();
  return null;
}

function extractTags(contractor: ShovelsContractor): string[] {
  if (!contractor.tag_tally) return [];
  return Object.keys(contractor.tag_tally);
}

function derivePrimaryPermitType(tagTally: Record<string, number> | null): string | null {
  if (!tagTally || Object.keys(tagTally).length === 0) return null;
  let maxTag: string | null = null;
  let maxCount = 0;
  for (const [tag, count] of Object.entries(tagTally)) {
    if (count > maxCount) {
      maxCount = count;
      maxTag = tag;
    }
  }
  return maxTag;
}

export interface EmployeeFilterConfig {
  seniorityFilter: string[];
  departmentFilter: string[];
  titleInclude: string[];
  titleExclude: string[];
}

export function passesEmployeeFilter(
  employee: ShovelsEmployee,
  config: EmployeeFilterConfig
): boolean {
  const title = (employee.job_title || '').toLowerCase();
  const seniority = (employee.seniority_level || '').toLowerCase();
  const department = (employee.department || '').toLowerCase();

  if (title && config.titleExclude.some(ex => title.includes(ex.toLowerCase()))) {
    return false;
  }

  const hasNoData = !employee.seniority_level && !employee.department && !employee.job_title;
  if (hasNoData) return true;

  if (seniority && config.seniorityFilter.some(s => seniority === s.toLowerCase())) return true;
  if (department && config.departmentFilter.some(d => department.toLowerCase().includes(d.toLowerCase()))) return true;
  if (title && config.titleInclude.some(inc => title.includes(inc.toLowerCase()))) return true;

  return false;
}

function parseContractorName(contractor: ShovelsContractor): { firstName: string | null; lastName: string | null } {
  const name = contractor.name || contractor.business_name || '';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function normalizeContractor(
  contractor: ShovelsContractor,
  searchParams: { permitType?: string; city?: string },
  mostRecentPermit?: ShovelsPermit | null
): NormalizedShovelsContact {
  const { firstName, lastName } = parseContractorName(contractor);
  const companyName = contractor.business_name || contractor.name || 'Unknown';
  const tags = extractTags(contractor);
  const primaryPermitType = derivePrimaryPermitType(contractor.tag_tally);

  const rawPermitDate = mostRecentPermit?.issue_date || mostRecentPermit?.file_date || mostRecentPermit?.start_date || mostRecentPermit?.first_seen_date || null;

  return {
    email: extractPrimaryEmail(contractor),
    firstName,
    lastName,
    fullName: contractor.name || null,
    phone: extractPrimaryPhone(contractor),
    title: null,
    city: contractor.address?.city || null,
    state: contractor.address?.state || null,
    source: 'shovels',
    shovelsContractorId: contractor.id,
    shovelsEmployeeId: null,
    permitType: searchParams.permitType || tags[0] || null,
    permitCity: searchParams.city || contractor.address?.city || null,
    licenseNumber: contractor.license || null,
    // Promoted permit fields
    permitDate: rawPermitDate,
    permitDateFriendly: computeDateFriendly(rawPermitDate),
    permitMonthsAgo: computeMonthsAgo(rawPermitDate),
    permitDescription: mostRecentPermit?.description || null,
    permitStatus: mostRecentPermit?.status || null,
    permitNumber: mostRecentPermit?.number || null,
    permitJobValue: mostRecentPermit?.job_value ?? null,
    permitFees: mostRecentPermit?.fees ?? null,
    permitJurisdiction: mostRecentPermit?.jurisdiction || null,
    // Promoted contractor fields
    avgJobValue: contractor.avg_job_value ?? null,
    totalJobValue: contractor.total_job_value ?? null,
    permitCount: contractor.permit_count ?? null,
    revenue: contractor.revenue || null,
    employeeCount: contractor.employee_count || null,
    website: contractor.website || null,
    rating: contractor.rating ?? null,
    reviewCount: contractor.review_count ?? null,
    seniorityLevel: null,
    department: null,
    tagTally: contractor.tag_tally || null,
    enrichmentData: {
      avgConstructionDuration: contractor.avg_construction_duration,
      avgInspectionPassRate: contractor.avg_inspection_pass_rate,
      licenseNumber: contractor.license,
      tags,
      primaryPermitType,
      shovelsContractorId: contractor.id,
      allEmails: contractor.email,
      allPhones: contractor.phone,
      linkedinUrl: contractor.linkedin_url,
    },
    companyName,
    companyCity: contractor.address?.city || null,
    companyState: contractor.address?.state || null,
    companyRevenue: contractor.revenue || null,
  };
}

function resolveEmployeeEmail(
  employee: ShovelsEmployee,
  contractor: ShovelsContractor
): { email: string | null; emailSource: string | null } {
  if (employee.business_email) return { email: employee.business_email, emailSource: 'shovels_business' };
  if (employee.email) return { email: employee.email, emailSource: 'shovels_personal' };
  if (contractor.primary_email) return { email: contractor.primary_email, emailSource: 'shovels_contractor' };
  if (contractor.email) return { email: contractor.email.split(',')[0].trim(), emailSource: 'shovels_contractor' };
  return { email: null, emailSource: null };
}

function resolveEmployeePhone(
  employee: ShovelsEmployee,
  contractor: ShovelsContractor
): string | null {
  if (employee.phone) return employee.phone;
  return extractPrimaryPhone(contractor);
}

function parseEmployeeName(employee: ShovelsEmployee): { firstName: string | null; lastName: string | null } {
  const name = employee.name || '';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export interface NormalizedHomeowner {
  shovelsResidentId: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  county: string | null;
  gender: string | null;
  ageRange: string | null;
  isMarried: boolean | null;
  hasChildren: boolean | null;
  incomeRange: string | null;
  netWorth: string | null;
  education: string | null;
  homeownerFlag: string | null;
  propertyValue: string | null;
  propertyType: string | null;
  yearBuilt: string | null;
  lotSize: string | null;
  livingArea: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  permitIds: string[];
  geoId: string;
}

export function normalizeResident(
  resident: ShovelsResident,
  geoId: string
): NormalizedHomeowner {
  return {
    shovelsResidentId: resident.id,
    firstName: resident.first_name || null,
    lastName: resident.last_name || null,
    fullName: resident.name || [resident.first_name, resident.last_name].filter(Boolean).join(' ') || null,
    email: resident.email || null,
    phone: resident.phone || null,
    street: [resident.street_no, resident.street].filter(Boolean).join(' ') || null,
    city: resident.city || null,
    state: resident.state || null,
    zipCode: resident.zip_code || null,
    county: resident.county || null,
    gender: resident.gender || null,
    ageRange: resident.age_range || null,
    isMarried: resident.is_married ?? null,
    hasChildren: resident.has_children ?? null,
    incomeRange: resident.income_range || null,
    netWorth: resident.net_worth || null,
    education: resident.education || null,
    homeownerFlag: resident.homeowner || null,
    propertyValue: resident.property_value || null,
    propertyType: resident.property_type || null,
    yearBuilt: resident.year_built || null,
    lotSize: resident.lot_size || null,
    livingArea: resident.living_area || null,
    bedrooms: resident.bedrooms ?? null,
    bathrooms: resident.bathrooms ?? null,
    permitIds: resident.permit_ids || [],
    geoId,
  };
}

export function normalizeEmployee(
  contractor: ShovelsContractor,
  employee: ShovelsEmployee,
  searchParams: { permitType?: string; city?: string },
  mostRecentPermit?: ShovelsPermit | null
): NormalizedShovelsContact {
  const { firstName, lastName } = parseEmployeeName(employee);
  const { email, emailSource } = resolveEmployeeEmail(employee, contractor);
  const phone = resolveEmployeePhone(employee, contractor);
  const tags = extractTags(contractor);
  const primaryPermitType = derivePrimaryPermitType(contractor.tag_tally);

  const rawPermitDate = mostRecentPermit?.issue_date || mostRecentPermit?.file_date || mostRecentPermit?.start_date || mostRecentPermit?.first_seen_date || null;

  return {
    email,
    firstName,
    lastName,
    fullName: employee.name || [firstName, lastName].filter(Boolean).join(' ') || null,
    phone,
    title: employee.job_title || null,
    city: employee.city || contractor.address?.city || null,
    state: employee.state || contractor.address?.state || null,
    source: 'shovels',
    shovelsContractorId: contractor.id,
    shovelsEmployeeId: employee.id,
    permitType: searchParams.permitType || tags[0] || null,
    permitCity: searchParams.city || contractor.address?.city || null,
    licenseNumber: contractor.license || null,
    // Promoted permit fields
    permitDate: rawPermitDate,
    permitDateFriendly: computeDateFriendly(rawPermitDate),
    permitMonthsAgo: computeMonthsAgo(rawPermitDate),
    permitDescription: mostRecentPermit?.description || null,
    permitStatus: mostRecentPermit?.status || null,
    permitNumber: mostRecentPermit?.number || null,
    permitJobValue: mostRecentPermit?.job_value ?? null,
    permitFees: mostRecentPermit?.fees ?? null,
    permitJurisdiction: mostRecentPermit?.jurisdiction || null,
    // Promoted contractor fields
    avgJobValue: contractor.avg_job_value ?? null,
    totalJobValue: contractor.total_job_value ?? null,
    permitCount: contractor.permit_count ?? null,
    revenue: contractor.revenue || null,
    employeeCount: contractor.employee_count || null,
    website: contractor.website || null,
    rating: contractor.rating ?? null,
    reviewCount: contractor.review_count ?? null,
    seniorityLevel: employee.seniority_level || null,
    department: employee.department || null,
    tagTally: contractor.tag_tally || null,
    enrichmentData: {
      avgConstructionDuration: contractor.avg_construction_duration,
      avgInspectionPassRate: contractor.avg_inspection_pass_rate,
      licenseNumber: contractor.license,
      tags,
      primaryPermitType,
      shovelsContractorId: contractor.id,
      shovelsEmployeeId: employee.id,
      emailSource,
      businessEmail: employee.business_email,
      linkedinUrl: employee.linkedin_url,
    },
    companyName: contractor.business_name || contractor.name || 'Unknown',
    companyCity: contractor.address?.city || null,
    companyState: contractor.address?.state || null,
    companyRevenue: contractor.revenue || null,
  };
}
