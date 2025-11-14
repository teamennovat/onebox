import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { nylasConfig } from "@/lib/nylas"

export async function PUT(
  request: Request,
  { params }: { params: { messageId?: string } }
) {
  try {
    // Debug log the raw params to understand what we received
    console.debug('read route: received params', {
      paramsType: typeof params,
      hasMessageId: 'messageId' in (params || {}),
      messageId: params?.messageId,
      messageIdType: typeof params?.messageId
    })

    // Extract and validate messageId from params. If Next didn't populate params
    // (some environments may not), fall back to parsing it from the request URL path.
    let urlMessageId = params?.messageId
    if (!urlMessageId) {
      try {
        const pathname = new URL(request.url).pathname
        // pathname expected like: /api/messages/<messageId>/read
        const parts = pathname.split('/').filter(Boolean)
        const msgIndex = parts.findIndex((p) => p === 'messages')
        if (msgIndex >= 0 && parts.length > msgIndex + 1) {
          urlMessageId = parts[msgIndex + 1]
          console.debug('read route: extracted messageId from pathname fallback', { pathname, urlMessageId })
        }
      } catch (e) {
        console.error('read route: failed to parse pathname for messageId fallback', e)
      }
    }
    if (!urlMessageId || typeof urlMessageId !== 'string') {
      console.error('read route: invalid messageId in URL params', {
        messageId: urlMessageId,
        messageIdType: typeof urlMessageId
      })
      return NextResponse.json({ 
        error: `Invalid messageId (${String(urlMessageId)})`,
        debug: { messageIdType: typeof urlMessageId }
      }, { status: 400 })
    }

    const url = new URL(request.url)
    const grantFromQuery = url.searchParams.get('grantId')
    const unreadFromQuery = url.searchParams.get('unread') // expect 'true' or 'false'

    // If the client provided a grantId in the query params we will use it directly
    // (this mirrors the messages listing route which accepts grantId as query param).
    // Note: when grantId is provided in query we do NOT validate ownership via Supabase session.
    // This allows clients to call this route directly with a grantId (useful for debugging/local testing).
    // If no grantId query param is provided we fall back to authenticating the Supabase session
    // and resolving the user's grants from the database.

    let grantId: string | undefined = undefined
    let accounts: any[] = []
    let sessionUserId: string | null = null

    if (grantFromQuery) {
      grantId = grantFromQuery
      console.log('read route: using grantId from query param (no session validation)')
    } else {
      const cookieStore = await cookies()
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name: string) {
              return cookieStore.get(name)?.value
            }
          }
        }
      )

      const {
        data: { session }
      } = await supabase.auth.getSession()

      if (!session) {
        return new NextResponse("Unauthorized", { status: 401 })
      }

      sessionUserId = session.user.id

      const { data: userData } = await supabase
        .from("users")
        .select("id")
        .eq("auth_id", session.user.id)
        .single()

      if (!userData) {
        return NextResponse.json({ error: "User not found" }, { status: 400 })
      }

      const { data } = await supabase
        .from("email_accounts")
        .select("grant_id, is_primary")
        .eq("user_id", userData.id)

      accounts = data || []

      if (!accounts || accounts.length === 0) {
        return NextResponse.json(
          { error: "No email account found" },
          { status: 400 }
        )
      }

      const primary = accounts.find((a: any) => a.is_primary)
      grantId = primary?.grant_id || accounts[0].grant_id

      const rawBody = await request.text().catch(() => '')
      // parse body after we have session context
      const parsed = rawBody ? JSON.parse(rawBody) : {}
      const requestedGrantId = parsed?.grantId
      const unread = parsed?.unread

      // If client provided a grantId in JSON body, ensure it belongs to this user and use it
      if (requestedGrantId) {
        const owns = accounts.some((a: any) => a.grant_id === requestedGrantId)
        if (!owns) {
          return NextResponse.json({ error: "grantId does not belong to the authenticated user" }, { status: 403 })
        }
        grantId = requestedGrantId
      }

      // reassign body variables for later use
      // we'll set unread variable in outer scope below if not using query grant
      (request as any)._parsedBody = parsed
    }

    // messageId validation was moved to the top of the function
    // to ensure we have a valid ID before proceeding

    // Determine the 'unread' value. Prefer query param when present.
    // The `unread` boolean will be forwarded to Nylas as the provider expects
    // (Nylas v3 uses `unread: false` to mark a message as read).
    let unread: boolean | undefined = undefined
    if (unreadFromQuery !== null) {
      // explicit query param provided
      unread = unreadFromQuery === 'true'
    } else if (grantFromQuery) {
      // no query param; try parsing body if present for debug/backcompat
      const rawBody = await request.text().catch(() => '')
      try {
        const parsed = rawBody ? JSON.parse(rawBody) : {}
        unread = parsed?.unread
      } catch (e) {
        console.error('read route: invalid JSON body', { rawBody })
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
      }
    } else {
      // session path: the parsed body was stored earlier
      const parsed = (request as any)._parsedBody || {}
      unread = parsed?.unread
    }

    // Strict message ID validation - ensure it's a string and looks like a Nylas ID
    if (!urlMessageId || typeof urlMessageId !== 'string' || urlMessageId.length < 12) {
      console.error('read route: invalid messageId format', { 
        messageId: urlMessageId,
        messageIdType: typeof urlMessageId,
        messageIdLength: String(urlMessageId).length
      })
      return NextResponse.json({ error: 'Invalid messageId format' }, { status: 400 })
    }

    // Log received values for debugging (will appear in Next dev server)
    console.debug('read route debug', {
      messageId: urlMessageId,  // exact message ID we'll use
      messageIdType: typeof urlMessageId,
      messageIdLength: urlMessageId.length,
      grantId,            // final resolved grant ID
      grantIdType: typeof grantId,
      unread,             // final unread value
      unreadType: typeof unread
    })

    // Only encode grantId as it may contain special chars; messageId is safe
    const encodedGrant = encodeURIComponent(String(grantId))
    const endpoint = `${nylasConfig.apiUri}/v3/grants/${encodedGrant}/messages/${urlMessageId}`

    // For Nylas we forward the `unread` boolean directly. Nylas v3 expects
    // { "unread": false } to mark a message as read.
    const nylasBody: any = {}
    if (typeof unread === 'boolean') {
      nylasBody.unread = unread
    }

    // debug/log the exact request we will send to Nylas
    console.log('Nylas PUT endpoint:', endpoint)
    console.log('Nylas payload (forwarded):', nylasBody)

    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(nylasBody)
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "")
      console.error("Error updating message:", errorText)
      return NextResponse.json({ error: "Failed to update message", details: errorText }, { status: response.status })
    }

    const data = await response.json()

    // Return provider response but also include the local param info so callers
    // can verify the values they sent (grantId/messageId/unread).
    return NextResponse.json({
      ok: true,
      local: {
        messageId: urlMessageId,
        grantId,
        unread: typeof unread === 'boolean' ? unread : null
      },
      provider: data
    })

  } catch (error) {
    console.error("Error in message update route:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}