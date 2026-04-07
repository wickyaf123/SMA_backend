export interface ShovelsSearchParams {
  geo_id: string;
  tags?: string;
  permit_from: string;
  permit_to: string;
  size?: number;
  cursor?: string;
}

export interface ShovelsAddress {
  street_no: string | null;
  street: string | null;
  city: string | null;
  county: string | null;
  zip_code: string | null;
  zip_code_ext: string | null;
  state: string | null;
  jurisdiction: string | null;
  address_id: string | null;
  latlng: [number | null, number | null];
}

export interface ShovelsContractor {
  id: string;
  name: string;
  business_name: string | null;
  business_type: string | null;
  license: string | null;
  license_issue_date: string | null;
  license_exp_date: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  dba: string | null;
  linkedin_url: string | null;
  revenue: string | null;
  employee_count: string | null;
  primary_industry: string | null;
  review_count: number | null;
  rating: number | null;
  status_tally: Record<string, number> | null;
  tag_tally: Record<string, number> | null;
  permit_count: number | null;
  avg_job_value: number | null;
  total_job_value: number | null;
  avg_construction_duration: number | null;
  avg_inspection_pass_rate: number | null;
  first_seen_date: string | null;
  address: ShovelsAddress | null;
  sic: string | null;
  naics: string | null;
  classification: string | null;
  classification_derived: string[] | null;
}

export interface ShovelsEmployee {
  id: string;
  contractor_id: string;
  name: string | null;
  street_no: string | null;
  street: string | null;
  city: string | null;
  zip_code: string | null;
  zip_code_ext: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  business_email: string | null;
  linkedin_url: string | null;
  homeowner: string | null;
  gender: string | null;
  age_range: string | null;
  is_married: boolean | null;
  has_children: boolean | null;
  income_range: string | null;
  net_worth: string | null;
  job_title: string | null;
  seniority_level: string | null;
  department: string | null;
}

export interface ShovelsApiResponse<T> {
  items: T[];
  size: number;
  next_cursor: string | null;
  total_count: number | null;
}

export interface ShovelsPermit {
  id: string;
  number: string;
  description: string | null;
  description_derived: string | null;
  jurisdiction: string;
  job_value: number | null;
  type: string | null;
  subtype: string | null;
  fees: number | null;
  status: string | null;
  file_date: string | null;
  issue_date: string | null;
  final_date: string | null;
  start_date: string | null;
  end_date: string | null;
  first_seen_date: string | null;
  total_duration: number | null;
  construction_duration: number | null;
  approval_duration: number | null;
  inspection_pass_rate: number | null;
  contractor_id: string | null;
  tags: string[] | null;
  address: ShovelsAddress | null;
}

export interface ShovelsContractorWithEmployees {
  contractor: ShovelsContractor;
  employees: ShovelsEmployee[];
}

export interface ShovelsResident {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  street_no: string | null;
  street: string | null;
  city: string | null;
  zip_code: string | null;
  state: string | null;
  county: string | null;
  homeowner: string | null;
  gender: string | null;
  age_range: string | null;
  is_married: boolean | null;
  has_children: boolean | null;
  income_range: string | null;
  net_worth: string | null;
  education: string | null;
  property_value: string | null;
  property_type: string | null;
  year_built: string | null;
  lot_size: string | null;
  living_area: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  permit_ids: string[] | null;
  [key: string]: any;
}

export interface ShovelsUsageResponse {
  credits_used: number;
  credit_limit: number | null;
  is_over_limit: boolean;
  available_at: string | null;
  daily_usage: { date: string; credits: number; expires: string }[];
}

export interface ShovelsQuotaStatus {
  creditsUsed: number;
  creditLimit: number | null;
  isOverLimit: boolean;
  availableAt: string | null;
  usagePercent: number;
  creditsRemaining: number | null;
}
