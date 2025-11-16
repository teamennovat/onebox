-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

-- Drop existing tables if they exist (be careful in production!)
DROP TABLE IF EXISTS user_preferences CASCADE;
DROP TABLE IF EXISTS draft_templates CASCADE;
DROP TABLE IF EXISTS message_cache CASCADE;
DROP TABLE IF EXISTS message_custom_labels CASCADE;
DROP TABLE IF EXISTS custom_labels CASCADE;
DROP TABLE IF EXISTS email_accounts CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Create users table (core authentication)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- EMAIL ACCOUNTS (NYLAS GRANTS)
-- ============================================

CREATE TABLE email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  grant_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  provider TEXT NOT NULL, -- 'google', 'microsoft', 'yahoo', 'imap'
  grant_status TEXT DEFAULT 'valid', -- 'valid', 'expired', 'invalid'
  is_primary BOOLEAN DEFAULT FALSE,
  settings JSONB DEFAULT '{}',
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, email)
);

-- ============================================
-- CUSTOM LABELS
-- ============================================

CREATE TABLE custom_labels (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert predefined labels
INSERT INTO custom_labels (id, name, color, sort_order) VALUES
  ('e86be808-a059-4eb9-9753-2b3908f804d5', 'To Respond', '#ef4444', 1),
  ('ddb9aa73-ed78-4eb2-9660-30bc326066c0', 'Need Action', '#f97316', 2),
  ('cf71293b-58bc-4136-8427-3ab2e1662f4f', 'FYI', '#3b82f6', 3),
  ('3a863d85-e959-4fe1-904c-1dc4872cbf14', 'Resolved', '#10b981', 4),
  ('be6ffdb8-9a6f-4ec3-8ad0-7e71ad79c854', 'Newsletter', '#8b5cf6', 5),
  ('972b1c38-dcb2-4b7d-8db9-806473fcb6af', 'Schedules', '#06b6d4', 6),
  ('a6537970-7c3b-41ac-b56d-5787c9429ccc', 'Promotion', '#ec4899', 7),
  ('044d6fb8-43bd-4042-9006-dc1b064ac744', 'Notification', '#6366f1', 8),
  ('31d79b25-3357-49bb-bad0-b1881590678e', 'Purchases', '#14b8a6', 9);

-- ============================================
-- MESSAGE RELATED TABLES
-- ============================================

-- Message to Label Mapping
CREATE TABLE message_custom_labels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  custom_label_id UUID REFERENCES custom_labels(id) ON DELETE CASCADE,
  -- Store grant_id(s) of the recipient account(s) that the label was applied for.
  -- Use TEXT[] to allow multiple grant_ids for multi-recipient messages.
  applied_by TEXT[] DEFAULT ARRAY[]::text[],
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(email_account_id, message_id, custom_label_id)
);

-- Message Cache
CREATE TABLE message_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  thread_id TEXT,
  subject TEXT,
  from_email TEXT,
  from_name TEXT,
  to_emails TEXT[],
  cc_emails TEXT[],
  snippet TEXT,
  body TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  is_starred BOOLEAN DEFAULT FALSE,
  has_attachments BOOLEAN DEFAULT FALSE,
  folder_ids TEXT[],
  received_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(email_account_id, message_id)
);

-- ============================================
-- USER PREFERENCES & TEMPLATES
-- ============================================

CREATE TABLE draft_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  category TEXT,
  is_favorite BOOLEAN DEFAULT FALSE,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  theme TEXT DEFAULT 'light',
  email_signature TEXT,
  auto_sync_enabled BOOLEAN DEFAULT TRUE,
  sync_interval_minutes INTEGER DEFAULT 5,
  default_send_account_id UUID REFERENCES email_accounts(id),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email);

-- Email accounts indexes
CREATE INDEX idx_email_accounts_user_id ON email_accounts(user_id);
CREATE INDEX idx_email_accounts_grant_id ON email_accounts(grant_id);
CREATE INDEX idx_email_accounts_is_primary ON email_accounts(user_id, is_primary);
CREATE INDEX idx_email_accounts_provider ON email_accounts(provider);

-- Message custom labels indexes
CREATE INDEX idx_message_custom_labels_account_message 
  ON message_custom_labels(email_account_id, message_id);
CREATE INDEX idx_message_custom_labels_label 
  ON message_custom_labels(custom_label_id);
CREATE INDEX idx_message_custom_labels_applied_at 
  ON message_custom_labels(applied_at DESC);

-- Message cache indexes
CREATE INDEX idx_message_cache_account_id ON message_cache(email_account_id);
CREATE INDEX idx_message_cache_thread_id ON message_cache(thread_id);
CREATE INDEX idx_message_cache_received_at ON message_cache(received_at DESC);
CREATE INDEX idx_message_cache_is_read ON message_cache(is_read);
CREATE INDEX idx_message_cache_is_starred ON message_cache(is_starred);

-- Draft templates indexes
CREATE INDEX idx_draft_templates_user_id ON draft_templates(user_id);
CREATE INDEX idx_draft_templates_category ON draft_templates(category);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_custom_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_labels ENABLE ROW LEVEL SECURITY;

-- User policies
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Email accounts policies
CREATE POLICY "Users can view own email accounts" ON email_accounts
  FOR ALL USING (auth.uid() = user_id);

-- Message policies
CREATE POLICY "Users can view own message custom labels" ON message_custom_labels
  FOR ALL USING (
    email_account_id IN (
      SELECT id FROM email_accounts WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own message cache" ON message_cache
  FOR ALL USING (
    email_account_id IN (
      SELECT id FROM email_accounts WHERE user_id = auth.uid()
    )
  );

-- Template and preferences policies
CREATE POLICY "Users can manage own templates" ON draft_templates
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own preferences" ON user_preferences
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Everyone can view custom labels" ON custom_labels
  FOR SELECT USING (true);

-- ============================================
-- SERVICE ROLE BYPASS POLICIES
-- ============================================

-- Service role bypass for all tables
CREATE POLICY "Service role bypass for users" ON users
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role bypass for email_accounts" ON email_accounts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role bypass for message_custom_labels" ON message_custom_labels
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role bypass for message_cache" ON message_cache
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role bypass for draft_templates" ON draft_templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role bypass for user_preferences" ON user_preferences
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- TRIGGERS FOR TIMESTAMP UPDATES
-- ============================================

-- Create timestamp update function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for all tables with updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_accounts_updated_at
    BEFORE UPDATE ON email_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_message_cache_updated_at
    BEFORE UPDATE ON message_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_draft_templates_updated_at
    BEFORE UPDATE ON draft_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add helpful comment about Nylas API usage
COMMENT ON TABLE email_accounts IS 'Nylas grant information. Usage: fetch(`https://api.us.nylas.com/v3/grants/${grant_id}/messages`, { headers: { Authorization: Bearer ${NYLAS_API_KEY} } })';