import { ToolDefinition, ToolHandler, ToolRegistry, ToolErrorCode } from './types';
import { prisma } from '../../../config/database';
import { realieEnrichmentService } from '../../enrichment/realie.service';
import { shovelsHomeownerEnrichmentService } from '../../enrichment/shovels-homeowner.service';
import { connectionService } from '../../connection/connection.service';

const definitions: ToolDefinition[] = [
  {
    name: 'list_homeowners',
    description:
      'List homeowners pulled from permit data with optional filters',
    input_schema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Search by name, email, or address',
        },
        city: { type: 'string', description: 'Filter by city' },
        state: { type: 'string', description: 'Filter by state' },
        status: { type: 'string', description: 'Filter by status' },
        page: { type: 'number', description: 'Page number' },
        limit: { type: 'number', description: 'Results per page' },
      },
    },
  },
  {
    name: 'delete_homeowner',
    description: 'Delete a homeowner record from the database by ID.',
    input_schema: {
      type: 'object',
      properties: {
        homeownerId: { type: 'string', description: 'The homeowner ID to delete' },
      },
      required: ['homeownerId'],
    },
  },
  {
    name: 'enrich_homeowners',
    description:
      'Trigger Realie property enrichment for homeowners that haven\'t been enriched yet. Enriches property data like assessed value, AVM, bedrooms, etc.',
    input_schema: {
      type: 'object',
      properties: {
        batchSize: {
          type: 'number',
          description: 'Number of homeowners to enrich in this batch (default 50)',
        },
      },
    },
  },
  {
    name: 'enrich_homeowner_contacts',
    description:
      'Find email and phone for homeowners via Shovels resident data. Looks up residents at the homeowner\'s permit address and matches by name to populate contact details and demographics.',
    input_schema: {
      type: 'object',
      properties: {
        batchSize: {
          type: 'number',
          description: 'Number of homeowners to enrich in this batch (default 50)',
        },
      },
    },
  },
  {
    name: 'list_connections',
    description:
      'List contractor-homeowner connections (links between contacts and homeowners via permits).',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search by name, email, or address' },
        permitType: { type: 'string', description: 'Filter by permit type' },
        city: { type: 'string', description: 'Filter by city' },
        state: { type: 'string', description: 'Filter by state' },
        page: { type: 'number', description: 'Page number (default 1)' },
        limit: { type: 'number', description: 'Results per page (default 25)' },
      },
    },
  },
  {
    name: 'resolve_connections',
    description:
      'Resolve contractor-homeowner connections by matching permits to contractors in the database. Processes homeowners that don\'t yet have connections.',
    input_schema: {
      type: 'object',
      properties: {
        batchSize: {
          type: 'number',
          description: 'Number of homeowners to process (default 50)',
        },
      },
    },
  },
];

const handlers: Record<string, ToolHandler> = {
  list_homeowners: async (input) => {
    const page = input.page || 1;
    const limit = input.limit || 20;
    const skip = (page - 1) * limit;
    const where: Record<string, any> = {};

    if (input.search) {
      where.OR = [
        { firstName: { contains: input.search, mode: 'insensitive' } },
        { lastName: { contains: input.search, mode: 'insensitive' } },
        { email: { contains: input.search, mode: 'insensitive' } },
        { street: { contains: input.search, mode: 'insensitive' } },
      ];
    }
    if (input.city) where.city = input.city;
    if (input.state) where.state = input.state;
    if (input.status) where.status = input.status;

    const [homeowners, total] = await Promise.all([
      prisma.homeowner.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.homeowner.count({ where }),
    ]);

    return {
      success: true,
      data: {
        homeowners,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  },

  delete_homeowner: async (input) => {
    const homeowner = await prisma.homeowner.findUnique({
      where: { id: input.homeownerId },
      select: { id: true, fullName: true, email: true },
    });
    if (!homeowner) {
      return { success: false, error: `Homeowner not found with ID: ${input.homeownerId}`, code: 'PRECONDITION' as ToolErrorCode };
    }

    await prisma.homeowner.delete({ where: { id: input.homeownerId } });

    return {
      success: true,
      data: {
        message: `Homeowner ${homeowner.fullName || homeowner.email || input.homeownerId} deleted successfully.`,
      },
    };
  },

  enrich_homeowners: async (input) => {
    const batchSize = input.batchSize || 50;
    const enrichResult = await realieEnrichmentService.enrichPendingHomeowners(batchSize);

    return {
      success: true,
      data: {
        total: enrichResult.total,
        enriched: enrichResult.enriched,
        notFound: enrichResult.notFound,
        errors: enrichResult.errors,
        message: `Enriched ${enrichResult.enriched} of ${enrichResult.total} homeowners. ${enrichResult.notFound} not found in Realie, ${enrichResult.errors} errors.`,
      },
    };
  },

  enrich_homeowner_contacts: async (input) => {
    const contactBatchSize = input.batchSize || 50;
    const contactEnrichResult = await shovelsHomeownerEnrichmentService.enrichPendingHomeowners(contactBatchSize);

    return {
      success: true,
      data: {
        total: contactEnrichResult.total,
        enriched: contactEnrichResult.enriched,
        notFound: contactEnrichResult.notFound,
        noAddressId: contactEnrichResult.noAddressId,
        errors: contactEnrichResult.errors,
        message: `Contact enrichment complete: ${contactEnrichResult.enriched} of ${contactEnrichResult.total} homeowners got email/phone. ${contactEnrichResult.notFound} had no contact data in Shovels, ${contactEnrichResult.noAddressId} had no address ID, ${contactEnrichResult.errors} errors.`,
      },
    };
  },

  list_connections: async (input) => {
    const connResult = await connectionService.list({
      search: input.search,
      permitType: input.permitType,
      city: input.city,
      state: input.state,
      page: input.page || 1,
      limit: input.limit || 25,
    });

    return {
      success: true,
      data: {
        connections: connResult.data,
        pagination: connResult.pagination,
      },
    };
  },

  resolve_connections: async (input) => {
    const resolveResult = await connectionService.resolveConnections(
      input.batchSize || 50
    );

    return {
      success: true,
      data: {
        total: resolveResult.total,
        connected: resolveResult.connected,
        noContractor: resolveResult.noContractor,
        errors: resolveResult.errors,
        durationMs: resolveResult.duration,
        message: `Processed ${resolveResult.total} homeowners: ${resolveResult.connected} connected, ${resolveResult.noContractor} no contractor found, ${resolveResult.errors} errors.`,
      },
    };
  },
};

export function registerTools(registry: ToolRegistry): void {
  for (const def of definitions) {
    registry.register(def, handlers[def.name]);
  }
}
