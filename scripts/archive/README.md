# Archived Scripts

This directory contains one-time cleanup, migration, and verification scripts
from previous development phases. They are preserved here for audit trail
purposes but are no longer active.

## When to use these scripts
- **Never** in normal operation
- Only if you need to re-run a specific historical migration
- Each script documents what phase it belonged to in its header

## Active scripts (in scripts/)
- `verify-engine-unification.ts` — BA-02 Task 2: numerical consistency check
- `test-accounting-behavior.ts` — BA-02 Task 5: behavioral accounting tests
- `audit-chart-of-accounts.ts` — BA-03: COA audit
- `fix-chart-of-accounts.ts` — BA-03: COA repair
- `identify-dead-code.ts` — BA-05: dead code identification
- `restore-from-safety.sh` — session restore (used by predev)
- `test-equipment-cycle.ts` — equipment cycle integration test
