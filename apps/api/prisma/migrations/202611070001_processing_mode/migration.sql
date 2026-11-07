ALTER TABLE "Inquiry" ADD COLUMN "processingMode" TEXT NOT NULL DEFAULT 'ai';
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_processingMode_check" CHECK ("processingMode" IN ('ai', 'no_ai'));
