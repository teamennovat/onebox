import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/attachments/from-nylas
 * Fetch attachment details from Nylas API
 * 
 * Query params:
 * - grantId: Nylas grant ID
 * - messageId: Nylas message ID
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const grantId = searchParams.get('grantId')
    const messageId = searchParams.get('messageId')

    if (!grantId || !messageId) {
      return NextResponse.json(
        { error: 'Missing grantId or messageId' },
        { status: 400 }
      )
    }

    const nylasApiKey = process.env.NYLAS_API_KEY
    const nylasApiUri = process.env.NYLAS_API_URI || 'https://api.us.nylas.com'

    if (!nylasApiKey) {
      return NextResponse.json(
        { error: 'NYLAS_API_KEY not configured' },
        { status: 500 }
      )
    }

    // Fetch message from Nylas with full details including attachments
    const response = await fetch(
      `${nylasApiUri}/v3/grants/${grantId}/messages/${messageId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${nylasApiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      console.error(`Nylas API error: ${response.status}`)
      return NextResponse.json(
        { error: `Failed to fetch from Nylas: ${response.statusText}` },
        { status: response.status }
      )
    }

    const message = await response.json()

    // Extract attachments
    const attachments = message.attachments || []

    return NextResponse.json({
      success: true,
      messageId: message.id,
      attachments: attachments.map((att: any) => ({
        id: att.id,
        filename: att.filename,
        size: att.size,
        contentType: att.content_type,
        contentId: att.content_id,
      })),
      fullMessage: message,
    })
  } catch (error) {
    console.error('Error in GET /api/attachments/from-nylas:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
