import { NextRequest, NextResponse } from 'next/server'
import { nylas } from '@/lib/nylas'

export async function POST(request: NextRequest) {
  try {
    // First verify required environment variables
    if (!process.env.NYLAS_API_KEY || !process.env.GCP_CLIENT_ID || !process.env.GCP_CLIENT_SECRET) {
      const missing = [
        !process.env.NYLAS_API_KEY && 'NYLAS_API_KEY',
        !process.env.GCP_CLIENT_ID && 'GCP_CLIENT_ID',
        !process.env.GCP_CLIENT_SECRET && 'GCP_CLIENT_SECRET'
      ].filter(Boolean).join(', ')
      throw new Error(`Missing required environment variables: ${missing}`)
    }

    const apiUrl = process.env.NYLAS_API_URI || 'https://api.us.nylas.com'
    
    // First check if a Google connector already exists
    console.log('Checking for existing Google connector...')
    const existingResponse = await fetch(`${apiUrl}/v3/connectors?provider=google`, {
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    const existingData = await existingResponse.json()
    console.log('Existing connectors response:', existingData)
    
    if (existingData.data?.length > 0) {
      console.log('Found existing Google connector:', {
        id: existingData.data[0].id,
        provider: existingData.data[0].provider,
        created_at: existingData.data[0].created_at
      })
      return NextResponse.json(existingData.data[0])
    }

    console.log('No existing connector found, creating new Google connector...')
    const response = await fetch(`${apiUrl}/v3/connectors`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: "google",
        settings: {
          client_id: process.env.GCP_CLIENT_ID,
          client_secret: process.env.GCP_CLIENT_SECRET,
          scope: [
            "openid",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/gmail.compose",
            "https://www.googleapis.com/auth/calendar",
            "https://www.googleapis.com/auth/contacts"
          ]
        }
      })
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error('Connector creation failed:', data)
      // If it's a duplicate error, try to fetch the existing connector
      if (data.error?.type === 'api.invalid_request_payload' && data.error.message.includes('duplicate')) {
        const retryResponse = await fetch(`${apiUrl}/v3/connectors?provider=google`, {
          headers: {
            'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
            'Content-Type': 'application/json'
          }
        })
        const retryData = await retryResponse.json()
        if (retryData.data?.length > 0) {
          console.log('Retrieved existing connector after duplicate error')
          return NextResponse.json(retryData.data[0])
        }
      }
      throw new Error(data.error?.message || 'Failed to create connector')
    }

    console.log('Google connector created successfully:', data)
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error creating connector:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to create connector'
    }, { status: 500 })
  }
}