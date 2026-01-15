import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, connectDatabase, disconnectDatabase, checkDatabaseHealth } from '../src/config/database';
import { ContactStatus, EmailValidationStatus } from '@prisma/client';

describe('Database', () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('should connect to database', async () => {
    const isHealthy = await checkDatabaseHealth();
    expect(isHealthy).toBe(true);
  });

  it('should have Prisma client initialized', () => {
    expect(prisma).toBeDefined();
    expect(prisma.$connect).toBeTypeOf('function');
  });

  describe('Company Model', () => {
    it('should create a company', async () => {
      const company = await prisma.company.create({
        data: {
          name: 'Test Company',
          domain: `test-${Date.now()}.com`,
          industry: 'Construction',
        },
      });

      expect(company).toBeDefined();
      expect(company.id).toBeDefined();
      expect(company.name).toBe('Test Company');
      expect(company.industry).toBe('Construction');

      // Cleanup
      await prisma.company.delete({ where: { id: company.id } });
    });

    it('should find company by domain', async () => {
      const domain = `unique-${Date.now()}.com`;
      const created = await prisma.company.create({
        data: {
          name: 'Unique Company',
          domain,
        },
      });

      const found = await prisma.company.findUnique({
        where: { domain },
      });

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);

      // Cleanup
      await prisma.company.delete({ where: { id: created.id } });
    });
  });

  describe('Contact Model', () => {
    it('should create a contact', async () => {
      const email = `test-${Date.now()}@example.com`;
      const contact = await prisma.contact.create({
        data: {
          email,
          firstName: 'Test',
          lastName: 'User',
          status: ContactStatus.NEW,
          emailValidationStatus: EmailValidationStatus.PENDING,
        },
      });

      expect(contact).toBeDefined();
      expect(contact.id).toBeDefined();
      expect(contact.email).toBe(email);
      expect(contact.firstName).toBe('Test');

      // Cleanup
      await prisma.contact.delete({ where: { id: contact.id } });
    });

    it('should create contact with company relationship', async () => {
      const company = await prisma.company.create({
        data: {
          name: 'Parent Company',
          domain: `parent-${Date.now()}.com`,
        },
      });

      const contact = await prisma.contact.create({
        data: {
          email: `employee-${Date.now()}@example.com`,
          firstName: 'Employee',
          companyId: company.id,
          status: ContactStatus.NEW,
          emailValidationStatus: EmailValidationStatus.PENDING,
        },
        include: {
          company: true,
        },
      });

      expect(contact.company).toBeDefined();
      expect(contact.company?.id).toBe(company.id);
      expect(contact.company?.name).toBe('Parent Company');

      // Cleanup
      await prisma.contact.delete({ where: { id: contact.id } });
      await prisma.company.delete({ where: { id: company.id } });
    });

    it('should enforce unique email constraint', async () => {
      const email = `unique-${Date.now()}@example.com`;
      
      await prisma.contact.create({
        data: {
          email,
          firstName: 'First',
          status: ContactStatus.NEW,
          emailValidationStatus: EmailValidationStatus.PENDING,
        },
      });

      // Attempting to create duplicate should fail
      await expect(
        prisma.contact.create({
          data: {
            email,
            firstName: 'Second',
            status: ContactStatus.NEW,
            emailValidationStatus: EmailValidationStatus.PENDING,
          },
        })
      ).rejects.toThrow();

      // Cleanup
      await prisma.contact.delete({ where: { email } });
    });
  });

  describe('Sequence Model', () => {
    it('should create a sequence', async () => {
      const sequence = await prisma.sequence.create({
        data: {
          name: 'Test Sequence',
          description: 'Test description',
          channels: ['EMAIL'],
        },
      });

      expect(sequence).toBeDefined();
      expect(sequence.id).toBeDefined();
      expect(sequence.name).toBe('Test Sequence');
      expect(sequence.channels).toContain('EMAIL');

      // Cleanup
      await prisma.sequence.delete({ where: { id: sequence.id } });
    });
  });
});

