import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch (error) {
              // Ignored
            }
          },
        },
      }
    )

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { messageId, forwardBody, forwardTo, grantId: bodyGrantId } = body

    if (!messageId || !forwardBody || !forwardTo) {
      return NextResponse.json(
        { error: 'Missing required fields: messageId, forwardBody, forwardTo' },
        { status: 400 }
      )
    }

    // Get user's email accounts
    const { data: accounts } = await supabase
      .from('email_accounts')
      .select('grant_id, email')
      .eq('user_id', session.user.id)

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'No email accounts found' }, { status: 404 })
    }

    // Use provided grantId or default to first account
    let grantId = bodyGrantId
    if (!grantId && accounts.length > 0) {
      grantId = accounts[0].grant_id
    }

    if (!grantId) {
      return NextResponse.json({ error: 'No valid grant ID found' }, { status: 400 })
    }

    const senderEmail = accounts.find(a => a.grant_id === grantId)?.email || session.user.email || ''

    // Fetch original message from Nylas
    const messageUrl = new URL(`https://api.us.nylas.com/v3/grants/${encodeURIComponent(grantId)}/messages/${encodeURIComponent(messageId)}`)
    const messageRes = await fetch(messageUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
        'Accept': 'application/json'
      }
    })

    if (!messageRes.ok) {
      const error = await messageRes.text()
      console.error('Failed to fetch original message:', error)
      return NextResponse.json(
        { error: 'Failed to fetch original message', details: error },
        { status: messageRes.status }
      )
    }

    const originalMessage = await messageRes.json()
    
    // Build forward subject
    const originalSubject = originalMessage.subject || '(no subject)'
    const forwardSubject = originalSubject.startsWith('Fwd:')
      ? originalSubject
      : `Fwd: ${originalSubject}`

    // Build the forwarded message body
    const fromEmail = originalMessage.from?.[0]?.email || 'unknown'
    const fromName = originalMessage.from?.[0]?.name || fromEmail
    const sentDate = new Date(originalMessage.date * 1000).toLocaleString()

    const combinedBody = `${forwardBody}<br><br>
<blockquote style="border-left: 2px solid #ccc; padding-left: 1rem; color: #999; margin-top:1rem; font-size: 0.9em;">
  <strong>---------- Forwarded message ---------</strong><br/>
  From: ${fromName} &lt;${fromEmail}&gt;<br/>
  Date: ${sentDate}<br/>
  Subject: ${originalSubject}<br/>
  <br/>
  ${originalMessage.body || originalMessage.snippet || ''}
</blockquote>`

    // For now, forward without attachments (Nylas v3 attachment handling in forward is complex)
    // Future enhancement: include non-inline attachments

    // Send the forwarded message via Nylas
    const sendUrl = new URL(`https://api.us.nylas.com/v3/grants/${encodeURIComponent(grantId)}/messages/send`)
    const sendPayload = {
      to: [{ email: forwardTo }],
      from: [{ email: senderEmail }],
      subject: forwardSubject,
      body: combinedBody,
      reply_to: [{ email: senderEmail }]
    }

    const sendRes = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(sendPayload)
    })

    if (!sendRes.ok) {
      const error = await sendRes.text()
      console.error('Failed to send forwarded message:', error)
      return NextResponse.json(
        { error: 'Failed to send forwarded message', details: error },
        { status: sendRes.status }
      )
    }

    const sendResult = await sendRes.json()
    console.debug('Forward sent successfully:', sendResult)

    return NextResponse.json({
      success: true,
      message: 'Email forwarded successfully',
      grantId
    })
  } catch (error) {
    console.error('Forward handler error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
