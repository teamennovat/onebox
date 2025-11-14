import Nylas from 'nylas'

// Validate environment variables on initialization
function validateEnvVars() {
  const required = {
    NYLAS_API_KEY: process.env.NYLAS_API_KEY,
    NEXT_PUBLIC_NYLAS_CLIENT_ID: process.env.NEXT_PUBLIC_NYLAS_CLIENT_ID,
    NEXT_PUBLIC_CALLBACK_URI: process.env.NEXT_PUBLIC_CALLBACK_URI
  }

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

// Initialize Nylas client with validation
validateEnvVars()

export const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY!,
  apiUri: 'https://api.us.nylas.com'  // Always use HTTPS
})

// Configuration for client-side OAuth
export const nylasConfig = {
  clientId: process.env.NEXT_PUBLIC_NYLAS_CLIENT_ID!,
  callbackUri: process.env.NEXT_PUBLIC_CALLBACK_URI!,
  apiUri: 'https://api.us.nylas.com'  // Always use HTTPS
}

// Provider-specific secrets
const providerSecrets = {
  google: process.env.GCP_CLIENT_SECRET,
  yahoo: process.env.YAHOO_CLIENT_SECRET,
  microsoft: process.env.MICROSOFT_CLIENT_SECRET
} as const

// Helper function to create or get provider connector
export async function getOrCreateConnector(provider: string) {
  try {
    // First try to get existing connector
    const response = await fetch(`${nylasConfig.apiUri}/v3/connectors?provider=${provider}`, {
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })
    
    const data = await response.json()
    
    if (data.data?.length > 0) {
      return data.data[0]
    }
    
    // Create new connector if none exists
    console.log(`Creating new ${provider} connector...`)
    
    const createResponse = await fetch(`${nylasConfig.apiUri}/v3/connectors`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider,
        settings: {
          client_id: process.env.NEXT_PUBLIC_NYLAS_CLIENT_ID,
          client_secret: providerSecrets[provider as keyof typeof providerSecrets],
          ...(provider === 'google' ? {
            // Google-specific scopes for all required features
            scope: [
              'openid',
              'https://www.googleapis.com/auth/userinfo.email',
              'https://www.googleapis.com/auth/userinfo.profile',
              'https://www.googleapis.com/auth/gmail.modify',
              'https://www.googleapis.com/auth/gmail.compose',
              'https://www.googleapis.com/auth/calendar',
              'https://www.googleapis.com/auth/contacts'
            ]
          } : provider === 'yahoo' ? {
            // Yahoo-specific scopes
            scope: [
              'openid',
              'email',
              'mail-r',
              'mail-w'
            ]
          } : {})
        },
        redirect_uri: process.env.NEXT_PUBLIC_CALLBACK_URI
      })
    })

    if (!createResponse.ok) {
      const error = await createResponse.json()
      throw new Error(error.message || 'Failed to create connector')
    }

    return createResponse.json()
  } catch (error) {
    console.error('Connector error:', error)
    throw error
  }
}

// Helper function to validate grant access
export async function validateNylasGrant(grantId: string) {
  try {
    const response = await fetch(`${nylasConfig.apiUri}/v3/grants/${grantId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`
      }
    })
    return response.ok
  } catch (error) {
    return false
  }
}

// Helper function to exchange code for token
export async function exchangeCodeForToken(code: string, provider: string) {
  try {
    // First ensure the connector exists
    await getOrCreateConnector(provider)
    
    console.log('Exchanging code for token...', {
      code: code.substring(0, 8) + '...',
      provider,
      hasClientId: !!process.env.NEXT_PUBLIC_NYLAS_CLIENT_ID,
      hasApiKey: !!process.env.NYLAS_API_KEY,
      hasSecret: !!providerSecrets[provider as keyof typeof providerSecrets],
      callbackUri: process.env.NEXT_PUBLIC_CALLBACK_URI
    })
    
    // Exchange the code for a token
    const response = await fetch('https://api.us.nylas.com/v3/connect/token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_NYLAS_CLIENT_ID,
        client_secret: process.env.NYLAS_API_KEY,  // Use API key as client secret
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.NEXT_PUBLIC_CALLBACK_URI
      })
    })

    const responseData = await response.json()

    if (!response.ok) {
      console.error('Token exchange error:', {
        status: response.status,
        statusText: response.statusText,
        error: responseData
      })
      throw new Error(responseData.message || 'Failed to exchange code for token')
    }

    console.log('Token exchange response:', {
      hasGrantId: !!responseData.grant_id,
      hasEmail: !!responseData.email,
      hasAccessToken: !!responseData.access_token,
      hasRefreshToken: !!responseData.refresh_token
    })

    // Verify we got all needed data
    if (!responseData.grant_id || !responseData.email) {
      console.error('Invalid token response:', {
        hasGrantId: !!responseData.grant_id,
        hasEmail: !!responseData.email
      })
      throw new Error('Invalid token response from Nylas')
    }

    return responseData
  } catch (error) {
    console.error('Token exchange error:', error)
    throw error
  }
}

// Helper function to connect IMAP account
export async function connectImapAccount(credentials: {
  imap_username: string
  imap_password: string
  imap_host?: string
  imap_port?: number
  smtp_host?: string
  smtp_port?: number
}) {
  // Create IMAP connector if it doesn't exist
  await getOrCreateConnector('imap')

  const response = await fetch(`${nylasConfig.apiUri}/v3/connect/imap`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider: 'imap',
      settings: {
        client_id: process.env.NEXT_PUBLIC_NYLAS_CLIENT_ID,
        ...credentials
      }
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to connect IMAP account')
  }

  return response.json()
}

// Revoke a grant by ID using the Nylas HTTP API. Exported so server routes can revoke grants.
export async function revokeGrant(grantId: string) {
  if (!grantId) throw new Error('Missing grantId')
  const resp = await fetch(`${nylasConfig.apiUri}/v3/grants/${grantId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
      'Content-Type': 'application/json'
    }
  })

  if (!resp.ok) {
    let text = 'unknown error'
    try {
      const json = await resp.json()
      text = json.message || JSON.stringify(json)
    } catch (e) {
      try {
        text = await resp.text()
      } catch {}
    }
    throw new Error(`Failed to revoke grant: ${text}`)
  }

  return true
}