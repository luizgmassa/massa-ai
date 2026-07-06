-- Drop NOT NULL on symbol_references.target_fqn so unresolved-target refs can be stored (parity with SQLite backend).
ALTER TABLE "symbol_references" ALTER COLUMN "target_fqn" DROP NOT NULL;
