import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const grantId = searchParams.get('grantId')
  if (!grantId) {
    return NextResponse.json({ error: 'Grant ID is required' }, { status: 400 })
  }
  try {
    // If no grantId, return default empty folders
    if (grantId === 'none' || !grantId) {
      return NextResponse.json({
        data: [
          { id: 'inbox', name: 'INBOX', count: 0 },
          { id: 'sent', name: 'SENT', count: 0 },
          { id: 'important', name: 'IMPORTANT', count: 0 },
          { id: 'drafts', name: 'DRAFT', count: 0 },
          { id: 'spam', name: 'SPAM', count: 0 },
          { id: 'trash', name: 'TRASH', count: 0 }
        ]
      })
    }

    const encodedGrant = encodeURIComponent(String(grantId))
    const url = `https://api.us.nylas.com/v3/grants/${encodedGrant}/folders`
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
    
    if (!response.ok) {
      const error = await response.text()
      console.error('Nylas API error:', error)
      // If the grant is invalid/expired, return empty folders
      if (response.status === 401 || response.status === 404) {
        return NextResponse.json({
          data: [
            { id: 'inbox', name: 'INBOX', count: 0 },
            { id: 'sent', name: 'SENT', count: 0 },
            { id: 'important', name: 'IMPORTANT', count: 0 },
            { id: 'drafts', name: 'DRAFT', count: 0 },
            { id: 'spam', name: 'SPAM', count: 0 },
            { id: 'trash', name: 'TRASH', count: 0 }
          ]
        })
      }
      throw new Error(`Nylas API error: ${error}`)
    }
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching folders:', error)
    return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 })
  }
}
