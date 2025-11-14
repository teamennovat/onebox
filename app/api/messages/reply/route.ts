
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { nylasConfig } from '@/lib/nylas';

// POST /api/messages/reply
// Accepts: grantId, messageId, replyBody (and optional: to, subject, threadId) as query params or request body
// Example: POST /api/messages/reply?grantId=xxx&messageId=yyy&replyBody=zzz
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Extract from query params (highest priority for testing/flexibility)
    const grantFromQuery = searchParams.get('grantId');
    const messageIdFromQuery = searchParams.get('messageId');
    const replyBodyFromQuery = searchParams.get('replyBody');
    const subjectFromQuery = searchParams.get('subject');
    const threadIdFromQuery = searchParams.get('threadId');
    
    // Parse body safely
    let parsedBody: any = {};
    try {
      const raw = await request.text();
      parsedBody = raw ? JSON.parse(raw) : {};
    } catch (e) {
      parsedBody = {};
    }

    // Use query params first, then fall back to body
    const grantId = grantFromQuery || parsedBody?.grantId || null;
    const messageId = messageIdFromQuery || parsedBody?.messageId || null;
    const replyBody = replyBodyFromQuery || parsedBody?.replyBody || null;
    let subject = subjectFromQuery || parsedBody?.subject || null;
    let threadId = threadIdFromQuery || parsedBody?.threadId || null;
    let to = parsedBody?.to || null;

    // Build a handy object of received params for inspection/logging
    const receivedParams = {
      grantFromQuery,
      messageIdFromQuery,
      threadIdFromQuery,
      // limit reply body preview to 200 chars to avoid huge logs
      replyBodyFromQuery: replyBodyFromQuery ? String(replyBodyFromQuery).slice(0, 200) : null,
      subjectFromQuery,
      parsedBody,
    };
    console.log('='.repeat(80));
    console.log('📤 REPLY ROUTE - RECEIVED PARAMS');
    console.log('='.repeat(80));
    console.log(receivedParams);
    console.log('='.repeat(80));

    // Quick debug: if ?inspect=1 is provided, return the parsed inputs immediately
    if (searchParams.get('inspect') === '1') {
      return NextResponse.json({ ok: true, receivedParams }, { status: 200 });
    }

    // Validate required fields
    if (!messageId || !replyBody) {
      return NextResponse.json({
        error: 'Missing required fields',
        details: {
          messageId: !messageId ? 'Message ID is required' : null,
          replyBody: !replyBody ? 'Reply body is required' : null,
        }
      }, { status: 400 });
    }

    let resolvedGrantId = grantId;

    // If grantId was provided via query params, use it directly (no session validation needed)
    // This allows easy local testing and curl requests
    if (!grantFromQuery) {
      // Session-based: validate via Supabase
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookiesToSet: any[]) {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            },
          } as any,
        }
      );

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (sessionError) {
        console.error('Session error:', sessionError);
      }
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // If grantId provided in body, validate it belongs to this user
      if (parsedBody?.grantId) {
        const { data: userData } = await supabase
          .from('users')
          .select('id')
          .eq('auth_id', session.user.id)
          .single();

        if (!userData) {
          return NextResponse.json({ error: 'User not found' }, { status: 400 });
        }

        const { data: accounts } = await supabase
          .from('email_accounts')
          .select('grant_id')
          .eq('user_id', userData.id)
          .eq('grant_id', parsedBody.grantId);

        if (!accounts || accounts.length === 0) {
          return NextResponse.json({ error: 'Invalid grantId for user' }, { status: 403 });
        }
        resolvedGrantId = parsedBody.grantId;
      } else {
        // No grantId provided; fetch user's primary or first account
        const { data: userData } = await supabase
          .from('users')
          .select('id')
          .eq('auth_id', session.user.id)
          .single();

        if (!userData) {
          return NextResponse.json({ error: 'User not found' }, { status: 400 });
        }

        const { data: accounts } = await supabase
          .from('email_accounts')
          .select('grant_id, is_primary')
          .eq('user_id', userData.id);

        if (!accounts || accounts.length === 0) {
          return NextResponse.json({ error: 'No email account found' }, { status: 400 });
        }

        const primary = accounts.find((a: any) => a.is_primary);
        resolvedGrantId = primary?.grant_id || accounts[0].grant_id;
      }
    }

    if (!resolvedGrantId) {
      return NextResponse.json({ error: 'Grant ID is required' }, { status: 400 });
    }

    const nylasApiKey = process.env.NYLAS_API_KEY;
    const nylasApiUri = nylasConfig.apiUri || 'https://api.us.nylas.com';
    if (!nylasApiKey) {
      return NextResponse.json({ error: 'NYLAS_API_KEY not configured' }, { status: 500 });
    }

    // If to/subject/threadId were not provided, fetch original message to populate them
    if (!to || !subject || !threadId) {
      try {
        const getMsgUrl = `${nylasApiUri}/v3/grants/${encodeURIComponent(String(resolvedGrantId))}/messages/${messageId}`;
        const msgResp = await fetch(getMsgUrl, {
          headers: { 'Authorization': `Bearer ${nylasApiKey}` }
        });
        if (msgResp.ok) {
          const origMsg = await msgResp.json();
          const orig = origMsg.data ?? origMsg;
          
          // Derive 'to' from original message's 'from' if not provided
          if (!to) {
            let toAddresses: Array<any> = [];
            if (Array.isArray(orig.from)) {
              toAddresses = orig.from.map((f: any) => 
                typeof f === 'string' ? { email: f } : { email: f.email, name: f.name }
              );
            } else if (typeof orig.from === 'string') {
              toAddresses = [{ email: orig.from }];
            } else if (orig.from?.email) {
              toAddresses = [{ email: orig.from.email, name: orig.from.name }];
            }
            to = toAddresses;
          }
          
          if (!subject) subject = orig.subject || '';
          // Ensure reply subject is prefixed with Re: when appropriate
          if (subject && !/^\s*(Re:|Fwd:)/i.test(subject)) {
            subject = `Re: ${subject}`;
          }
          if (!threadId) threadId = orig.thread_id || undefined;
        } else {
          const txt = await msgResp.text().catch(() => '');
          console.warn('Failed to fetch original message from Nylas', { status: msgResp.status, body: txt });
        }
      } catch (e) {
        console.error('Error fetching original message:', e);
      }
    }

    // Prepare Nylas payload
    const sendPayload = {
      to,
      subject,
      body: replyBody,
      reply_to_message_id: messageId,
      thread_id: threadId,
    };

    const encodedGrant = encodeURIComponent(String(resolvedGrantId));
    const sendUrl = `${nylasApiUri}/v3/grants/${encodedGrant}/messages/send`;
    
    console.log('='.repeat(80));
    console.log('📤 SENDING REPLY TO NYLAS');
    console.log('='.repeat(80));
    console.log('Send Payload:', {
      to: to?.map((t: any) => t.email || t).join(', '),
      subject: subject?.substring(0, 50),
      reply_to_message_id: messageId,
      thread_id: threadId,
      bodyPreview: replyBody?.substring(0, 100)
    });
    console.log('='.repeat(80));

    const sendResp = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${nylasApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sendPayload),
    });

    if (!sendResp.ok) {
      const text = await sendResp.text().catch(() => '');
      let parsed: any = text;
      try { parsed = JSON.parse(text); } catch (e) {}
      console.error('Nylas API error sending reply', { status: sendResp.status, body: text, receivedParams, sendPayload });
      return NextResponse.json({ error: 'Failed to send reply', status: sendResp.status, details: parsed, receivedParams, sendPayload }, { status: sendResp.status });
    }

    const sentMessage = await sendResp.json();
    return NextResponse.json({
      success: true,
      message: 'Reply sent successfully',
      data: sentMessage.data || sentMessage
    }, { status: 200 });

  } catch (error) {
    console.error('Error in reply route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}