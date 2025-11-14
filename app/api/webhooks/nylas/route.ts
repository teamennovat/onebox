/**
 * WEBHOOK: Email Auto-Labeling System
 * 
 * When a message.created event is received from Nylas:
 * 1. Extract message subject + body
 * 2. Send to AI (Nebius API) for classification
 * 3. Get label name from AI response
 * 4. Find label ID from custom_labels table
 * 5. Save message_id + label_id to message_custom_labels table
 * 
 * That's it. Nothing else.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

// Get webhook secret and AI API key from environment
const WEBHOOK_SECRET = process.env.NYLAS_WEBHOOK_SECRET
const NEBIUS_API_KEY = process.env.NEBIUS_API_KEY

/**
 * Available labels mapping (matches your database)
 */
const LABEL_MAP: Record<string, string> = {
  'To Respond': 'e86be808-a059-4eb9-9753-2b3908f804d5',
  'Need Action': 'ddb9aa73-ed78-4eb2-9660-30bc326066c0',
  'FYI': 'cf71293b-58bc-4136-8427-3ab2e1662f4f',
  'Resolved': '3a863d85-e959-4fe1-904c-1dc4872cbf14',
  'Newsletter': 'be6ffdb8-9a6f-4ec3-8ad0-7e71ad79c854',
  'Schedules': '972b1c38-dcb2-4b7d-8db9-806473fcb6af',
  'Promotion': 'a6537970-7c3b-41ac-b56d-5787c9429ccc',
  'Notification': '044d6fb8-43bd-4042-9006-dc1b064ac744',
  'Purchases': '31d79b25-3357-49bb-bad0-b1881590678e',
}

/**
 * Verify webhook signature using HMAC-SHA256
 */
function verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
  if (!WEBHOOK_SECRET) {
    console.error('❌ NYLAS_WEBHOOK_SECRET not configured')
    return false
  }

  if (!signature) {
    console.error('❌ No x-nylas-signature header found')
    return false
  }

  try {
    const bodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8')
    const expected = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(bodyString)
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    )
  } catch (error) {
    console.error('❌ Signature verification failed:', error)
    return false
  }
}

/**
 * GET handler for webhook verification
 * Nylas needs this to verify the webhook endpoint is working
 */
