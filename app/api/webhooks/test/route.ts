import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * TEST ENDPOINT: Simulate incoming email from Nylas
 * POST https://onebox-eight-delta.vercel.app/api/webhooks/test
 * 
 * Body:
 * {
 *   "subject": "50% off sale",
 *   "body": "Limited time offer on all products"
 * }
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

    // Get grant_id from database if not provided
    if (!grantId && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('email_accounts')
        .select('grant_id')
        .limit(1)
        .single()

      if (data?.grant_id) {
        grantId = data.grant_id
      }
    }

    if (!grantId) {
      return NextResponse.json(
        { error: 'No email accounts found. Connect an account first.' },
        { status: 400 }
      )
    }

    // Generate message ID
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`

    // Create payload
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

    // Create signature
    const webhookSecret = process.env.NYLAS_WEBHOOK_SECRET || 'test_secret'
    const rawBody = JSON.stringify(payload)
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex')

    // Call real webhook
    const webhookUrl = new URL('/api/webhooks/nylas', request.nextUrl.origin)
    const webhookResponse = await fetch(webhookUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nylas-signature': signature,
      },
      body: rawBody,
    })

    return NextResponse.json({
      success: true,
      messageId: messageId,
      grantId: grantId,
      webhookStatus: webhookResponse.status,
      next: 'Wait 5 seconds and check database',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: 'POST /api/webhooks/test',
    body: {
      subject: 'Email subject line',
      body: 'Email body content',
    },
  })
}
