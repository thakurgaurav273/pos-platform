-- Tenancy: every shop belongs to an Organization.
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Shop" ADD COLUMN "orgId" TEXT;

-- Existing shops all belong to one legacy organization, already onboarded.
DO $$
DECLARE legacy_id TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM "Shop") THEN
    legacy_id := gen_random_uuid()::text;
    INSERT INTO "Organization" ("id", "name", "onboardingCompletedAt")
    VALUES (legacy_id, 'My Business', CURRENT_TIMESTAMP);
    UPDATE "Shop" SET "orgId" = legacy_id;
  END IF;
END $$;

ALTER TABLE "Shop" ALTER COLUMN "orgId" SET NOT NULL;
CREATE INDEX "Shop_orgId_idx" ON "Shop"("orgId");
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
