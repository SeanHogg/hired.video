-- Job hero image — supports the unified MediaPicker (Upload / Stock / AI Image)
-- on the job create + edit forms. Optional cover image rendered above the
-- title on JobDetail and on job cards in search results.

ALTER TABLE job_items ADD COLUMN IF NOT EXISTS hero_image_url TEXT;
