-- ============================================
-- PATCH FOR AUTHENTICATION AND EMAIL ACCOUNTS
-- ============================================

-- First, add auth_id to users table for Supabase Auth integration
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS auth_id UUID,
ADD CONSTRAINT users_auth_id_key UNIQUE (auth_id);

-- Update users policies to use auth_id instead of id
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Service role can do all" ON users;

CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = auth_id);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE 
  USING (auth.uid() = auth_id)
  WITH CHECK (auth.uid() = auth_id);

CREATE POLICY "Service role can do all" ON users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Drop and recreate the email_accounts constraint to handle multiple accounts
ALTER TABLE email_accounts 
DROP CONSTRAINT IF EXISTS email_accounts_user_id_email_key;

-- Add new constraint that allows multiple accounts per email
ALTER TABLE email_accounts
ADD CONSTRAINT email_accounts_grant_id_key UNIQUE (grant_id);

-- Update email_accounts policies
DROP POLICY IF EXISTS "Users can view own email accounts" ON email_accounts;
DROP POLICY IF EXISTS "Service role can do all" ON email_accounts;

CREATE POLICY "Users can view own email accounts" ON email_accounts
  FOR ALL USING (
    user_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "Service role can do all" ON email_accounts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add comment explaining the changes
COMMENT ON TABLE users IS 'Core user profiles with Supabase auth integration via auth_id';
COMMENT ON COLUMN users.auth_id IS 'References the Supabase auth.users.id for authentication';
COMMENT ON TABLE email_accounts IS 'Connected email accounts via Nylas grants. Multiple accounts per user supported.';