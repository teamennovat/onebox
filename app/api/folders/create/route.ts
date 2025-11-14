import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const grantId = searchParams.get('grantId')
  
  if (!grantId) {
    return NextResponse.json({ error: 'Grant ID is required' }, { status: 400 })
  }

  try {
    const encodedGrant = encodeURIComponent(String(grantId))
    const url = `https://api.us.nylas.com/v3/grants/${encodedGrant}/folders`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        name: 'ARCHIVE',
        description: 'Archive folder for storing archived emails'
      })
    })
    
    if (!response.ok) {
      const error = await response.text()
      console.error('Nylas API error:', error)
      throw new Error(`Nylas API error: ${error}`)
    }
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error creating folder:', error)
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 })
  }
}