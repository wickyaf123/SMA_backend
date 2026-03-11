export interface ClayEnrichPayload {
  contactId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  companyName: string | null;
  companyDomain: string | null;
  permitType: string | null;
  permitCity: string | null;
  permitSearchId?: string;
  shovelsHasEmail: boolean;
  shovelsHasPhone: boolean;
  seniorityLevel: string | null;
  jobTitle: string | null;
}

export interface ClayWebhookPayload {
  contactId: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  title?: string;
  enrichmentSource?: string;
  confidence?: number;
}

export interface ClayEnrichResult {
  success: boolean;
  contactId: string;
  email?: string;
  phone?: string;
  error?: string;
}
