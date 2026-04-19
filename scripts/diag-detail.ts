import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const row = await prisma.permitSearch.findFirst({
    where: { conversationId: '4fb90340-0788-4daa-8768-2736164affa3' },
    orderBy: { createdAt: 'desc' },
  });
  console.log(JSON.stringify(row, null, 2));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
