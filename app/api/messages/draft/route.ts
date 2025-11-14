import { NextResponse } from 'next/server'
import { nylasConfig } from '@/lib/nylas'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET: list drafts for a grant and optional messageId (filter by reply_to_message_id)
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const providedGrantId = url.searchParams.get('grantId')
    const messageId = url.searchParams.get('messageId')
    const limit = url.searchParams.get('limit') || '200'

    console.log('📋 DRAFT ROUTE - PARAMETERS RECEIVED', {
      providedGrantId,
      messageId,
      limit,
      hasProvidedGrant: !!providedGrantId
    })

    // If grantId is provided as query param, use it directly (no session validation)
    // This allows client-side calls with explicit grantId (useful for debugging/local testing)
    if (providedGrantId) {
      console.log('📋 USING GRANT ID FROM QUERY PARAM (no session validation)')

      const resp = await fetch(`${nylasConfig.apiUri}/v3/grants/${encodeURIComponent(providedGrantId)}/drafts`, {
        headers: {
          'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
          'Content-Type': 'application/json'
        }
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        console.error('❌ NYLAS ERROR RESPONSE', { status: resp.status, text })
        return NextResponse.json({ error: `Nylas error: ${resp.status}`, details: text }, { status: resp.status })
      }

      const data = await resp.json()
      console.log('📥 NYLAS DRAFTS RESPONSE', { status: resp.status, draftCount: data?.data?.length || 0 })
      
      let drafts = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : (data?.drafts || []))
      if (messageId) {
        drafts = drafts.filter((d: any) => String(d.reply_to_message_id) === String(messageId))
      }

      console.log('✅ DRAFTS FETCH SUCCESS', { count: drafts.length, filtered: !!messageId })
      return NextResponse.json({ drafts })
    }

    // Otherwise, validate via session and resolve grantId from user's email accounts
    const cookieStore: any = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false },
        cookies: cookieStore as any,
      }
    )

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      console.log('📋 NO SESSION AND NO GRANT ID PROVIDED')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('📋 SESSION AUTHENTICATED - RESOLVING GRANT FROM DATABASE')

    // Find user's grant_id from email_accounts table
    const { data: accounts, error: accountsError } = await supabase
      .from('email_accounts')
      .select('grant_id, is_primary')
      .eq('user_id', session.user.id)

    if (accountsError || !accounts || (Array.isArray(accounts) && accounts.length === 0)) {
      console.error('No email accounts found for user or supabase error:', accountsError)
      return NextResponse.json({ drafts: [] })
    }

    const accountList = Array.isArray(accounts) ? accounts : [accounts]
    const grantId = (accountList.find((a: any) => a.is_primary) as any)?.grant_id || accountList[0].grant_id

    console.log('📋 RESOLVED GRANT ID FROM DATABASE', { grantId })

    const resp = await fetch(`${nylasConfig.apiUri}/v3/grants/${encodeURIComponent(grantId)}/drafts`, {
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      console.error('❌ NYLAS ERROR RESPONSE', { status: resp.status, text })
      return NextResponse.json({ error: `Nylas error: ${resp.status}`, details: text }, { status: resp.status })
    }

    const data = await resp.json()
    console.log('📥 NYLAS DRAFTS RESPONSE', { status: resp.status, draftCount: data?.data?.length || 0 })
    
    let drafts = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : (data?.drafts || []))
    if (messageId) {
      drafts = drafts.filter((d: any) => String(d.reply_to_message_id) === String(messageId))
    }

    console.log('✅ DRAFTS FETCH SUCCESS', { count: drafts.length, filtered: !!messageId })
    return NextResponse.json({ drafts })
  } catch (error) {
    console.error('❌ ERROR IN DRAFT ROUTE:', error)
    return NextResponse.json({ error: 'Internal server error', details: (error as any)?.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const grantId = url.searchParams.get('grant_id');
    const ccParam = url.searchParams.get('cc');
    const bccParam = url.searchParams.get('bcc');
    const body = await request.json();
    const { messageId, draftId, body: draftBody } = body;

    // grant_id must come from frontend (query param or body fallback)
    const finalGrantId = grantId || body.grant_id;
    if (!finalGrantId) return new NextResponse('Missing grant_id', { status: 400 });
    if (!messageId) return new NextResponse('Missing messageId', { status: 400 });

    // Parse cc/bcc from params (JSON string or comma-separated)
    let cc = [];
    let bcc = [];
    if (ccParam) {
      try {
        cc = JSON.parse(ccParam);
      } catch {
        cc = ccParam.split(',').map(e => ({ email: e.trim(), name: e.trim() })).filter(e => e.email);
      }
    }
    if (bccParam) {
      try {
        bcc = JSON.parse(bccParam);
      } catch {
        bcc = bccParam.split(',').map(e => ({ email: e.trim(), name: e.trim() })).filter(e => e.email);
      }
    }

    // Fetch original message to get subject/from/thread
    const messageResponse = await fetch(`${nylasConfig.apiUri}/v3/grants/${finalGrantId}/messages/${messageId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    if (!messageResponse.ok) {
      console.error('Error fetching original message for draft:', await messageResponse.text());
      return new NextResponse('Failed to fetch original message', { status: 500 });
    }
    const originalMessage = await messageResponse.json();
    const orig = originalMessage.data ?? originalMessage;

    // Build draft payload (use safe fallbacks)
    const payload: any = {
      subject: orig.subject ?? '',
      body: draftBody || '',
      to: orig.from ?? [],
      cc,
      bcc,
      reply_to_message_id: orig.id ?? messageId,
      thread_id: orig.thread_id ?? undefined
    };

    let saveResp;
    if (draftId) {
      // Update existing draft
      saveResp = await fetch(`${nylasConfig.apiUri}/v3/grants/${finalGrantId}/drafts/${draftId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } else {
      // Create new draft
      saveResp = await fetch(`${nylasConfig.apiUri}/v3/grants/${finalGrantId}/drafts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    }

    if (!saveResp.ok) {
      const text = await saveResp.text().catch(() => '');
      console.error('Error saving draft:', text);
      return NextResponse.json({ error: 'Failed to save draft', details: text }, { status: 500 });
    }

    const saved = await saveResp.json();
    // Return draft id so client can track it
    return NextResponse.json({ draftId: saved.data?.id ?? saved.id ?? null });
  } catch (error) {
    console.error('Error in draft route:', error);
    return NextResponse.json({ error: 'Failed to save draft', details: (error as any)?.message ?? String(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const url = new URL(request.url)
    const grantId = url.searchParams.get('grantId')
    const draftId = url.searchParams.get('draftId')

    if (!grantId) {
      return NextResponse.json({ error: 'Missing grantId' }, { status: 400 })
    }
    if (!draftId) {
      return NextResponse.json({ error: 'Missing draftId' }, { status: 400 })
    }

    const payload = await request.json()

    console.log('💾 UPDATING DRAFT:', {
      grantId,
      draftId,
      subject: payload.subject?.slice(0, 50),
      toCount: payload.to?.length || 0,
      ccCount: payload.cc?.length || 0,
      bccCount: payload.bcc?.length || 0
    })

    // Send PUT request to Nylas to update draft
    const response = await fetch(
      `${nylasConfig.apiUri}/v3/grants/${encodeURIComponent(grantId)}/drafts/${encodeURIComponent(draftId)}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.error('❌ NYLAS UPDATE ERROR:', {
        status: response.status,
        error: errorText
      })
      return NextResponse.json(
        { error: 'Failed to update draft', details: errorText },
        { status: response.status }
      )
    }

    const result = await response.json()
    console.log('✅ DRAFT UPDATED:', { draftId: result.data?.id || result.id })

    return NextResponse.json({ 
      success: true,
      draftId: result.data?.id || result.id 
    })
  } catch (error) {
    console.error('Error updating draft:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: (error as any)?.message ?? String(error) },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const url = new URL(request.url)
    const grantId = url.searchParams.get('grantId')
    const draftId = url.searchParams.get('draftId')

    if (!grantId) {
      return NextResponse.json({ error: 'Missing grantId' }, { status: 400 })
    }
    if (!draftId) {
      return NextResponse.json({ error: 'Missing draftId' }, { status: 400 })
    }

    console.log('📤 SENDING DRAFT:', {
      grantId,
      draftId
    })

    // Send PATCH request to Nylas to send the draft
    // According to Nylas docs, POST /v3/grants/{grant_id}/drafts/{draft_id} sends a draft
    const response = await fetch(
      `${nylasConfig.apiUri}/v3/grants/${encodeURIComponent(grantId)}/drafts/${encodeURIComponent(draftId)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.error('❌ NYLAS SEND ERROR:', {
        status: response.status,
        error: errorText
      })
      return NextResponse.json(
        { error: 'Failed to send draft', details: errorText },
        { status: response.status }
      )
    }

    const result = await response.json()
    const messageId = result.data?.id || result.id
    console.log('✅ DRAFT SENT:', { messageId })

    return NextResponse.json({ 
      success: true,
      messageId
    })
  } catch (error) {
    console.error('Error sending draft:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: (error as any)?.message ?? String(error) },
      { status: 500 }
    )
  }
}
