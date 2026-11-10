-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('OPEN', 'CONTACTED', 'CLOSED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "paidUntil" TIMESTAMP(3),
ADD COLUMN     "planName" TEXT,
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PlanEnquiry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "plan" TEXT,
    "message" TEXT,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totpSecretEnc" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "lastUsedStep" INTEGER,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanEnquiry_orgId_createdAt_idx" ON "PlanEnquiry"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanEnquiry_status_createdAt_idx" ON "PlanEnquiry"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorAccount_email_key" ON "OperatorAccount"("email");

-- AddForeignKey
ALTER TABLE "PlanEnquiry" ADD CONSTRAINT "PlanEnquiry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
