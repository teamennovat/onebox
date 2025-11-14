import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { nylas } from '@/lib/nylas'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=${error}&error_description=${searchParams.get('error_description')}`
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=missing_params`
      )
    }

    // Decode state
    const { userId, provider } = JSON.parse(
      Buffer.from(state, 'base64').toString()
    )

    // Exchange code for grant
    const response = await fetch(`${process.env.NYLAS_API_URI}/v3/connect/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_NYLAS_CLIENT_ID,
        code: code,
        redirect_uri: process.env.NEXT_PUBLIC_CALLBACK_URI
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=${errorData.error || 'token_exchange_failed'}`
      )
    }

    const tokenData = await response.json()
    const { grant_id, email } = tokenData

    // Ensure supabaseAdmin (service role) is configured on the server
    if (!supabaseAdmin) {
      console.error('supabaseAdmin (service role) not configured')
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=server_config`
      )
    }

    // Check if this is the first account
    const { data: existingAccounts } = await supabaseAdmin
      .from('email_accounts')
      .select('id')
      .eq('user_id', userId)

    const isPrimary = !existingAccounts || existingAccounts.length === 0

    // Save to Supabase (server-side upsert using service role)
    const { error: dbError } = await supabaseAdmin
      .from('email_accounts')
      .upsert({
        user_id: userId,
        grant_id: grant_id,
        email: email,
        provider: provider,
        grant_status: 'valid',
        is_primary: isPrimary,
        connected_at: new Date().toISOString(),
        last_sync: new Date().toISOString()
      }, {
        onConflict: 'grant_id'
      })

    if (dbError) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=database_error`
      )
    }

    // Successful connection
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=account_connected`
    )
  } catch (error) {
    console.error('Callback error:', error)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/login?error=callback_error`
    )
  }
}