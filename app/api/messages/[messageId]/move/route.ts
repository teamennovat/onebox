import { NextRequest, NextResponse } from 'next/server'
import { nylasConfig } from '@/lib/nylas'

// POST /api/messages/[messageId]/move - Move a message to a different folder
export async function POST(
  request: NextRequest,
  { params }: { params: { messageId?: string } }
) {
  try {
      // Debug incoming params
      console.debug('move route: received params', {
        paramsType: typeof params,
        hasMessageId: 'messageId' in (params || {}),
        messageIdParam: params?.messageId,
        messageIdParamType: typeof params?.messageId
      })

      // Fallback extraction for messageId (params -> pathname -> query -> body)
      let urlMessageId = params?.messageId
      if (!urlMessageId) {
        try {
          const pathname = new URL(request.url).pathname
          const parts = pathname.split('/').filter(Boolean)
          const msgIndex = parts.findIndex((p) => p === 'messages')
          if (msgIndex >= 0 && parts.length > msgIndex + 1) {
            urlMessageId = parts[msgIndex + 1]
            console.debug('move route: extracted messageId from pathname fallback', { pathname, urlMessageId })
          }
        } catch (e) {
          console.error('move route: failed to parse pathname for messageId fallback', e)
        }
      }

      const { searchParams } = new URL(request.url)
      // Accept grantId/destination/messageId via query params (defensive)
      const grantFromQuery = searchParams.get('grantId')
      const destFromQuery = searchParams.get('destination')
      const msgFromQuery = searchParams.get('messageId')

      // Parse body safely
      let parsedBody: any = {}
      try {
        const raw = await request.text()
        parsedBody = raw ? JSON.parse(raw) : {}
      } catch (e) {
        parsedBody = {}
      }

      const grantId = grantFromQuery || parsedBody?.grantId || null
      const destination = (destFromQuery || parsedBody?.destination || null)
      // allow messageId in query/body as final fallback
      urlMessageId = urlMessageId || msgFromQuery || parsedBody?.messageId || null

      if (!grantId) {
        return NextResponse.json({ error: 'Grant ID is required' }, { status: 400 })
      }

      // Validate messageId
      if (!urlMessageId || typeof urlMessageId !== 'string' || urlMessageId.trim().length < 6) {
        console.error('move route: invalid messageId', { messageId: urlMessageId, messageIdType: typeof urlMessageId })
        return NextResponse.json({ error: 'Invalid messageId', debug: { messageId: urlMessageId, messageIdType: typeof urlMessageId, grantId } }, { status: 400 })
      }

      if (!destination || typeof destination !== 'string') {
        console.error('move route: missing destination', { messageId: urlMessageId, grantId })
        return NextResponse.json({ error: 'Destination folder is required', debug: { messageId: urlMessageId, grantId } }, { status: 400 })
      }

      // Resolve folder IDs by querying provider folders so we use real folder IDs
      const foldersEndpoint = `${nylasConfig.apiUri}/v3/grants/${encodeURIComponent(String(grantId))}/folders`
      let foldersData: any = null
      try {
        const foldersResponse = await fetch(foldersEndpoint, {
          headers: {
            'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
            'Accept': 'application/json'
          }
        })
        if (foldersResponse.ok) {
          foldersData = await foldersResponse.json()
        } else {
          console.warn('move route: failed to fetch folders', { status: foldersResponse.status, grantId })
        }
      } catch (e) {
        console.warn('move route: error fetching folders', e)
      }

      // Normalize destination -> try to find matching folder id from provider
      const destLower = destination.toLowerCase()
      let folderValue: string | null = null

      if (foldersData?.data && Array.isArray(foldersData.data)) {
        const found = foldersData.data.find((f: any) => {
          if (!f) return false
          const fid = String(f.id || '').toLowerCase()
          const fname = String(f.name || '').toLowerCase()
          const ftype = String(f.type || '').toLowerCase()
          return fid === destLower || fname === destLower || 
                 fid === destLower.replace(/ /g, '_') ||
                 // Some providers require system folder names to match case exactly
                 (destLower === 'archive' && (fname === 'archive' || ftype === 'archive')) ||
                 (destLower === 'archived' && (fname === 'archived' || ftype === 'archive'))
        })
        if (found) folderValue = found.id
      }

      // Special-case: create ARCHIVE folder if user asked for 'archive' and provider has none
      if (!folderValue && (destLower === 'archive' || destLower === 'archived')) {
        // create and then re-fetch to get ID
        try {
          const createResp = await fetch(foldersEndpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: 'ARCHIVE' })
          })
          if (createResp.ok) {
            const created = await createResp.json()
            folderValue = created.id || null
          } else {
            console.warn('move route: failed to create ARCHIVED folder', { status: createResp.status })
          }
        } catch (e) {
          console.warn('move route: error creating ARCHIVED folder', e)
        }
        // if still not found, try a final folders fetch
        if (!folderValue) {
          try {
            const reResp = await fetch(foldersEndpoint, { headers: { 'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`, 'Accept': 'application/json' } })
            if (reResp.ok) {
              const reData = await reResp.json()
              const found = reData.data?.find((f: any) => String(f.name || '').toLowerCase().includes('archiv'))
              if (found) folderValue = found.id
            }
          } catch (e) {
            /* ignore */
          }
        }
      }

      // If still no folderValue, allow using the destination string as an ID (caller may pass real id)
      if (!folderValue) folderValue = destination

      // Log the exact request we'll send to Nylas
      console.debug('move route: preparing Nylas request', { messageId: urlMessageId, grantId, destination, folderValue })

      const encodedGrant = encodeURIComponent(String(grantId))
      const endpoint = `${nylasConfig.apiUri}/v3/grants/${encodedGrant}/messages/${urlMessageId}`

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ folders: [folderValue] })
      })

      const text = await response.text().catch(() => '')
      if (!response.ok) {
        let parsed: any = null
        try { parsed = JSON.parse(text) } catch (e) { /* ignore */ }
        console.error('Nylas move error', { status: response.status, body: text, messageId: urlMessageId, grantId, destination, folderValue })
        return NextResponse.json({ error: 'Nylas API error', details: parsed ?? text, debug: { messageId: urlMessageId, messageIdType: typeof urlMessageId, grantId, destination, folderValue } }, { status: response.status })
      }

      let data: any = null
      try { data = JSON.parse(text) } catch (e) { data = text }
      return NextResponse.json({ ok: true, provider: data, debug: { messageId: urlMessageId, messageIdType: typeof urlMessageId, grantId, destination, folderValue } })

    } catch (error) {
      console.error('Error in move message route:', error)
      const message = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: message, debug: { messageId: params?.messageId ?? null, messageIdType: typeof params?.messageId, grantId: new URL(request.url).searchParams.get('grantId') } }, { status: 502 })
    }
  }