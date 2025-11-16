-- Migration to fix applied_by column type (convert from UUID to TEXT[])
-- Run this on your production Supabase database

-- Drop the foreign key constraint if it exists
ALTER TABLE message_custom_labels DROP CONSTRAINT IF EXISTS message_custom_labels_applied_by_fkey;

-- Convert column type from UUID to TEXT[]
-- If currently UUID, use the conversion; if it doesn't exist, create it
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='message_custom_labels' AND column_name='applied_by' AND data_type='uuid') THEN
    ALTER TABLE message_custom_labels
      ALTER COLUMN applied_by TYPE text[] USING CASE 
        WHEN applied_by IS NULL THEN ARRAY[]::text[] 
        ELSE ARRAY[applied_by::text] 
      END,
      ALTER COLUMN applied_by SET DEFAULT ARRAY[]::text[];
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='message_custom_labels' AND column_name='applied_by') THEN
    ALTER TABLE message_custom_labels
      ADD COLUMN applied_by text[] DEFAULT ARRAY[]::text[];
  END IF;
END$$;

-- Add mail_details column if it doesn't exist
ALTER TABLE message_custom_labels
  ADD COLUMN IF NOT EXISTS mail_details JSONB DEFAULT '{}'::jsonb;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_message_custom_labels_applied_by 
  ON message_custom_labels USING GIN(applied_by);

CREATE INDEX IF NOT EXISTS idx_message_custom_labels_mail_details 
  ON message_custom_labels USING GIN(mail_details);
