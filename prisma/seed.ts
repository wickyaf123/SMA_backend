import { PrismaClient, ContactStatus, EmailValidationStatus, PhoneValidationStatus, SequenceStatus, OutreachChannel } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create test companies
  const company1 = await prisma.company.create({
    data: {
      name: 'Acme Construction',
      domain: 'acme-construction.com',
      industry: 'Construction',
      size: '11-50',
      city: 'San Francisco',
      state: 'California',
      country: 'United States',
      website: 'https://acme-construction.com',
    },
  });

  const company2 = await prisma.company.create({
    data: {
      name: 'BuildRight Co',
      domain: 'buildright.com',
      industry: 'Construction',
      size: '51-100',
      city: 'Austin',
      state: 'Texas',
      country: 'United States',
      website: 'https://buildright.com',
    },
  });

  console.log('✅ Created companies');

  // Create test contacts
  await prisma.contact.create({
    data: {
      email: 'john.doe@acme-construction.com',
      firstName: 'John',
      lastName: 'Doe',
      fullName: 'John Doe',
      title: 'CEO',
      phone: '+15551234567',
      phoneFormatted: '+15551234567',
      linkedinUrl: 'https://linkedin.com/in/johndoe',
      city: 'San Francisco',
      state: 'California',
      timezone: 'America/Los_Angeles',
      companyId: company1.id,
      status: ContactStatus.VALIDATED,
      emailValidationStatus: EmailValidationStatus.VALID,
      phoneValidationStatus: PhoneValidationStatus.VALID_MOBILE,
      tags: ['contractor', 'decision_maker'],
    },
  });

  await prisma.contact.create({
    data: {
      email: 'jane.smith@buildright.com',
      firstName: 'Jane',
      lastName: 'Smith',
      fullName: 'Jane Smith',
      title: 'COO',
      phone: '+15559876543',
      phoneFormatted: '+15559876543',
      linkedinUrl: 'https://linkedin.com/in/janesmith',
      city: 'Austin',
      state: 'Texas',
      timezone: 'America/Chicago',
      companyId: company2.id,
      status: ContactStatus.VALIDATED,
      emailValidationStatus: EmailValidationStatus.VALID,
      phoneValidationStatus: PhoneValidationStatus.VALID_MOBILE,
      tags: ['contractor'],
    },
  });

  await prisma.contact.create({
    data: {
      email: 'bob.wilson@acme-construction.com',
      firstName: 'Bob',
      lastName: 'Wilson',
      fullName: 'Bob Wilson',
      title: 'Project Manager',
      city: 'San Francisco',
      state: 'California',
      timezone: 'America/Los_Angeles',
      companyId: company1.id,
      status: ContactStatus.NEW,
      emailValidationStatus: EmailValidationStatus.PENDING,
      tags: ['contractor'],
    },
  });

  console.log('✅ Created contacts');

  // Create test sequence
  const sequence = await prisma.sequence.create({
    data: {
      name: 'Contractor Outreach Q1 2026',
      description: 'Multi-touch campaign for contractor leads',
      status: SequenceStatus.DRAFT,
      channels: [OutreachChannel.EMAIL, OutreachChannel.SMS],
      businessHoursOnly: true,
      respectTimezone: true,
      excludeWeekends: true,
      steps: {
        create: [
          {
            order: 1,
            channel: OutreachChannel.EMAIL,
            delayDays: 0,
            delayHours: 0,
            delayMinutes: 0,
            subject: 'Quick question about {{company}}',
            body: 'Hi {{firstName}},\n\nI noticed {{company}} is growing and wanted to reach out...',
            randomDelayMin: 15,
            randomDelayMax: 30,
          },
          {
            order: 2,
            channel: OutreachChannel.EMAIL,
            delayDays: 3,
            delayHours: 0,
            delayMinutes: 0,
            subject: 'Following up - {{company}}',
            body: 'Hi {{firstName}},\n\nJust wanted to follow up on my previous email...',
            randomDelayMin: 15,
            randomDelayMax: 45,
          },
          {
            order: 3,
            channel: OutreachChannel.SMS,
            delayDays: 5,
            delayHours: 0,
            delayMinutes: 0,
            body: 'Hi {{firstName}}, this is [Your Name]. Quick question about your business?',
            randomDelayMin: 30,
            randomDelayMax: 60,
          },
        ],
      },
    },
  });

  console.log('✅ Created sequence with steps');

  // Create system config
  await prisma.systemConfig.createMany({
    data: [
      {
        key: 'rate_limits.email.per_hour',
        value: 100,
        description: 'Maximum emails to send per hour',
      },
      {
        key: 'rate_limits.sms.per_hour',
        value: 50,
        description: 'Maximum SMS to send per hour',
      },
      {
        key: 'rate_limits.linkedin.per_day',
        value: 50,
        description: 'Maximum LinkedIn actions per day',
      },
    ],
  });

  console.log('✅ Created system config');

  console.log('🎉 Seeding complete!');
  console.log(`📊 Summary:`);
  console.log(`   - Companies: 2`);
  console.log(`   - Contacts: 3`);
  console.log(`   - Sequences: 1`);
  console.log(`   - Sequence Steps: 3`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

