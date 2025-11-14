/**
 * Example Webhook Event Handlers
 * 
 * This file contains example implementations of webhook event processing.
 * Adapt these to your specific use case and database schema.
 */

import { supabaseAdmin } from '@/lib/supabase'

/**
 * EXAMPLE 1: Save new message to database
 */
export async function handleMessageCreatedExample(message: any) {
  try {
    if (!supabaseAdmin) throw new Error('Supabase admin client not available')

    // Save to database
    const { data: savedMessage, error } = await supabaseAdmin!
      .from('messages')
      .insert({
        id: message.id,
        grant_id: message.grant_id,
        subject: message.subject || '(No subject)',
        from_email: message.from?.[0]?.email || '',
        to_emails: message.to?.map((t: any) => t.email).join(', ') || '',
        cc_emails: message.cc?.map((c: any) => c.email).join(', ') || '',
        body: message.body || message.html || '',
        html: message.html,
        snippet: message.snippet,
        date: new Date(message.date * 1000).toISOString(),
        unread: message.unread,
        starred: message.starred || false,
        has_attachments: message.has_attachments || false,
        thread_id: message.thread_id,
        labels: message.folders || ['inbox'],
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    console.log(`✅ Saved message: ${savedMessage.id}`)
    return savedMessage
  } catch (error) {
    console.error('❌ Error saving message:', error)
    throw error
  }
}

/**
 * EXAMPLE 2: Update message status in database
 */
export async function handleMessageUpdatedExample(message: any) {
  try {
    if (!supabaseAdmin) throw new Error('Supabase admin client not available')

    // Update message in database
    const updateData: any = {}
    if (message.unread !== undefined) updateData.unread = message.unread
    if (message.starred !== undefined) updateData.starred = message.starred
    if (message.folders) updateData.labels = message.folders

    const { data: updated, error } = await supabaseAdmin
      .from('messages')
      .update(updateData)
      .eq('id', message.id)
      .select()
      .single()

    if (error) throw error

    console.log(`✅ Updated message: ${updated.id}`)
    return updated
  } catch (error) {
    console.error('❌ Error updating message:', error)
    throw error
  }
}

/**
 * EXAMPLE 3: Delete message from database
 */
export async function handleMessageDeletedExample(messageId: string) {
  try {
    if (!supabaseAdmin) throw new Error('Supabase admin client not available')

    // Delete message from database
    const { error } = await supabaseAdmin
      .from('messages')
      .delete()
      .eq('id', messageId)

    if (error) throw error

    console.log(`✅ Deleted message: ${messageId}`)
  } catch (error) {
    console.error('❌ Error deleting message:', error)
    throw error
  }
}

/**
 * EXAMPLE 4: Handle truncated message event
 */
export async function handleTruncatedMessageExample(
  messageId: string,
  grantId: string
) {
  try {
    // Fetch full message from Nylas API
    const nylasApiKey = process.env.NYLAS_API_KEY
    const response = await fetch(
      `https://api.us.nylas.com/v3/grants/${grantId}/messages/${messageId}`,
      {
        headers: {
          Authorization: `Bearer ${nylasApiKey}`,
          Accept: 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Nylas API error: ${response.status}`)
    }

    const fullMessage = await response.json()

    // Save full message to database using upsert
    if (!supabaseAdmin) throw new Error('Supabase admin client not available')

    const { data: savedMessage, error } = await supabaseAdmin!
      .from('messages')
      .upsert(
        {
          id: fullMessage.id,
          grant_id: fullMessage.grant_id,
          subject: fullMessage.subject || '(No subject)',
          from_email: fullMessage.from?.[0]?.email || '',
          body: fullMessage.body || fullMessage.html || '',
          html: fullMessage.html,
          date: new Date(fullMessage.date * 1000).toISOString(),
          snippet: fullMessage.snippet,
          unread: fullMessage.unread,
          starred: fullMessage.starred || false,
          has_attachments: fullMessage.has_attachments || false,
        },
        { onConflict: 'id' }
      )
      .select()
      .single()

    if (error) throw error

    console.log(`✅ Saved truncated message: ${savedMessage.id}`)
    return savedMessage
  } catch (error) {
    console.error('❌ Error handling truncated message:', error)
    throw error
  }
}

/**
 * EXAMPLE 5: Update folder information
 */
export async function handleFolderUpdatedExample(folder: any) {
  try {
    if (!supabaseAdmin) throw new Error('Supabase admin client not available')

    // Update folder in database using upsert
    const { data: updated, error } = await supabaseAdmin
      .from('folders')
      .upsert(
        {
          id: folder.id,
          grant_id: folder.grant_id,
          name: folder.display_name,
          parent_id: folder.parent_id,
          unread_count: folder.unread_count || 0,
          total_count: folder.total_count || 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select()
      .single()

    if (error) throw error

    console.log(`✅ Updated folder: ${updated.name}`)
    return updated
  } catch (error) {
    console.error('❌ Error updating folder:', error)
    throw error
  }
}

/**
 * EXAMPLE 6: Real-time notification via Socket.IO
 */
export function notifyFrontendExample(event: any, io: any) {
  const grantId = event.data?.[0]?.grant_id
  if (!grantId) return

  // Notify all connected clients for this user
  io.to(`grant:${grantId}`).emit('email:event', {
    type: event.type,
    data: event.data,
    timestamp: new Date().toISOString(),
  })

  console.log(`📤 Sent real-time update to grant: ${grantId}`)
}

/**
 * EXAMPLE 7: Process draft creation
 */
export async function handleDraftCreatedExample(draft: any) {
  try {
    if (!supabaseAdmin) throw new Error('Supabase admin client not available')

    // Save draft to database
    const { data: savedDraft, error } = await supabaseAdmin
      .from('drafts')
      .insert({
        id: draft.id,
        grant_id: draft.grant_id,
        subject: draft.subject || '(No subject)',
        to_emails: draft.to?.map((t: any) => t.email).join(', ') || '',
        cc_emails: draft.cc?.map((c: any) => c.email).join(', ') || '',
        bcc_emails: draft.bcc?.map((b: any) => b.email).join(', ') || '',
        body: draft.body || draft.html || '',
        html: draft.html,
        created_at: new Date(draft.created_at * 1000).toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    console.log(`✅ Saved draft: ${savedDraft.id}`)
    return savedDraft
  } catch (error) {
    console.error('❌ Error saving draft:', error)
    throw error
  }
}

/**
 * EXAMPLE 8: Update folder unread count on message creation
 */
export async function updateFolderCountsExample(message: any) {
  try {
    if (!supabaseAdmin) throw new Error('Supabase admin client not available')

    // Increment unread count for INBOX folder if message is unread
    if (message.unread && message.folders?.includes('INBOX')) {
      const { error: inboxError } = await supabaseAdmin.rpc('increment_folder_count', {
        folder_id_param: 'INBOX',
        count_type: 'unread',
      })
      if (inboxError) console.warn('Error incrementing INBOX unread count:', inboxError)
    }

    // Increment total count
    if (message.folders?.[0]) {
      const { error: totalError } = await supabaseAdmin.rpc('increment_folder_count', {
        folder_id_param: message.folders[0],
        count_type: 'total',
      })
      if (totalError) console.warn('Error incrementing folder total count:', totalError)
    }

    console.log(`✅ Updated folder counts for message: ${message.id}`)
  } catch (error) {
    console.error('❌ Error updating folder counts:', error)
    throw error
  }
}

/**
 * EXAMPLE 9: Trigger email sync for a grant
 */
export async function triggerSyncExample(grantId: string) {
  try {
    if (!supabaseAdmin) throw new Error('Supabase admin client not available')

    // Queue a full sync job
    const { data, error } = await supabaseAdmin
      .from('sync_jobs')
      .insert({
        grant_id: grantId,
        type: 'FULL_SYNC',
        status: 'PENDING',
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    console.log(`✅ Queued sync job for grant: ${grantId}`)
  } catch (error) {
    console.error('❌ Error triggering sync:', error)
    throw error
  }
}

/**
 * EXAMPLE 10: Send email notification to user
 */
export async function notifyUserExample(message: any, recipientEmail: string) {
  try {
    // Send email notification
    const emailClient = require('@/lib/email-client') // Your email service

    await emailClient.send({
      to: recipientEmail,
      subject: `New email: ${message.subject}`,
      html: `
        <h2>New Email Received</h2>
        <p><strong>From:</strong> ${message.from?.[0]?.email}</p>
        <p><strong>Subject:</strong> ${message.subject}</p>
        <p><strong>Preview:</strong> ${message.snippet}</p>
        <a href="https://yourdomain.com/mail">View in Inbox</a>
      `,
    })

    console.log(`✅ Sent notification to: ${recipientEmail}`)
  } catch (error) {
    console.error('❌ Error sending notification:', error)
    throw error
  }
}

/**
 * EXAMPLE 11: Extract attachments from message
 */
export async function handleAttachmentsExample(message: any) {
  try {
    if (!supabaseAdmin) throw new Error('Supabase admin client not available')

    if (!message.has_attachments || !message.attachments) {
      return
    }

    // Save attachment metadata to database
    const attachmentData = message.attachments.map((attachment: any) => ({
      id: attachment.id,
      message_id: message.id,
      filename: attachment.filename,
      content_type: attachment.content_type,
      size: attachment.size,
      download_url: `https://api.us.nylas.com/v3/messages/${message.id}/attachments/${attachment.id}`,
      created_at: new Date().toISOString(),
    }))

    const { error } = await supabaseAdmin
      .from('attachments')
      .insert(attachmentData)

    if (error) throw error

    console.log(
      `✅ Saved ${message.attachments.length} attachment(s) for message: ${message.id}`
    )
  } catch (error) {
    console.error('❌ Error handling attachments:', error)
    throw error
  }
}

/**
 * EXAMPLE 12: Batch process webhook events
 */
export async function batchProcessExample(events: any[]) {
  try {
    // Group events by type
    const eventsByType = events.reduce(
      (acc: Record<string, any[]>, event: any) => {
        if (!acc[event.type]) {
          acc[event.type] = []
        }
        acc[event.type].push(event)
        return acc
      },
      {} as Record<string, any[]>
    )

    // Process each group
    for (const [type, typeEvents] of Object.entries(eventsByType)) {
      console.log(`Processing ${typeEvents.length} ${type} events`)

      if (type === 'message.created') {
        // Batch create messages
        for (const event of typeEvents) {
          for (const message of (event as any).data) {
            await handleMessageCreatedExample(message)
          }
        }
      }
      // ... handle other types
    }

    console.log(`✅ Batch processed ${events.length} events`)
  } catch (error) {
    console.error('❌ Error batch processing:', error)
    throw error
  }
}

/**
 * Integration Example: Complete webhook handler
 * 
 * Usage: Add to your webhook handler in /app/api/webhooks/nylas/route.ts
 */
export async function completeWebhookHandlerExample(payload: any) {
  const { type, data } = payload

  console.log(`📬 Processing ${type} event(s)`)

  try {
    if (type === 'message.created') {
      for (const message of data) {
        await handleMessageCreatedExample(message)
        await updateFolderCountsExample(message)
        await handleAttachmentsExample(message)
        // Notify frontend
        // notifyFrontendExample(payload, io)
      }
    } else if (type === 'message.updated') {
      for (const message of data) {
        await handleMessageUpdatedExample(message)
      }
    } else if (type === 'message.deleted') {
      for (const message of data) {
        await handleMessageDeletedExample(message.id)
      }
    } else if (type.endsWith('.truncated')) {
      for (const item of data) {
        await handleTruncatedMessageExample(item.id, item.grant_id)
      }
    } else if (type === 'folder.updated') {
      for (const folder of data) {
        await handleFolderUpdatedExample(folder)
      }
    } else if (type === 'draft.created') {
      for (const draft of data) {
        await handleDraftCreatedExample(draft)
      }
    }

    console.log(`✅ Webhook processed successfully`)
  } catch (error) {
    console.error(`❌ Error processing webhook: ${type}`, error)
    // Log error but don't throw - webhook already responded with 200 OK
  }
}
