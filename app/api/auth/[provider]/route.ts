import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  try {
    // IMPORTANT: Await the params Promise
    const params = await context.params
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    const provider = params.provider
    
    // Validate provider
    const validProviders = ['google', 'microsoft', 'yahoo', 'imap']
    if (!validProviders.includes(provider)) {
      return NextResponse.json({ 
        error: 'Invalid provider',
        validProviders 
      }, { status: 400 })
    }
    
    try {
      // Store userId and provider in state
      const state = Buffer.from(JSON.stringify({ 
        userId, 
        provider,
        timestamp: Date.now()
      })).toString('base64')
      
      // Configure auth URL with provider-specific settings
      // Build proper Nylas OAuth URL with the correct v3 endpoint
      const baseUrl = 'https://api.us.nylas.com'  // Always use HTTPS
      const authUrl = new URL('/v3/connect/auth', baseUrl)

      // Add required OAuth parameters
      authUrl.searchParams.set('client_id', process.env.NEXT_PUBLIC_NYLAS_CLIENT_ID!)
      authUrl.searchParams.set('redirect_uri', process.env.NEXT_PUBLIC_CALLBACK_URI!)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('provider', provider)
      authUrl.searchParams.set('access_type', 'offline')  // Required for refresh tokens
      authUrl.searchParams.set('state', state)

      // Add provider-specific scopes
      if (provider === 'google') {
        const googleScopes = [
          'openid',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/gmail.compose',
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/contacts'
        ]
        authUrl.searchParams.set('scope', googleScopes.join(' '))
      }

      // Log the complete URL for debugging
      console.log('Generated Nylas OAuth URL:', {
        baseUrl,
        fullUrl: authUrl.toString(),
        params: Object.fromEntries(authUrl.searchParams)
      })
      
      console.log('Redirecting to Nylas OAuth:', authUrl.toString())
      
      return NextResponse.json({ url: authUrl.toString() })
    } catch (error) {
      console.error('Auth URL generation error:', error)
      return NextResponse.json({ 
        error: 'Failed to generate authentication URL',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Auth route error:', error)
    return NextResponse.json({ 
      error: 'Failed to process authentication request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}