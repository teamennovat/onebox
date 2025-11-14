import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  request: Request,
  { params }: { params: { attachmentId?: string } }
) {
  // Debug logging
  console.debug('attachment route: received params', {
    paramsType: typeof params,
    hasAttachmentId: 'attachmentId' in (params || {}),
    attachmentId: params?.attachmentId,
    attachmentIdType: typeof params?.attachmentId
  });

  // Defensive extraction for attachmentId and messageId.
  // Some environments or callers may not populate `params` correctly,
  // so we support multiple fallbacks (params -> pathname -> query).
  let attachmentIdParam: string | null = params?.attachmentId ?? null

  const urlObj = new URL(request.url)
  const searchParams = urlObj.searchParams
  // Accept both messageId and message_id for compatibility
  let messageId = searchParams.get("messageId") || searchParams.get("message_id")

  // If params didn't include attachmentId, try extracting from pathname
  if (!attachmentIdParam) {
    try {
      const pathname = urlObj.pathname
      const parts = pathname.split('/').filter(Boolean)
      const attIndex = parts.findIndex((p) => p === 'attachments')
      if (attIndex >= 0 && parts.length > attIndex + 1) {
        attachmentIdParam = decodeURIComponent(parts[attIndex + 1])
        console.debug('attachment route: extracted attachmentId from pathname fallback', { pathname, attachmentIdParam })
      }
    } catch (e) {
      console.debug('attachment route: failed to parse pathname for attachmentId fallback', e)
    }
  }

  // Also allow attachmentId via query param for debug/backcompat
  if (!attachmentIdParam) {
    let queryAttachmentId = searchParams.get('attachmentId') || searchParams.get('id')
    if (queryAttachmentId) {
      try {
        attachmentIdParam = decodeURIComponent(queryAttachmentId)
      } catch (e) {
        attachmentIdParam = queryAttachmentId
      }
    }
  }

  // Decode if present (in case it's still encoded)
  let attachmentId: string | null = null
  if (attachmentIdParam) {
    try {
      attachmentId = decodeURIComponent(String(attachmentIdParam))
    } catch (e) {
      attachmentId = String(attachmentIdParam)
    }
  }

  // Validate messageId and attachmentId early with helpful debug info
  console.debug('attachment route: validation check', {
    messageId,
    messageIdType: typeof messageId,
    attachmentId,
    attachmentIdType: typeof attachmentId,
    attachmentIdLength: attachmentId?.length || 0
  });

  if (!messageId || typeof messageId !== 'string' || messageId.trim().length === 0) {
    console.error('attachment route: missing messageId', { messageId, messageIdType: typeof messageId });
    return Response.json({ error: 'Message ID is required', debug: { messageId, messageIdType: typeof messageId } }, { status: 400 })
  }

  if (!attachmentId || typeof attachmentId !== 'string' || attachmentId.trim().length < 4) {
    console.error('attachment route: invalid attachmentId', { attachmentIdParam, attachmentId, attachmentIdType: typeof attachmentId })
    return Response.json({ error: 'Invalid or missing attachmentId', debug: { attachmentIdParam, attachmentId, attachmentIdType: typeof attachmentId } }, { status: 400 })
  }

  try {
    console.log('='.repeat(80));
    console.log('🔍 ATTACHMENT ROUTE - PARAMETERS RECEIVED');
    console.log('='.repeat(80));
    console.log('Raw Parameters:', {
      attachmentIdParam,
      attachmentId: attachmentId?.substring(0, 80),
      messageId,
      messageIdType: typeof messageId,
      attachmentIdType: typeof attachmentId,
      attachmentIdLength: attachmentId?.length,
      messageIdLength: messageId?.length
    });
    console.log('URL Query Params:', {
      allParams: Array.from(searchParams.entries())
    });
    console.log('='.repeat(80));

    // Try to get grantId from query params first (for client-side testing)
    let grantId = searchParams.get('grantId') || searchParams.get('grant_id');

    // If no grantId in query, resolve from session
    if (!grantId) {
      // Create Supabase server client using new SSR package to get the session
      const cookieStore: any = await cookies();
      
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
        console.error('No session found in attachment download');
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Get the auth_id from the session
      const authId = session.user.id;
      
      if (!supabaseAdmin) {
        console.error('Supabase admin client not initialized - SUPABASE_SERVICE_ROLE_KEY may not be set');
        return Response.json({ error: "Server configuration error" }, { status: 500 });
      }
      
      // Query email_accounts table using supabaseAdmin
      // First try: email_accounts where user_id matches the provided userId
      let { data: accounts, error: accountError } = await supabaseAdmin
        .from('email_accounts')
        .select('grant_id')
      .eq('user_id', authId);

    // If no accounts found, try to resolve users.id by auth_id
    if (accountError || !accounts || accounts.length === 0) {
      const { data: usersData, error: userErr } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('auth_id', authId)
        .limit(1);

      if (userErr) {
        console.error('Error resolving user:', userErr);
        return Response.json({ error: "Failed to resolve user" }, { status: 401 });
      }

      const resolvedUserId = usersData && usersData.length > 0 ? usersData[0].id : null;

      if (resolvedUserId) {
        const { data: accounts2, error: accountsErr } = await supabaseAdmin
          .from('email_accounts')
          .select('grant_id')
          .eq('user_id', resolvedUserId);

        if (accountsErr) {
          console.error('Error fetching accounts:', accountsErr);
          return Response.json({ error: "Failed to fetch accounts" }, { status: 404 });
        }

        accounts = accounts2 ?? [];
      }
    }

    if (!accounts || accounts.length === 0) {
      console.error('No email accounts found for user:', authId);
      return Response.json({ error: "No mail account found" }, { status: 404 });
    }

    const account = accounts[0];
    grantId = account.grant_id;
    }

    if (!grantId) {
      console.error('attachment route: unable to resolve grantId');
      return Response.json({ error: 'Unable to resolve grant ID' }, { status: 400 });
    }

    // Direct Nylas API call
    const apiUri = process.env.NYLAS_API_URI || "https://api.us.nylas.com";
    
    // Log before Nylas request
    console.log('='.repeat(80));
    console.log('� NYLAS ATTACHMENT REQUEST');
    console.log('='.repeat(80));
    console.log('Request Details:', {
      grantId,
      attachmentId: attachmentId?.substring(0, 80),
      messageId,
      apiUri
    });

    const nylasUrl = `${apiUri}/v3/grants/${grantId}/attachments/${attachmentId}/download?message_id=${messageId}`;
    console.log('Full Nylas URL:', nylasUrl.substring(0, 150) + '...');
    console.log('='.repeat(80));

    const nylasResponse = await fetch(nylasUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
      },
    });

    // Log response
    console.log('📥 NYLAS RESPONSE:', {
      status: nylasResponse.status,
      statusText: nylasResponse.statusText,
      contentType: nylasResponse.headers.get('content-type')
    });

    if (!nylasResponse.ok) {
      const errorText = await nylasResponse.text();
      console.log('='.repeat(80));
      console.log('❌ NYLAS ERROR RESPONSE');
      console.log('='.repeat(80));
      console.log('Error Status:', nylasResponse.status);
      console.log('Error Body:', errorText.substring(0, 500));
      console.log('Request Parameters:', {
        grantId,
        attachmentId: attachmentId?.substring(0, 80),
        messageId,
        nylasUrl: nylasUrl?.substring(0, 150)
      });
      console.log('='.repeat(80));
      
      console.error('Nylas API error:', errorText);
      return Response.json({ 
        error: "Nylas API error", 
        details: errorText,
        debug: {
          grantId,
          attachmentId: attachmentId?.substring(0, 80),
          messageId,
          status: nylasResponse.status
        }
      }, { status: nylasResponse.status });
    }

    // Parse filename from attachment ID
    let filename = 'attachment';
    try {
      const parts = attachmentId.split(':');
      if (parts.length >= 2) {
        filename = Buffer.from(parts[1], 'base64').toString('utf-8');
      }
    } catch (e) {
      console.log('Using default filename');
    }

    console.log('='.repeat(80));
    console.log('✅ ATTACHMENT DOWNLOADED SUCCESSFULLY');
    console.log('='.repeat(80));
    console.log('Download Info:', {
      filename,
      contentType: nylasResponse.headers.get("content-type"),
      attachmentId: attachmentId?.substring(0, 80),
      messageId
    });
    console.log('='.repeat(80));

    // Return the binary stream
    return new Response(nylasResponse.body, {
      headers: {
        "Content-Type": nylasResponse.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error("Error downloading attachment:", error);
    return Response.json({
      error: "Error downloading attachment",
      details: error instanceof Error ? error.message : String(error),
      attachmentId,
      messageId,
    }, { status: 500 });
  }
}