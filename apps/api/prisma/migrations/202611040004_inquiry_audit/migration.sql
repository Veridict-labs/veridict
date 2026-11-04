ALTER TABLE "Session" ADD COLUMN "inquiryId" UUID;
ALTER TABLE "Session" ADD CONSTRAINT "Session_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD COLUMN "inquiryId" UUID;
ALTER TABLE "AuditEvent" ADD COLUMN "toolCallId" UUID;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AuditEvent_orgId_inquiryId_createdAt_idx" ON "AuditEvent"("orgId", "inquiryId", "createdAt");
