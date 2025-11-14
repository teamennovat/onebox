import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { nylasConfig } from "@/lib/nylas"

export async function POST(request: Request) {
  try {
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

    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("auth_id", session.user.id)
      .single()

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 400 })
    }

    const { data: accounts } = await supabase
      .from("email_accounts")
      .select("grant_id, is_primary")
      .eq("user_id", userData.id)

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ error: "No email account found" }, { status: 400 })
    }

    const body = await request.json()
    const { grantId, messageId } = body

    if (!grantId || !messageId) {
      return NextResponse.json({ error: "grantId and messageId are required" }, { status: 400 })
    }

    // ensure the grant belongs to the authenticated user
    const owns = accounts.some((a: any) => a.grant_id === grantId)
    if (!owns) {
      return NextResponse.json({ error: "grantId does not belong to the authenticated user" }, { status: 403 })
    }

    const encodedGrant = encodeURIComponent(String(grantId))
    const encodedMsgId = encodeURIComponent(String(messageId))
    const endpoint = `${nylasConfig.apiUri}/v3/grants/${encodedGrant}/messages/${encodedMsgId}`

    // call Nylas GET to verify existence and return the response
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
        Accept: 'application/json'
      }
    })

    const text = await response.text().catch(() => '')

    if (!response.ok) {
      return NextResponse.json({ ok: false, status: response.status, body: text }, { status: response.status })
    }

    try {
      const data = JSON.parse(text || '{}')
      return NextResponse.json({ ok: true, data })
    } catch (e) {
      return NextResponse.json({ ok: true, body: text })
    }

  } catch (error) {
    console.error('Error in validate route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
