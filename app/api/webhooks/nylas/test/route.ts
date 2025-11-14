import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * TEST ENDPOINT: Simulate incoming email from Nylas
 * Automatically gets grant_id from your email_accounts table
 * 
 * Usage:
 * curl https://onebox-eight-delta.vercel.app/api/webhooks/nylas/test \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "subject": "50% off everything",
 *     "body": "Limited time offer on all products"
 *   }'
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    let { subject, body: emailBody, grantId } = body

    if (!subject || !emailBody) {
      return NextResponse.json(
        { error: 'Missing subject or body' },
        { status: 400 }
      )
    }

    // If no grantId provided, get the first one from database
    if (!grantId) {
      if (!supabaseAdmin) {
        return NextResponse.json(
          { error: 'Cannot fetch grant_id from database' },
          { status: 500 }
        )
      }

      const { data, error } = await supabaseAdmin!
        .from('email_accounts')
        .select('grant_id')
        .limit(1)
        .single()

      if (error || !data?.grant_id) {
        return NextResponse.json(
          { error: 'No email accounts found. Connect an account first.' },
          { status: 400 }
        )
      }

      grantId = data.grant_id
    }

    // Generate a fake message ID
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`

    // Create test webhook payload
    const webhookSecret = process.env.NYLAS_WEBHOOK_SECRET || 'test_secret'

    const payload = {
      type: 'message.created',
      data: [
        {
          id: messageId,
          grant_id: grantId,
          subject: subject,
          body: emailBody,
          html: `<p>${emailBody.replace(/\n/g, '<br>')}</p>`,
        },
      ],
    }

    const rawBody = JSON.stringify(payload)
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex')

    // Call webhook endpoint
    const webhookUrl = new URL('/api/webhooks/nylas', request.nextUrl.origin)
    const webhookResponse = await fetch(webhookUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nylas-signature': signature,
      },
      body: rawBody,
    })

    const webhookData = await webhookResponse.text()

    return NextResponse.json({
      success: true,
      message: 'Test webhook sent successfully',
      messageId: messageId,
      grantId: grantId,
      payload: payload,
      webhookStatus: webhookResponse.status,
      next: 'Wait 3-5 seconds then check database: SELECT * FROM message_custom_labels ORDER BY applied_at DESC LIMIT 1;',
    })
  } catch (error) {
    console.error('Test endpoint error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Test endpoint for webhook simulation',
    endpoint: 'POST /api/webhooks/nylas/test',
    usage: 'Send JSON with subject and body',
    note: 'grantId is auto-detected from your first connected email account',
    examples: [
      {
        subject: '50% off sale',
        body: 'Limited time offer on all products - buy now!',
      },
      {
        subject: 'Team Meeting Tomorrow at 2pm',
        body: 'We have a team sync scheduled for tomorrow at 2pm EST',
      },
      {
        subject: 'Invoice #12345',
        body: 'Please find your invoice attached. Payment due by end of month.',
      },
    ],
  })
}
