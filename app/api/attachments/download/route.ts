import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/attachments/download
 * Download attachment from Nylas API
 * 
 * Query params:
 * - grantId: Nylas grant ID
 * - messageId: Nylas message ID
 * - attachmentId: Attachment ID
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const grantId = searchParams.get('grantId')
    const messageId = searchParams.get('messageId')
    const attachmentId = searchParams.get('attachmentId')

    if (!grantId || !messageId || !attachmentId) {
      return NextResponse.json(
        { error: 'Missing grantId, messageId, or attachmentId' },
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

    // Download attachment from Nylas
    // Format: GET /v3/grants/{grant_id}/messages/{message_id}/attachments/{attachment_id}/download
    const response = await fetch(
      `${nylasApiUri}/v3/grants/${grantId}/messages/${messageId}/attachments/${attachmentId}/download`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${nylasApiKey}`,
          'Accept': '*/*',
        },
      }
    )

    if (!response.ok) {
      console.error(`Nylas API error: ${response.status}`)
      return NextResponse.json(
        { error: `Failed to download from Nylas: ${response.statusText}` },
        { status: response.status }
      )
    }

    // Get the file content
    const buffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const contentDisposition = response.headers.get('content-disposition')

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition || 'attachment',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Error in GET /api/attachments/download:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
