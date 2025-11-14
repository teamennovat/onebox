-- Add mail_details column to message_custom_labels to store complete email data
ALTER TABLE message_custom_labels ADD COLUMN IF NOT EXISTS mail_details JSONB DEFAULT NULL;

-- mail_details will contain:
-- {
--   "subject": "...",
--   "from": {...},
--   "to": [...],
--   "cc": [...],
--   "bcc": [...],
--   "body": "...",
--   "snippet": "...",
--   "attachments": [...],
--   "date": 1763118222,
--   "thread_id": "..."
-- }

-- Update existing rows with empty mail_details (optional, for new data only)
UPDATE message_custom_labels SET mail_details = '{}' WHERE mail_details IS NULL;
