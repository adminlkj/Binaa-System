import { db } from '../src/lib/db';
async function main() {
  const parent3100 = await db.account.findUnique({ where: { code: '3100' } });
  for (const code of ['3140', '3150', '3160']) {
    const existing = await db.account.findUnique({ where: { code } });
    if (!existing && parent3100) {
      await db.account.create({
        data: {
          code, name: 'VAT Settlement', nameAr: 'تسوية ضريبة القيمة المضافة',
          type: 'LIABILITY', parentId: parent3100.id, parentCode: '3100',
          isActive: true, allowPosting: true, level: 2, accountRole: 'VAT_SETTLEMENT',
          description: 'حساب تسوية ضريبة القيمة المضافة المستحقة/المستردة', isSystem: true,
        },
      });
      console.log(`[DONE] Created ${code} role=VAT_SETTLEMENT`);
      break;
    } else if (existing && !existing.accountRole) {
      await db.account.update({ where: { id: existing.id }, data: { accountRole: 'VAT_SETTLEMENT' } });
      console.log(`[DONE] ${code} existed, assigned VAT_SETTLEMENT`);
      break;
    }
  }
  // Final check
  const count = await db.account.count({ where: { accountRole: 'VAT_SETTLEMENT', isActive: true } });
  console.log(`VAT_SETTLEMENT accounts: ${count}`);
  await db.$disconnect();
}
main();
