import type { ShovelsContractor, ShovelsEmployee, ShovelsPermit } from './types';

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
    enrichmentData: {
      permitCount: contractor.permit_count,
      avgJobValue: contractor.avg_job_value,
      totalJobValue: contractor.total_job_value,
      avgConstructionDuration: contractor.avg_construction_duration,
      avgInspectionPassRate: contractor.avg_inspection_pass_rate,
      licenseNumber: contractor.license,
      tags,
      tagTally: contractor.tag_tally,
      primaryPermitType,
      shovelsContractorId: contractor.id,
      permitType: searchParams.permitType || tags[0] || null,
      permitCity: searchParams.city || null,
      permitDate: mostRecentPermit?.start_date || mostRecentPermit?.file_date || mostRecentPermit?.first_seen_date || null,
      permitDescription: mostRecentPermit?.description || null,
      revenue: contractor.revenue,
      employeeCount: contractor.employee_count,
      allEmails: contractor.email,
      allPhones: contractor.phone,
      website: contractor.website,
      linkedinUrl: contractor.linkedin_url,
      rating: contractor.rating,
      reviewCount: contractor.review_count,
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
    enrichmentData: {
      permitCount: contractor.permit_count,
      licenseNumber: contractor.license,
      tagTally: contractor.tag_tally,
      primaryPermitType,
      shovelsContractorId: contractor.id,
      shovelsEmployeeId: employee.id,
      permitType: searchParams.permitType || tags[0] || null,
      permitCity: searchParams.city || null,
      permitDate: mostRecentPermit?.start_date || mostRecentPermit?.file_date || mostRecentPermit?.first_seen_date || null,
      permitDescription: mostRecentPermit?.description || null,
      revenue: contractor.revenue,
      employeeCount: contractor.employee_count,
      emailSource,
      businessEmail: employee.business_email,
      seniorityLevel: employee.seniority_level,
      department: employee.department,
      jobTitle: employee.job_title,
      linkedinUrl: employee.linkedin_url,
    },
    companyName: contractor.business_name || contractor.name || 'Unknown',
    companyCity: contractor.address?.city || null,
    companyState: contractor.address?.state || null,
    companyRevenue: contractor.revenue || null,
  };
}
