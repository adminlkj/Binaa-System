import { db } from '../src/lib/db';
async function main() {
  // Find level-1 parent accounts by type (non-posting parents)
  for (const type of ['REVENUE', 'EXPENSE', 'LIABILITY', 'ASSET', 'EQUITY']) {
    const parents = await db.account.findMany({
      where: { type, level: 1, isActive: true, allowPosting: false },
      select: { code: true, name: true, nameAr: true },
      orderBy: { code: 'asc' },
    });
    console.log(`\n=== ${type} parents (level 1, non-posting) ===`);
    parents.forEach(p => console.log(`  ${p.code}: ${p.nameAr || p.name}`));
  }
  // Also check what 4000-level and 5000-level parents exist
  console.log('\n=== 4xxx accounts (revenue range) ===');
  const rev4 = await db.account.findMany({ where: { code: { startsWith: '4' }, level: 1 }, select: { code: true, name: true, nameAr: true, type: true, allowPosting: true } });
  rev4.forEach(a => console.log(`  ${a.code}: ${a.nameAr || a.name} | type=${a.type} | posting=${a.allowPosting}`));
  console.log('\n=== 5xxx accounts (expense/equity range) ===');
  const exp5 = await db.account.findMany({ where: { code: { startsWith: '5' }, level: 1 }, select: { code: true, name: true, nameAr: true, type: true, allowPosting: true } });
  exp5.forEach(a => console.log(`  ${a.code}: ${a.nameAr || a.name} | type=${a.type} | posting=${a.allowPosting}`));
  console.log('\n=== 23xx accounts (vat range) ===');
  const vat23 = await db.account.findMany({ where: { code: { startsWith: '23' } }, select: { code: true, name: true, nameAr: true, type: true, level: true, allowPosting: true, accountRole: true } });
  vat23.forEach(a => console.log(`  ${a.code}: ${a.nameAr || a.name} | type=${a.type} | level=${a.level} | posting=${a.allowPosting} | role=${a.accountRole}`));
  await db.$disconnect();
}
main();
