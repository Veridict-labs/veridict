CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'REVIEWER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('USER', 'AGENT');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('DOCUMENT', 'CHAT', 'TASK');

-- CreateEnum
CREATE TYPE "SourceState" AS ENUM ('APPROVED', 'OFFICIAL_INTERNAL', 'INFORMAL', 'DRAFT', 'SUPERSEDED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('USER', 'DEPARTMENT', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('READ', 'REVIEW');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('PENDING', 'ANSWERED', 'NEEDS_CLARIFICATION', 'INSUFFICIENT_EVIDENCE', 'UNAVAILABLE', 'NEEDS_REVALIDATION');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_REVIEW', 'VALIDATED', 'REJECTED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissionVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "department" TEXT NOT NULL,
    "reviewDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "SessionKind" NOT NULL DEFAULT 'USER',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "type" "SourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "externalId" TEXT,
    "state" "SourceState" NOT NULL DEFAULT 'UNKNOWN',
    "ownerId" UUID NOT NULL,
    "issuerId" UUID,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" UUID,
    "embeddingModel" TEXT,

    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceChunk" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "spanStart" INTEGER NOT NULL,
    "spanEnd" INTEGER NOT NULL,
    "integrityHash" TEXT NOT NULL,
    "embedding" vector,
    "embeddingDims" INTEGER,

    CONSTRAINT "SourceChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "subjectType" "SubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL DEFAULT 'READ',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyClaim" (
    "id" UUID NOT NULL,
    "evidenceChunkId" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "predicate" JSONB NOT NULL,
    "result" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "supersedesId" UUID,
    "validatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionCase" (
    "id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "outcome" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseEvidence" (
    "caseId" UUID NOT NULL,
    "chunkId" UUID NOT NULL,

    CONSTRAINT "CaseEvidence_pkey" PRIMARY KEY ("caseId","chunkId")
);

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "askerId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'PENDING',
    "answer" TEXT,
    "assumptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "limitations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "permissionVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InquiryEvidence" (
    "inquiryId" UUID NOT NULL,
    "chunkId" UUID NOT NULL,

    CONSTRAINT "InquiryEvidence_pkey" PRIMARY KEY ("inquiryId","chunkId")
);

-- CreateTable
CREATE TABLE "FeedbackEvent" (
    "id" UUID NOT NULL,
    "inquiryId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proposedCase" JSONB,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewerId" UUID,
    "reviewReason" TEXT,
    "caseId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "resourceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decision" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_orgId_email_key" ON "User"("orgId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeSource_supersedesId_key" ON "KnowledgeSource"("supersedesId");

-- CreateIndex
CREATE INDEX "KnowledgeSource_orgId_state_idx" ON "KnowledgeSource"("orgId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeSource_orgId_externalId_version_key" ON "KnowledgeSource"("orgId", "externalId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SourceChunk_sourceId_chunkIndex_key" ON "SourceChunk"("sourceId", "chunkIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_sourceId_subjectType_subjectId_action_key" ON "Permission"("sourceId", "subjectType", "subjectId", "action");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyClaim_supersedesId_key" ON "PolicyClaim"("supersedesId");

-- CreateIndex
CREATE INDEX "PolicyClaim_domain_validFrom_idx" ON "PolicyClaim"("domain", "validFrom");

-- CreateIndex
CREATE INDEX "DecisionCase_domain_status_idx" ON "DecisionCase"("domain", "status");

-- CreateIndex
CREATE INDEX "Inquiry_orgId_askerId_createdAt_idx" ON "Inquiry"("orgId", "askerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackEvent_caseId_key" ON "FeedbackEvent"("caseId");

-- CreateIndex
CREATE INDEX "AuditEvent_orgId_createdAt_idx" ON "AuditEvent"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "KnowledgeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceChunk" ADD CONSTRAINT "SourceChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyClaim" ADD CONSTRAINT "PolicyClaim_evidenceChunkId_fkey" FOREIGN KEY ("evidenceChunkId") REFERENCES "SourceChunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyClaim" ADD CONSTRAINT "PolicyClaim_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "PolicyClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvidence" ADD CONSTRAINT "CaseEvidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DecisionCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvidence" ADD CONSTRAINT "CaseEvidence_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "SourceChunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_askerId_fkey" FOREIGN KEY ("askerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryEvidence" ADD CONSTRAINT "InquiryEvidence_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryEvidence" ADD CONSTRAINT "InquiryEvidence_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "SourceChunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DecisionCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE INDEX chunk_content_search ON "SourceChunk" USING GIN (to_tsvector('simple', content));
