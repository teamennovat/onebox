/**
 * Webhook utility functions for Nylas integration
 * 
 * This file contains helper functions for webhook operations:
 * - Creating/managing webhooks
 * - Testing webhooks
 * - Handling webhook events
 */

import crypto from 'crypto'

/**
 * Webhook configuration
 */
export const WEBHOOK_CONFIG = {
  SECRET: process.env.NYLAS_WEBHOOK_SECRET,
  URL: process.env.WEBHOOK_URL || `${process.env.NEXTAUTH_URL}/api/webhooks/nylas`,
  
  // Event types to listen for
  EVENTS: [
    'message.created',
    'message.updated',
    'message.deleted',
    'folder.created',
    'folder.updated',
    'folder.deleted',
    'draft.created',
    'draft.updated',
    'draft.deleted',
    'thread.replied',
    'thread.updated',
  ],
}

/**
 * Create HMAC-SHA256 signature for testing
 * 
 * @param body - Request body as string
 * @param secret - Webhook secret
 * @returns Hex-encoded HMAC-SHA256 signature
 */
export function createWebhookSignature(body: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')
}

/**
 * Generate test webhook payload
 * 
 * @param eventType - Type of event (e.g., 'message.created')
 * @param data - Event data (optional)
 * @returns Mock webhook payload
 */
export function generateTestWebhookPayload(
  eventType: string,
  data?: Record<string, any>
) {
  const payloads: Record<string, any> = {
    'message.created': {
      type: 'message.created',
      data: [
        {
          id: 'msg_' + Math.random().toString(36).substr(2, 9),
          grant_id: 'grant_' + Math.random().toString(36).substr(2, 9),
          subject: 'Test Email Subject',
          from: [{ email: 'sender@example.com', name: 'Test Sender' }],
          to: [{ email: 'recipient@example.com', name: 'Test Recipient' }],
          body: 'This is a test email body.',
          date: Math.floor(Date.now() / 1000),
          unread: true,
          starred: false,
          folders: ['INBOX'],
          has_attachments: false,
        },
      ],
    },
    'message.updated': {
      type: 'message.updated',
      data: [
        {
          id: 'msg_' + Math.random().toString(36).substr(2, 9),
          grant_id: 'grant_' + Math.random().toString(36).substr(2, 9),
          unread: false,
          starred: true,
        },
      ],
    },
    'message.deleted': {
      type: 'message.deleted',
      data: [
        {
          id: 'msg_' + Math.random().toString(36).substr(2, 9),
          grant_id: 'grant_' + Math.random().toString(36).substr(2, 9),
        },
      ],
    },
    'folder.created': {
      type: 'folder.created',
      data: [
        {
          id: 'folder_' + Math.random().toString(36).substr(2, 9),
          grant_id: 'grant_' + Math.random().toString(36).substr(2, 9),
          display_name: 'Test Folder',
          parent_id: 'INBOX',
        },
      ],
    },
    'folder.updated': {
      type: 'folder.updated',
      data: [
        {
          id: 'folder_' + Math.random().toString(36).substr(2, 9),
          grant_id: 'grant_' + Math.random().toString(36).substr(2, 9),
          display_name: 'Updated Folder',
          unread_count: 5,
        },
      ],
    },
    'draft.created': {
      type: 'draft.created',
      data: [
        {
          id: 'draft_' + Math.random().toString(36).substr(2, 9),
          grant_id: 'grant_' + Math.random().toString(36).substr(2, 9),
          subject: 'Draft Email',
          to: [{ email: 'recipient@example.com' }],
          body: 'This is a draft email.',
        },
      ],
    },
    'thread.replied': {
      type: 'thread.replied',
      data: [
        {
          id: 'thread_' + Math.random().toString(36).substr(2, 9),
          grant_id: 'grant_' + Math.random().toString(36).substr(2, 9),
          subject: 'Test Thread',
          participants: [
            { email: 'user1@example.com', name: 'User 1' },
            { email: 'user2@example.com', name: 'User 2' },
          ],
        },
      ],
    },
  }

  const payload = payloads[eventType] || payloads['message.created']

  // Merge custom data if provided
  if (data && payload.data) {
    payload.data[0] = { ...payload.data[0], ...data }
  }

  return payload
}

/**
 * Webhook event queue (in-memory for now)
 * In production, use a proper job queue like Bull, RabbitMQ, or AWS SQS
 */
const eventQueue: any[] = []

/**
 * Queue webhook event for processing
 * 
 * @param event - Webhook event payload
 */
export function queueEvent(event: any): void {
  eventQueue.push({
    timestamp: new Date(),
    event,
    processed: false,
  })

  console.log(`📦 Event queued (total: ${eventQueue.length})`)

  // Process in background (non-blocking)
  // In production, use setImmediate or a job queue
  setImmediate(() => {
    processQueuedEvent(event)
  })
}

/**
 * Process a queued webhook event
 * 
 * @param event - Webhook event payload
 */
