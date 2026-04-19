import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const searches = await prisma.permitSearch.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 20*60*1000) } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, conversationId: true, permitType: true, city: true, status: true, totalFound: true, createdAt: true },
  });
  console.log('PERMIT_SEARCHES:'); console.log(JSON.stringify(searches, null, 2));
  const issues = await prisma.issueEvent.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 20*60*1000) } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('ISSUES:'); console.log(JSON.stringify(issues, null, 2));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
