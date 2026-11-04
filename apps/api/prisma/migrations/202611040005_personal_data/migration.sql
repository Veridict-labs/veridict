ALTER TABLE "Inquiry" ADD COLUMN "personalDataRequest" JSONB;
ALTER TABLE "SourceChunk" ADD COLUMN "personalDataSpans" JSONB NOT NULL DEFAULT '[]';
CREATE TABLE "PersonalDataGrant" (
  "id" UUID NOT NULL, "sourceId" UUID NOT NULL, "fieldType" TEXT NOT NULL,
  "purpose" TEXT NOT NULL, "subjectType" "SubjectType" NOT NULL, "subjectId" TEXT NOT NULL,
  CONSTRAINT "PersonalDataGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonalDataGrant_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "personal_data_grant_scope_key" ON "PersonalDataGrant"("sourceId", "fieldType", "purpose", "subjectType", "subjectId");
