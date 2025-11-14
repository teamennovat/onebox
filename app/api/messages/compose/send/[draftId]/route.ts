import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { nylasConfig } from "@/lib/nylas"

export async function POST(
  request: Request,
  { params }: { params: { draftId?: string } }
) {
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

    // Get user's email accounts
    const { data: accounts } = await supabase
      .from("email_accounts")
      .select("grant_id, is_primary")
      .eq("user_id", userData.id)

    if (!accounts || accounts.length === 0) {
      return NextResponse.json(
        { error: "No email account found" },
        { status: 400 }
      )
    }

    // Use primary account or first available
    const primary = accounts.find((a: any) => a.is_primary)
    const grantId = primary?.grant_id || accounts[0].grant_id

    const { draftId } = params
    const requestBody = await request.json()
    const { send_at, use_draft } = requestBody

    let endpoint: string
    let payload: any = {}

    if (draftId) {
      // If we have a draftId, send the existing draft
      endpoint = `${nylasConfig.apiUri}/v3/grants/${grantId}/drafts/${draftId}/send`
      if (send_at) {
        payload.send_at = send_at
      }
    } else {
      // If no draftId, create and send a new message
      endpoint = `${nylasConfig.apiUri}/v3/grants/${grantId}/messages/send`
      const { to, subject, body, attachments } = requestBody
      payload = {
        to,
        subject,
        body,
        ...(attachments && { attachments }),
        ...(send_at && { 
          send_at,
          use_draft: use_draft ?? false
        })
      }
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
        "Content-Type": "application/json",
      },
      ...(Object.keys(payload).length > 0 && { body: JSON.stringify(payload) })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("Error sending draft:", error)
      return NextResponse.json(
        { error: "Failed to send draft" },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json({ messageId: data.id || data.data?.id })

  } catch (error) {
    console.error("Error sending draft:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}