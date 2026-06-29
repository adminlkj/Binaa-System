import { db } from '../src/lib/db';
async function main() {
  // Clean up the test data we just created
  await db.employee.deleteMany({ where: { name: 'موظف اختبار التحقق' } });
  await db.bOQItem.deleteMany({ where: { code: 'TEST-VALID-1' } });
  await db.employeeContract.deleteMany({ where: { employeeId: 'cmqytimcj000hopxh24u4yik1', startDate: new Date('2026-01-01') } });
  console.log('Test data cleaned');
  await db.$disconnect();
}
main();