export async function GET(request: NextRequest) {
  console.log('🔔 Webhook verification request')

  try {
    const { searchParams } = new URL(request.url)
    const challenge = searchParams.get('challenge')

    if (!challenge) {
      console.error('❌ Missing challenge parameter')
      return new NextResponse('Missing challenge', { status: 400 })
    }

    console.log('✅ Verification successful')
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(challenge).toString(),
      },
    })
  } catch (error) {
    console.error('❌ Verification error:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}

/**
 * Send message content to AI for classification
 * Returns: label name or null
 */
async function classifyMessageWithAI(subject: string, body: string): Promise<string | null> {
  try {
    if (!NEBIUS_API_KEY) {
      console.error('❌ NEBIUS_API_KEY not configured')
      return null
    }

    const systemPrompt = `You are an email-classification assistant.
Your task is to read the email content and classify it into exactly one of the following labels:
- To Respond – The sender expects or requests a reply.
- Need Action – The email requires a task or follow-up but not necessarily a reply.
- FYI – Informational only. No action or response required.
- Resolved – The issue is already done, closed, or resolved.
- Newsletter – Recurring or bulk update emails (newsletters, announcements, blogs).
- Schedules – Meetings, appointments, calendar availability, invites, rescheduling.
- Promotion – Discounts, sales, promo codes, advertisements, marketing emails.
- Notification – Automated alerts, confirmations, reminders, security notifications.
- Purchases – Orders, receipts, invoices, shipping, payment confirmations.

RULES:
Return only JSON, no explanations.
Use this exact structure: { "label": "One of the predefined labels" }
If multiple labels could apply, choose the most specific one.
Do not include extra fields.
If unsure, choose the label that best fits the main intent.`

    const userContent = `Subject: ${subject}

${body}`

    const response = await fetch('https://api.tokenfactory.nebius.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NEBIUS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemma-2-2b-it',
        max_tokens: 128,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    })

    if (!response.ok) {
      console.error(`❌ AI API error: ${response.status}`)
      return null
    }

    const data = await response.json()
    const aiResponse = data.choices?.[0]?.message?.content

    if (!aiResponse) {
      console.error('❌ No response from AI')
      return null
    }

    // Parse JSON response from AI
    const parsed = JSON.parse(aiResponse)
    const labelName = parsed.label

    // Validate label name
    if (!labelName || !LABEL_MAP[labelName]) {
      console.warn(`⚠️ Invalid label from AI: ${labelName}`)
      return null
    }

    console.log(`✅ AI classified as: ${labelName}`)
    return labelName
  } catch (error) {
    console.error('❌ AI classification error:', error)
    return null
  }
}

/**
 * Get email_account_id from grant_id
 */
async function getEmailAccountId(grantId: string): Promise<string | null> {
  try {
    if (!supabaseAdmin) {
      console.error('❌ Supabase admin client not available')
      return null
    }

    const { data, error } = await supabaseAdmin!
      .from('email_accounts')
      .select('id')
      .eq('grant_id', grantId)
      .single()

    if (error) {
      console.error('❌ Error finding email account:', error)
      return null
    }

    return data?.id || null
  } catch (error) {
    console.error('❌ Error querying email account:', error)
    return null
  }
}

/**
 * Save label to message_custom_labels table
 */
async function labelMessage(
  emailAccountId: string,
  messageId: string,
  labelName: string
): Promise<boolean> {
  try {
    if (!supabaseAdmin) {
      console.error('❌ Supabase admin client not available')
      return false
    }

    const labelId = LABEL_MAP[labelName]

    if (!labelId) {
      console.error(`❌ Label not found: ${labelName}`)
      return false
    }

    const { error } = await supabaseAdmin!
      .from('message_custom_labels')
      .insert({
        email_account_id: emailAccountId,
        message_id: messageId,
        custom_label_id: labelId,
        applied_at: new Date().toISOString(),
      })

    if (error) {
      // Check if it's a duplicate (already labeled)
      if (error.code === '23505') {
        console.log(`ℹ️ Message already labeled: ${messageId}`)
        return true
      }
      console.error('❌ Error saving label:', error)
      return false
    }

    console.log(`✅ Labeled message ${messageId} with ${labelName}`)
    return true
  } catch (error) {
    console.error('❌ Error in labelMessage:', error)
    return false
  }
}

/**
 * Handle message.created webhook event
 */
async function handleMessageCreated(message: any): Promise<void> {
  try {
    const { id: messageId, grant_id: grantId, subject, body, html } = message

    console.log(`\n📨 Processing new message: ${messageId}`)

    // Get email account ID
    const emailAccountId = await getEmailAccountId(grantId)
    if (!emailAccountId) {
      console.error(`❌ Could not find email account for grant: ${grantId}`)
      return
    }

    // Extract text from body or html
    const emailBody = body || html || ''

    // Truncate for AI to avoid token limits
    const truncatedBody = emailBody.substring(0, 2000)

    // Classify with AI
    const labelName = await classifyMessageWithAI(subject || '', truncatedBody)

    if (!labelName) {
      console.warn(`⚠️ Could not classify message: ${messageId}`)
      return
    }

    // Save label to database
    const success = await labelMessage(emailAccountId, messageId, labelName)

    if (success) {
      console.log(`✨ Successfully labeled message ${messageId} → ${labelName}`)
    }
  } catch (error) {
    console.error('❌ Error handling message.created:', error)
  }
}

/**
 * POST handler for webhook notifications
 */
export async function POST(request: NextRequest) {
  console.log('\n🔔 Webhook notification received')

  try {
    // Get raw body for signature verification
    const rawBody = await request.text()
    const signature = request.headers.get('x-nylas-signature')

    // Verify signature
    if (!verifyWebhookSignature(rawBody, signature || '')) {
      console.error('❌ Invalid webhook signature')
      return new NextResponse('Unauthorized', { status: 401 })
    }

    console.log('✅ Signature verified')

    // Parse JSON
    let payload
    try {
      payload = JSON.parse(rawBody)
    } catch (error) {
      console.error('❌ Failed to parse JSON:', error)
      return new NextResponse('Invalid JSON', { status: 400 })
    }

    const eventType = payload.type
    console.log(`📬 Event type: ${eventType}`)

    // Only handle message.created events
    if (eventType !== 'message.created') {
      console.log(`ℹ️ Ignoring event type: ${eventType} (only handling message.created)`)
      return new NextResponse('OK', { status: 200 })
    }

    // Process each message in the event
    const messages = Array.isArray(payload.data) ? payload.data : [payload.data]
    console.log(`Processing ${messages.length} message(s)`)

    // Process messages asynchronously (don't wait for AI/DB)
    for (const message of messages) {
      handleMessageCreated(message).catch(error => {
        console.error('❌ Error processing message:', error)
      })
    }

    // Respond immediately with 200 OK
    // Messages are processed in the background
    console.log('📤 Responded with 200 OK')
    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    console.error('❌ Webhook error:', error)
    // Still respond with 200 to prevent Nylas retries
    return new NextResponse('OK', { status: 200 })
  }
}

/**
 * Handle OPTIONS requests (CORS preflight)
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-nylas-signature',
    },
  })
}
