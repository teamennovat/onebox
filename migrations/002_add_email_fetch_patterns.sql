-- Create table to track optimal email fetching window per user and folder
-- Stores the minimum hours needed to consistently fetch 200+ emails
-- This prevents repeated expansions and minimizes Nylas API requests

CREATE TABLE IF NOT EXISTS email_fetch_patterns (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id TEXT DEFAULT 'INBOX',
  optimal_hours INT DEFAULT 24, -- What window size worked best last time
  last_optimal_hours INT, -- Previous optimal (to detect trends)
  emails_in_last_fetch INT DEFAULT 0, -- How many emails were in optimal window
  total_attempts INT DEFAULT 1, -- How many times we've optimized this
  last_fetched_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(user_id, folder_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_email_fetch_patterns_user_id 
  ON email_fetch_patterns(user_id);

CREATE INDEX IF NOT EXISTS idx_email_fetch_patterns_user_folder 
  ON email_fetch_patterns(user_id, folder_id);

-- RLS Policies
ALTER TABLE email_fetch_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own fetch patterns"
  ON email_fetch_patterns
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fetch patterns"
  ON email_fetch_patterns
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fetch patterns"
  ON email_fetch_patterns
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own fetch patterns"
  ON email_fetch_patterns
  FOR DELETE
  USING (auth.uid() = user_id);
