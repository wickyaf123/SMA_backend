import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // Quick smoke test: verify we can select+update diagnostics
  const row = await prisma.permitSearch.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, diagnostics: true },
  });
  console.log('SAMPLE:', JSON.stringify(row, null, 2));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
