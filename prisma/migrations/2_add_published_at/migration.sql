-- Track when a schedule was last published so the UI can detect edits made after publishing
ALTER TABLE "GeneratedSchedule" ADD COLUMN "publishedAt" TIMESTAMP(3);
