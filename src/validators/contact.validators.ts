import { z } from 'zod';
import { ContactStatus, EmailValidationStatus, PhoneValidationStatus } from '@prisma/client';

/**
 * Create contact schema
 */
export const createContactSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  fullName: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable().or(z.literal('')),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.any()).optional(),
});

/**
 * Update contact schema
 */
export const updateContactSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  fullName: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable().or(z.literal('')),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  status: z.nativeEnum(ContactStatus).optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.any()).optional(),
});

/**
 * Contact search schema
 */
export const contactSearchSchema = z.object({
  search: z.string().optional(),
  status: z.array(z.nativeEnum(ContactStatus)).optional(),
  emailValidationStatus: z.array(z.nativeEnum(EmailValidationStatus)).optional(),
  phoneValidationStatus: z.array(z.nativeEnum(PhoneValidationStatus)).optional(),
  tags: z.array(z.string()).optional(),
  companyId: z.string().uuid().optional(),
  hasReplied: z.boolean().optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(50),
  sort: z.string().optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * Apollo import schema (with two-step enrichment)
 */
export const importApolloSchema = z.object({
  // Person filters
  personTitles: z.array(z.string()).optional(),
  personLocations: z.array(z.string()).optional(),
  
  // Organization filters
  organizationLocations: z.array(z.string()).optional(),
  excludeLocations: z.array(z.string()).optional(),
  industry: z.enum(['HVAC', 'SOLAR', 'ROOFING']).optional(),
  organizationKeywords: z.string().optional(),
  
  // Size filters
  employeesMin: z.number().int().positive().optional(),
  employeesMax: z.number().int().positive().optional(),
  revenueMin: z.number().positive().optional(),
  revenueMax: z.number().positive().optional(),
  
  // Technology and growth filters
  technologies: z.array(z.string()).optional(),
  employeeGrowth: z.number().int().positive().optional(),
  
  // Pagination and limits
  page: z.number().int().positive().optional().default(1),
  perPage: z.number().int().positive().max(100).optional().default(100),
  enrichLimit: z.number().int().positive().max(200).optional().default(100),
});

/**
 * CSV import schema
 */
export const importCsvSchema = z.object({
  customMapping: z.record(z.string()).optional(),
  skipEmptyLines: z.boolean().optional().default(true),
  trimValues: z.boolean().optional().default(true),
  maxRows: z.number().int().positive().optional(),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ContactSearchInput = z.infer<typeof contactSearchSchema>;
export type ImportApolloInput = z.infer<typeof importApolloSchema>;
export type ImportCsvInput = z.infer<typeof importCsvSchema>;