async function processQueuedEvent(event: any): Promise<void> {
  try {
    console.log(`⚙️ Processing event: ${event.type}`)

    // Add your event processing logic here
    // Examples:
    // - Save to database
    // - Trigger email sync
    // - Send real-time updates
    // - Call other APIs

    // Simulate async processing
    await new Promise((resolve) => setTimeout(resolve, 100))

    console.log(`✅ Event processed: ${event.type}`)
  } catch (error) {
    console.error(`❌ Error processing event: ${event.type}`, error)
    // In production, implement retry logic
  }
}

/**
 * Get webhook event queue status
 * 
 * @returns Queue statistics
 */
export function getQueueStatus() {
  const processed = eventQueue.filter((e) => e.processed).length
  const pending = eventQueue.filter((e) => !e.processed).length

  return {
    total: eventQueue.length,
    processed,
    pending,
    oldestEvent: eventQueue[0]?.timestamp,
    latestEvent: eventQueue[eventQueue.length - 1]?.timestamp,
  }
}

/**
 * Clear webhook event queue
 * WARNING: Only use in development/testing
 */
export function clearQueue(): void {
  const count = eventQueue.length
  eventQueue.length = 0
  console.log(`🗑️ Cleared ${count} events from queue`)
}

/**
 * Format webhook event for logging
 * 
 * @param event - Webhook event payload
 * @returns Formatted log string
 */
export function formatEventLog(event: any): string {
  const type = event.type || 'unknown'
  const dataCount = Array.isArray(event.data) ? event.data.length : 1
  const grantId = event.data?.[0]?.grant_id || 'unknown'

  return `[${type}] ${dataCount} item(s) | Grant: ${grantId}`
}

/**
 * Webhook event validators
 */
export const validateWebhookEvent = {
  /**
   * Validate message event
   */
  message: (event: any): boolean => {
    return (
      event.type?.startsWith('message.') &&
      event.data &&
      Array.isArray(event.data) &&
      event.data.every((msg: any) => msg.id && msg.grant_id)
    )
  },

  /**
   * Validate folder event
   */
  folder: (event: any): boolean => {
    return (
      event.type?.startsWith('folder.') &&
      event.data &&
      Array.isArray(event.data) &&
      event.data.every((folder: any) => folder.id && folder.grant_id)
    )
  },

  /**
   * Validate draft event
   */
  draft: (event: any): boolean => {
    return (
      event.type?.startsWith('draft.') &&
      event.data &&
      Array.isArray(event.data) &&
      event.data.every((draft: any) => draft.id && draft.grant_id)
    )
  },

  /**
   * Validate thread event
   */
  thread: (event: any): boolean => {
    return (
      event.type?.startsWith('thread.') &&
      event.data &&
      Array.isArray(event.data) &&
      event.data.every((thread: any) => thread.id && thread.grant_id)
    )
  },

  /**
   * Validate any webhook event
   */
  any: (event: any): boolean => {
    return event.type && event.data && typeof event.type === 'string'
  },
}

/**
 * Get mock notification payload for testing
 * Use this to test your webhook handlers without real Nylas events
 * 
 * @param eventType - Event type name
 * @returns Mock notification payload
 */
export function getMockNotificationPayload(eventType: string) {
  const payloads: Record<string, any> = {
    'message.created': {
      type: 'message.created',
      data: [
        {
          id: 'msg_19a5c9a7e2ce7f8a',
          grant_id: '73f45dcc-27e3-4bca-9c90-cc0f60d048a9',
          subject: 'Hello World',
          from: [{ email: 'test@example.com', name: 'Test User' }],
          to: [{ email: 'you@example.com', name: 'You' }],
          body: 'This is a test message.',
          date: Math.floor(Date.now() / 1000),
          unread: true,
          starred: false,
          folders: ['INBOX'],
          has_attachments: false,
          thread_id: 'thread_abc123',
        },
      ],
    },
    'message.updated': {
      type: 'message.updated',
      data: [
        {
          id: 'msg_19a5c9a7e2ce7f8a',
          grant_id: '73f45dcc-27e3-4bca-9c90-cc0f60d048a9',
          unread: false,
          starred: true,
        },
      ],
    },
    'message.deleted': {
      type: 'message.deleted',
      data: [
        {
          id: 'msg_19a5c9a7e2ce7f8a',
          grant_id: '73f45dcc-27e3-4bca-9c90-cc0f60d048a9',
        },
      ],
    },
    'folder.created': {
      type: 'folder.created',
      data: [
        {
          id: 'CUSTOM_FOLDER',
          grant_id: '73f45dcc-27e3-4bca-9c90-cc0f60d048a9',
          display_name: 'My Custom Folder',
          parent_id: null,
        },
      ],
    },
    'draft.created': {
      type: 'draft.created',
      data: [
        {
          id: 'draft_xyz789',
          grant_id: '73f45dcc-27e3-4bca-9c90-cc0f60d048a9',
          subject: 'Draft Email',
          to: [{ email: 'recipient@example.com', name: 'Recipient' }],
          body: 'This is a draft.',
        },
      ],
    },
  }

  return payloads[eventType] || payloads['message.created']
}
