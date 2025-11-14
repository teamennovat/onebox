import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { nylasConfig } from '@/lib/nylas';

// GET /api/messages/thread/[threadId]
// Fetch all messages in a thread from Nylas
// Accepts: grantId (query param or body), threadId (URL param)
// Example: GET /api/messages/thread/19a79246a9b0a475?grantId=40ca4aaa-e951-4995-8472-e034ac1dcc22
export async function GET(
  request: NextRequest,
  { params }: { params: { threadId?: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    let threadId = params?.threadId;
    const grantFromQuery = searchParams.get('grantId');

    // Fallback: parse threadId from URL path if params is undefined
    if (!threadId) {
      try {
        const pathname = new URL(request.url).pathname;
        const parts = pathname.split('/').filter(Boolean);
        const threadIndex = parts.findIndex((p) => p === 'thread');
        if (threadIndex >= 0 && parts.length > threadIndex + 1) {
          threadId = parts[threadIndex + 1];
          console.debug('thread route: extracted threadId from pathname fallback', { pathname, threadId });
        }
      } catch (e) {
        console.error('thread route: failed to parse pathname for threadId fallback', e);
      }
    }

    if (!threadId || typeof threadId !== 'string') {
      console.error('thread route: invalid threadId in URL params', {
        threadId,
        threadIdType: typeof threadId
      });
      return NextResponse.json({ error: 'Thread ID is required' }, { status: 400 });
    }

    let resolvedGrantId: string | null = null;

    // If grantId provided in query params, use directly (no session validation)
    if (grantFromQuery) {
      console.log('thread route: using grantId from query param (no session validation)');
      resolvedGrantId = grantFromQuery;
    } else {
      // Validate via Supabase session
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

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Fetch user's primary/first grant
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

    if (!resolvedGrantId) {
      return NextResponse.json({ error: 'Grant ID is required' }, { status: 400 });
    }

    const nylasApiKey = process.env.NYLAS_API_KEY;
    const nylasApiUri = nylasConfig.apiUri || 'https://api.us.nylas.com';
    if (!nylasApiKey) {
      return NextResponse.json({ error: 'NYLAS_API_KEY not configured' }, { status: 500 });
    }

    // Fetch the thread from Nylas to get all message IDs
    const encodedGrant = encodeURIComponent(String(resolvedGrantId));
    const encodedThread = encodeURIComponent(threadId);
    const threadUrl = `${nylasApiUri}/v3/grants/${encodedGrant}/threads/${encodedThread}`;

    console.debug('Fetching thread from Nylas', { threadUrl, threadId });

    const threadResp = await fetch(threadUrl, {
      headers: { 'Authorization': `Bearer ${nylasApiKey}` }
    });

    if (!threadResp.ok) {
      const text = await threadResp.text().catch(() => '');
      console.error('Nylas API error fetching thread', { status: threadResp.status, body: text });
      return NextResponse.json(
        { error: 'Failed to fetch thread', status: threadResp.status, details: text },
        { status: threadResp.status }
      );
    }

    const threadData = await threadResp.json();
    const threadInfo = threadData.data || threadData;
    const messageIds = threadInfo.message_ids || [];

    console.debug('Thread contains message IDs', { threadId, count: messageIds.length });

    // Fetch each message in the thread
    const messages = await Promise.all(
      messageIds.map(async (msgId: string) => {
        try {
          const msgUrl = `${nylasApiUri}/v3/grants/${encodedGrant}/messages/${msgId}`;
          const msgResp = await fetch(msgUrl, {
            headers: { 'Authorization': `Bearer ${nylasApiKey}` }
          });

          if (!msgResp.ok) {
            console.warn(`Failed to fetch message ${msgId}:`, msgResp.status);
            return null;
          }

          const msgData = await msgResp.json();
          const msg = msgData.data || msgData;
          return {
            id: msg.id,
            from: msg.from || [],
            to: msg.to || [],
            cc: msg.cc || [],
            bcc: msg.bcc || [],
            subject: msg.subject || '',
            body: msg.body || msg.html || '',
            date: msg.date || 0,
            thread_id: msg.thread_id,
            reply_to_message_id: msg.reply_to_message_id,
          };
        } catch (e) {
          console.error(`Error fetching message ${msgId}:`, e);
          return null;
        }
      })
    );

    // Filter out null entries and sort by date (chronological order)
    const validMessages = messages.filter((m) => m !== null);
    validMessages.sort((a, b) => (a?.date || 0) - (b?.date || 0));

    // Extract original message (first in thread) and replies (all subsequent messages)
    const originalMessage = validMessages.length > 0 ? validMessages[0] : null;
    const replies = validMessages.length > 1 ? validMessages.slice(1) : [];

    return NextResponse.json(
      { 
        ok: true, 
        messages: validMessages,
        original_message: originalMessage,
        replies: replies,
        message_count: validMessages.length
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in thread route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
