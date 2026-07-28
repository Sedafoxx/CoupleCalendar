-- Add resolved column to bucket_list for tracking completed items
ALTER TABLE bucket_list ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT false;
