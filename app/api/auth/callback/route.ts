import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  console.log('========= CALLBACK HANDLER START =========')
  
  try {
    // Validate environment variables
    if (!process.env.NYLAS_API_KEY || !process.env.NEXT_PUBLIC_NYLAS_CLIENT_ID || !process.env.NEXT_PUBLIC_CALLBACK_URI) {
      throw new Error('Missing required environment variables')
    }

    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    console.log('Received callback:', {
      hasCode: !!code,
      hasState: !!state,
      error: error
    })

    if (error) {
      console.error('OAuth error:', error)
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error)}`, request.url)
      )
    }

    if (!code || !state) {
      console.error('Missing code or state')
      return NextResponse.redirect(
        new URL('/login?error=missing_params', request.url)
      )
    }

    // Decode state ONCE
    let stateData
    try {
      const decodedState = Buffer.from(state, 'base64').toString()
      console.log('Decoded state:', decodedState)
      stateData = JSON.parse(decodedState)
      
      if (!stateData.userId || !stateData.provider) {
        throw new Error('Invalid state data')
      }
    } catch (error) {
      console.error('State parsing failed:', error)
      return NextResponse.redirect(
        new URL('/login?error=invalid_state', request.url)
      )
    }

    // Token exchange
    console.log('Starting token exchange...')
    const tokenResponse = await fetch('https://api.us.nylas.com/v3/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_NYLAS_CLIENT_ID,
        client_secret: process.env.NYLAS_API_KEY,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.NEXT_PUBLIC_CALLBACK_URI,
        code_verifier: 'nylas'
      })
    })

    const responseText = await tokenResponse.text()
    console.log('Token response:', {
      status: tokenResponse.status,
      body: responseText.substring(0, 200)
    })

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', responseText)
      return NextResponse.redirect(
        new URL(`/login?error=token_exchange_failed`, request.url)
      )
    }

    const tokenData = JSON.parse(responseText)
    console.log('Token data received:', {
      hasGrantId: !!tokenData.grant_id,
      hasEmail: !!tokenData.email,
      email: tokenData.email
    })

    // First ensure user exists in users table
    console.log('Creating/updating user record...')
    const { error: userError } = await supabaseAdmin
      .from('users')
      .upsert({
        auth_id: stateData.userId,  // Changed from auth_user_id to auth_id
        email: tokenData.email
      }, {
        onConflict: 'auth_id'  // Changed conflict handling
      })

    if (userError) {
      console.error('Error creating/updating user:', userError)
      throw userError
    }

    // Get user id from the users table
    const { data: userData, error: userFetchError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', stateData.userId)
      .single()

    if (userFetchError || !userData) {
      console.error('Error fetching user:', userFetchError)
      throw userFetchError || new Error('User not found after creation')
    }

    // Check for existing accounts
    const { data: existingAccounts } = await supabaseAdmin
      .from('email_accounts')
      .select('id')
      .eq('user_id', userData.id)

    const isPrimary = !existingAccounts || existingAccounts.length === 0

    console.log('Saving to database...')
    
    // Save to database with schema validation
    const accountData = {
      user_id: userData.id,  // Using the fetched user id
      grant_id: tokenData.grant_id,
      email: tokenData.email,
      provider: stateData.provider,
      grant_status: 'valid',
      is_primary: isPrimary,
      settings: {
        scope: tokenData.scope,
        provider_type: tokenData.provider
      },
      connected_at: new Date().toISOString(),
      last_sync: new Date().toISOString()
    }

    console.log('Database insert data:', {
      hasUserId: !!accountData.user_id,
      userId: accountData.user_id,
      hasGrantId: !!accountData.grant_id,
      email: accountData.email,
      provider: accountData.provider
    })

    const { data: insertData, error: dbError } = await supabaseAdmin
      .from('email_accounts')
      .upsert(accountData, {
        onConflict: 'grant_id'
      })

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.redirect(
        new URL('/login?error=database_error', request.url)
      )
    }

    console.log('Account saved successfully')

    // Success - redirect to dashboard
    const successUrl = new URL('/dashboard', request.url)
    successUrl.searchParams.set('success', 'account_connected')
    successUrl.searchParams.set('email', tokenData.email)
    
    console.log('Redirecting to:', successUrl.toString())
    return NextResponse.redirect(successUrl)

  } catch (error) {
    console.error('Callback error:', error)
    return NextResponse.redirect(
      new URL('/login?error=callback_error', request.url)
    )
  }
}