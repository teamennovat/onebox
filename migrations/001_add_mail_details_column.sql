-- Migration: Add mail_details JSONB column to message_custom_labels
-- Purpose: Store complete email metadata for labeled emails without re-fetching from Nylas
-- Run this in Supabase SQL Editor before using the labeling system

-- Add mail_details column if it doesn't exist
ALTER TABLE message_custom_labels
ADD COLUMN IF NOT EXISTS mail_details JSONB DEFAULT '{}'::jsonb;

-- Add index for performance when querying by grant_id in mail_details
CREATE INDEX IF NOT EXISTS idx_message_custom_labels_mail_details_grant_id 
ON message_custom_labels USING gin(mail_details);

-- Add index for email account + label filtering (common query pattern)
CREATE INDEX IF NOT EXISTS idx_message_custom_labels_account_label
ON message_custom_labels(email_account_id, custom_label_id, applied_at DESC)
WHERE applied_by IS NOT NULL;

-- Optional: Add comment to explain the column
COMMENT ON COLUMN message_custom_labels.mail_details IS 
'JSONB object containing complete email metadata: subject, from, to, cc, bcc, body, snippet, attachments, date, thread_id, folders, unread, starred, grant_id. Allows displaying labeled emails without live Nylas API fetch.';

-- Check existing data (verify the column was added)
-- SELECT id, email_account_id, message_id, custom_label_id, applied_by, applied_at, mail_details
-- FROM message_custom_labels
-- LIMIT 5;
