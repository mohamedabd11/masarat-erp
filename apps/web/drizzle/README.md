# Database migration chain

`meta/_journal.json` is the only authoritative execution order. The active
chain is deliberately contiguous from journal index 0 through 6:

1. `0000_safe_puff_adder`
2. `0001_quotes_conversion_tracking`
3. `0002_hr_suppliers_constraints`
4. `0003_canonical_schema_reconciliation`
5. `0004_runtime_database_hardening`
6. `0005_runtime_invariant_indexes`
7. `0006_registered_schema_completion`

Files under `archive/legacy-unregistered` are retained for audit history only.
They were never registered in the Drizzle journal and must not be executed.
Their schema effects are superseded by the canonical reconciliation and the
registered completion migrations.

Create future migrations with the repository's pinned Drizzle tooling so the
SQL file, journal entry, and schema snapshot are generated together. Do not add
manual numbered SQL files without a matching journal entry and snapshot.
