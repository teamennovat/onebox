/**
 * Webhook Testing Endpoint
 * 
 * Use this endpoint to test your webhook implementation locally
 * 
 * Available endpoints:
 * - GET /api/webhooks/test - Get test webhook information
 * - POST /api/webhooks/test/send - Send a test webhook event
 * - POST /api/webhooks/test/generate - Generate test payload with signature
 * - GET /api/webhooks/test/queue - View webhook event queue status
 * - POST /api/webhooks/test/queue/clear - Clear webhook event queue
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  createWebhookSignature,
  generateTestWebhookPayload,
  getMockNotificationPayload,
  getQueueStatus,
  clearQueue,
  formatEventLog,
} from '@/lib/webhook-utils'

// Only allow in development
function isDevelopment() {
  return process.env.NODE_ENV === 'development'
}

/**
 * GET /api/webhooks/test
 * Get test webhook information and help
 */
export async function GET(request: NextRequest) {
  if (!isDevelopment()) {
    return new NextResponse('Not available in production', { status: 403 })
  }

  const { searchParams } = new URL(request.url)

  // If requesting queue status
  if (searchParams.get('queue') === 'true') {
    return NextResponse.json({
      status: 'success',
      queueStatus: getQueueStatus(),
    })
  }

  // Otherwise return help information
  return NextResponse.json({
    webhook: {
      url: `${process.env.NEXTAUTH_URL}/api/webhooks/nylas`,
      secret: process.env.NYLAS_WEBHOOK_SECRET
        ? '••••••••' + process.env.NYLAS_WEBHOOK_SECRET.slice(-8)
        : 'NOT SET',
    },
    endpoints: {
      'GET /api/webhooks/test': 'Get this help message',
      'GET /api/webhooks/test?queue=true': 'View webhook event queue status',
      'POST /api/webhooks/test/send': 'Send a test webhook event',
      'POST /api/webhooks/test/generate': 'Generate test payload with signature',
      'POST /api/webhooks/test/queue/clear': 'Clear webhook event queue',
    },
    testing: {
      curl_verify: `curl -X GET "${process.env.NEXTAUTH_URL}/api/webhooks/nylas?challenge=test_challenge"`,
      curl_send:
        'curl -X POST with x-nylas-signature header (see /api/webhooks/test/send)',
    },
  })
}

/**
 * POST /api/webhooks/test/send
 * Send a test webhook event to your webhook endpoint
 * 
 * Body:
 * {
 *   "eventType": "message.created",  // or any supported event type
 *   "data": { ... }                   // optional custom data
 * }
 */
export async function POST(request: NextRequest) {
  if (!isDevelopment()) {
    return new NextResponse('Not available in production', { status: 403 })
  }

  const url = new URL(request.url)

  // Handle queue clear endpoint
  if (url.pathname.endsWith('/queue/clear')) {
    clearQueue()
    return NextResponse.json({
      status: 'success',
      message: 'Queue cleared',
    })
  }

  // Handle generate endpoint
  if (url.pathname.endsWith('/generate')) {
    try {
      const body = await request.json()
      const eventType = body.eventType || 'message.created'
      const customData = body.data || {}

      const payload = generateTestWebhookPayload(eventType, customData)
      const payloadString = JSON.stringify(payload)
      const signature = createWebhookSignature(
        payloadString,
        process.env.NYLAS_WEBHOOK_SECRET || 'test_secret'
      )

      return NextResponse.json({
        status: 'success',
        payload,
        signature,
        curlCommand: `curl -X POST "${process.env.NEXTAUTH_URL}/api/webhooks/nylas" \\
  -H "x-nylas-signature: ${signature}" \\
  -H "Content-Type: application/json" \\
  -d '${payloadString}'`,
        headers: {
          'x-nylas-signature': signature,
          'Content-Type': 'application/json',
        },
      })
    } catch (error) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Failed to generate test payload',
          error: String(error),
        },
        { status: 400 }
      )
    }
  }

  // Handle send endpoint
  if (url.pathname.endsWith('/send')) {
    try {
      const body = await request.json()
      const eventType = body.eventType || 'message.created'
      const customData = body.data || {}

      // Generate test payload
      const payload = generateTestWebhookPayload(eventType, customData)
      const payloadString = JSON.stringify(payload)

      // Create signature
      const signature = createWebhookSignature(
        payloadString,
        process.env.NYLAS_WEBHOOK_SECRET || 'test_secret'
      )

      // Send to webhook endpoint
      const webhookUrl = `${process.env.NEXTAUTH_URL}/api/webhooks/nylas`
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'x-nylas-signature': signature,
          'Content-Type': 'application/json',
        },
        body: payloadString,
      })

      const responseText = await response.text()

      return NextResponse.json({
        status: 'success',
        message: 'Test webhook sent',
        sentPayload: payload,
        webhookResponse: {
          status: response.status,
          statusText: response.statusText,
          body: responseText,
        },
        eventLog: formatEventLog(payload),
      })
    } catch (error) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Failed to send test webhook',
          error: String(error),
        },
        { status: 500 }
      )
    }
  }

  return NextResponse.json(
    { status: 'error', message: 'Unknown endpoint' },
    { status: 404 }
  )
}
