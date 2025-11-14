#!/bin/bash
# Supabase Webhook Integration Setup Script
# Run this to get your Supabase webhook integration ready

set -e

echo "🚀 Supabase Webhook Integration Setup"
echo "====================================="
echo ""

# Check environment variables
echo "✅ Checking environment variables..."
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
  echo "❌ NEXT_PUBLIC_SUPABASE_URL not set"
  exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ SUPABASE_SERVICE_ROLE_KEY not set"
  exit 1
fi

if [ -z "$NYLAS_WEBHOOK_SECRET" ]; then
  echo "❌ NYLAS_WEBHOOK_SECRET not set"
  exit 1
fi

echo "✅ All required environment variables found"
echo ""

# Display SQL setup instructions
echo "📊 Database Setup"
echo "=================="
echo "Run these SQL commands in your Supabase SQL Editor:"
echo ""
echo "1. Open Supabase Dashboard"
echo "2. Go to SQL Editor"
echo "3. Create a new query"
echo "4. Copy and paste the content from: WEBHOOK_SUPABASE_INTEGRATION.md"
echo ""
echo "Or download the schema file:"
echo "  - Open: WEBHOOK_SUPABASE_INTEGRATION.md"
echo "  - Copy the 'Database Schema' section"
echo "  - Paste into Supabase SQL Editor"
echo ""

# Display next steps
echo "📝 Next Steps"
echo "============="
echo ""
echo "1. Create Database Schema"
echo "   - Open WEBHOOK_SUPABASE_INTEGRATION.md"
echo "   - Run all SQL statements in your Supabase SQL Editor"
echo ""
echo "2. Update Webhook Route Handler"
echo "   - File: app/api/webhooks/nylas/route.ts"
echo "   - Import handlers from lib/webhook-handlers-examples.ts"
echo "   - Replace console.log() with actual handler calls"
echo ""
echo "3. Test Webhook"
echo "   - Run: curl -X POST http://localhost:3000/api/webhooks/test -H \"Content-Type: application/json\" -d '{\"action\":\"generate\",\"eventType\":\"message.created\"}'"
echo "   - This generates a test payload"
echo ""
echo "4. Verify in Database"
echo "   - SELECT * FROM messages WHERE grant_id = 'YOUR_GRANT_ID';"
echo ""
echo "5. Deploy and Configure in Nylas Dashboard"
echo "   - Application → Webhooks → Add Webhook"
echo "   - Webhook URL: https://yourdomain.com/api/webhooks/nylas"
echo "   - Events: message.created, message.updated, message.deleted, etc."
echo ""

echo "🎉 Setup complete!"
echo ""
echo "For more details, see:"
echo "  - WEBHOOK_SUPABASE_INTEGRATION.md"
echo "  - WEBHOOK_IMPLEMENTATION.md"
echo "  - lib/webhook-handlers-examples.ts"
