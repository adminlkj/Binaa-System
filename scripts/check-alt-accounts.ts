import { db } from '../src/lib/db';
async function main() {
  // Check alternative accounts for conflict roles
  const alts = ['7120', '7150', '1610', '1620', '3610', '3620', '1240', '6320', '2300', '2306'];
  for (const code of alts) {
    const a = await db.account.findUnique({ where: { code }, select: { code: true, name: true, nameAr: true, type: true, accountRole: true, isActive: true, allowPosting: true } });
    if (a) {
      console.log(`${code}: ${a.nameAr || a.name} | type=${a.type} | role=${a.accountRole || 'null'} | active=${a.isActive} | posting=${a.allowPosting}`);
    } else {
      console.log(`${code}: NOT FOUND`);
    }
  }
  // Also check parent accounts for the codes to create (need parentId)
  const parents = ['4200', '5200', '6300', '2300'];
  console.log('\n=== Parent accounts for new accounts ===');
  for (const code of parents) {
    const a = await db.account.findUnique({ where: { code }, select: { code: true, name: true, nameAr: true, type: true, level: true, allowPosting: true } });
    if (a) console.log(`${code}: ${a.nameAr || a.name} | type=${a.type} | level=${a.level} | posting=${a.allowPosting}`);
  }
  // Check max level for reference
  const maxLevel = await db.account.aggregate({ _max: { level: true } });
  console.log(`\nMax account level: ${maxLevel._max.level}`);
  await db.$disconnect();
}
main();
