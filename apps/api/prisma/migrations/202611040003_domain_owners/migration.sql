ALTER TABLE "Inquiry" ADD COLUMN "escalationDomain" TEXT;
CREATE TABLE "DomainOwner" (
  "id" UUID NOT NULL,
  "orgId" UUID NOT NULL,
  "domain" TEXT NOT NULL,
  "ownerId" UUID NOT NULL,
  "chunkId" UUID NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DomainOwner_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DomainOwner_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DomainOwner_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DomainOwner_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "SourceChunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DomainOwner_orgId_domain_key" ON "DomainOwner"("orgId", "domain");
