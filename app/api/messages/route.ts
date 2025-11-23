import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const grantId = searchParams.get('grantId')
  const limit = searchParams.get('limit') || '50'
  const page_token = searchParams.get('page_token')
  const received_after = searchParams.get('received_after')
  const received_before = searchParams.get('received_before')
  
  // First check 'in' param for v3 API, fallback to folder/label for compatibility
  let folderValue = searchParams.get('in')
  if (!folderValue) {
    const folderFallback = searchParams.get('folder') || searchParams.get('label')
    if (folderFallback) {
      console.debug('Using fallback folder/label parameter for backward compatibility')
      folderValue = folderFallback
    }
  }

  if (!grantId) {
    return NextResponse.json({ error: 'Grant ID is required' }, { status: 400 })
  }

  try {
    const encodedGrant = encodeURIComponent(String(grantId))
    const url = new URL(`https://api.us.nylas.com/v3/grants/${encodedGrant}/messages`)
    url.searchParams.set('limit', limit)
    if (page_token) {
      url.searchParams.set('page_token', page_token)
    }
    // Add date range filters (Unix timestamps)
    if (received_after) {
      url.searchParams.set('received_after', received_after)
    }
    if (received_before) {
      url.searchParams.set('received_before', received_before)
    }

    // Add email filter parameters from query string
    const subject = searchParams.get('subject')
    if (subject) {
      url.searchParams.set('subject', subject)
    }
    
    const any_email = searchParams.get('any_email')
    if (any_email) {
      url.searchParams.set('any_email', any_email)
    }
    
    const to = searchParams.get('to')
    if (to) {
      url.searchParams.set('to', to)
    }
    
    const from = searchParams.get('from')
    if (from) {
      url.searchParams.set('from', from)
    }
    
    const cc = searchParams.get('cc')
    if (cc) {
      url.searchParams.set('cc', cc)
    }
    
    const bcc = searchParams.get('bcc')
    if (bcc) {
      url.searchParams.set('bcc', bcc)
    }
    
    const thread_id = searchParams.get('thread_id')
    if (thread_id) {
      url.searchParams.set('thread_id', thread_id)
    }
    
    const unread = searchParams.get('unread')
    if (unread !== null) {
      url.searchParams.set('unread', unread === 'true' ? 'true' : 'false')
    }
    
    const starred = searchParams.get('starred')
    if (starred !== null) {
      url.searchParams.set('starred', starred === 'true' ? 'true' : 'false')
    }
    
    const has_attachment = searchParams.get('has_attachment')
    if (has_attachment !== null) {
      url.searchParams.set('has_attachment', has_attachment === 'true' ? 'true' : 'false')
    }
    
    const search_query_native = searchParams.get('search_query_native')
    if (search_query_native) {
      url.searchParams.set('search_query_native', search_query_native)
    }

    if (folderValue) {
      function mapProviderFolder(f: string): string {
        // For v3 API, use EXACT folder IDs without case conversion
        const value = String(f)
        
        // Common system folder IDs in Nylas v3
        const systemMap: Record<string, string> = {
          'inbox': 'INBOX',
          'INBOX': 'INBOX',
          'sent': 'SENT',
          'SENT': 'SENT',
          'draft': 'DRAFT',
          'drafts': 'DRAFT',
          'DRAFT': 'DRAFT',
          'DRAFTS': 'DRAFT',
          'spam': 'SPAM',
          'SPAM': 'SPAM',
          'junk': 'SPAM',
          'JUNK': 'SPAM',
          'trash': 'TRASH',
          'TRASH': 'TRASH',
          'archive': 'ARCHIVE',
          'ARCHIVE': 'ARCHIVE',
          'starred': 'STARRED',
          'STARRED': 'STARRED',
          'important': 'IMPORTANT',
          'IMPORTANT': 'IMPORTANT'
        }

        // If it looks like a UUID or contains hyphens, it's likely a custom folder ID - use as-is
        if (/[0-9a-fA-F]-/.test(value) || value.includes('-')) {
          return value
        }

        // For system folders, use the standardized uppercase IDs
        // If not found in map, return the original value unchanged to preserve case
        return systemMap[value] || value
      }

      // Always set `in` array parameter for messages list endpoint
      const providerValue = mapProviderFolder(folderValue)
      console.log('📨 MESSAGE FETCH - Mapping folder to provider value:', { 
        input: folderValue, 
        mapped: providerValue,
        grantId,
        limit
      })
      url.searchParams.set('in', providerValue)
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('❌ NYLAS API ERROR:', {
        status: response.status,
        error,
        url: url.toString(),
        grantId,
        folderValue
      })
      throw new Error(`Nylas API error: ${error}`)
    }

    const data = await response.json()
    console.log('✅ NYLAS API RESPONSE SUCCESS', {
      status: response.status,
      url: url.toString(),
      dataCount: data.data ? data.data.length : 'no data array',
      nextCursor: data.next_cursor || data.nextCursor || 'none',
      folderValue,
      grantId
    })
    // Some providers return pagination tokens in headers or different keys.
    // Normalize: if provider didn't include next_cursor in body, try headers (e.g., x-next-cursor) or Link header.
    try {
      const normalized = { ...data }
      if (!normalized.next_cursor) {
        const headerNext = response.headers.get('x-next-cursor') || response.headers.get('next-cursor') || response.headers.get('X-Next-Cursor')
        if (headerNext) {
          normalized.next_cursor = headerNext
        } else {
          const link = response.headers.get('link') || response.headers.get('Link')
          if (link) {
            // parse rel="next" url and extract page_token or cursor
            const match = link.match(/<([^>]+)>;\s*rel="next"/i)
            if (match && match[1]) {
              try {
                const u = new URL(match[1])
                const pt = u.searchParams.get('page_token') || u.searchParams.get('cursor') || u.searchParams.get('next_cursor')
                if (pt) normalized.next_cursor = pt
              } catch (e) {
                // ignore
              }
            }
          }
        }
      }
      return NextResponse.json(normalized)
    } catch (e) {
      return NextResponse.json(data)
    }
  } catch (error) {
    console.error('Error fetching messages:', error)
    // Surface the upstream error message to the client for easier debugging (use 502 Bad Gateway)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}