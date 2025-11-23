import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/accounts/all-emails-by-folder
 * Intelligent folder-based email fetching with adaptive time windows
 * 
 * Algorithm:
 * 1. Start with 24h window, fetch 200+ emails from specified folder
 * 2. Track expansion attempts - if needed >1 expansion, increase initial window next time
 * 3. Learn and cache expansion patterns per folder per user
 * 4. Minimize Nylas requests through intelligent window sizing
 * 
 * Query params:
 * - userId: Auth ID of user
 * - folderId: Folder ID (e.g., INBOX, SENT, SPAM)
 * - page: Page number (0-based, 50 emails per page)
 * - pageSize: Emails per page (default 50)
 * - batchSize: Batch size for prefetch (default 200)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const authId = searchParams.get('userId')
    const folderId = searchParams.get('folderId') || 'INBOX'
    const page = parseInt(searchParams.get('page') || '0', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10)
    const batchSize = parseInt(searchParams.get('batchSize') || '200', 10)

    console.log('📂 Folder Emails Request:', { authId, folderId, page, pageSize, batchSize })

    if (!authId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      )
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server not configured' },
        { status: 500 }
      )
    }

    // Step 0: Resolve auth_id to user_id
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', authId)
      .single()

    if (userError) {
      console.error('Error fetching user:', userError)
      return NextResponse.json(
        { error: 'Failed to fetch user information' },
        { status: 500 }
      )
    }

    if (!userData) {
      return NextResponse.json({
        success: true,
        data: [],
        metadata: { 
          count: 0, 
          totalCount: 0,
          page,
          hasMore: false,
        },
      })
    }

    const userId = userData.id

    // Step 1: Get all connected accounts
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('email_accounts')
      .select('id, grant_id, email, provider')
      .eq('user_id', userId)

    if (accountsError || !accounts || accounts.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        metadata: { 
          count: 0, 
          totalCount: 0,
          page,
          hasMore: false
        },
      })
    }

    const nylasApiKey = process.env.NYLAS_API_KEY
    const nylasApiUri = process.env.NYLAS_API_URI || 'https://api.us.nylas.com'

    if (!nylasApiKey) {
      return NextResponse.json(
        { error: 'NYLAS_API_KEY not configured' },
        { status: 500 }
      )
    }

    // Step 2: Get stored optimal hours for this folder
    const { data: pattern } = await supabaseAdmin
      .from('email_fetch_patterns')
      .select('optimal_hours, emails_in_last_fetch')
      .eq('user_id', userId)
      .eq('folder_id', folderId)
      .single()
    
    const allEmails: any[] = []
    const seenIds = new Set<string>()
    const now = Math.floor(Date.now() / 1000)
    let attemptCount = 0
    let currentHours = 0

    // Step 3: Smart mathematical window calculation
    if (pattern?.optimal_hours) {
      // We have learned optimal hours from previous fetch - use it directly
      currentHours = pattern.optimal_hours
      console.log(`📊 ${folderId}: Learned ${currentHours}h | Expected: ~${pattern.emails_in_last_fetch} emails`)
    } else {
      // No history: start with baseline 24h to establish rate
      currentHours = 24
      console.log(`🔬 ${folderId}: Baseline 24h`)
    }

    // Helper function to fetch emails for a given window with deduplication
    // For different pages/batches, offset the time window to get older emails
    // page 0: now - currentHours to now (most recent)
    // page 1: now - (2*currentHours) to now - currentHours (older)
    // page 2: now - (3*currentHours) to now - (2*currentHours) (even older)
    const fetchEmailsInWindow = async (hoursBack: number, batchOffset: number = 0): Promise<any[]> => {
      const hoursBeforeBatch = batchOffset * hoursBack
      const receivedAfter = now - ((hoursBeforeBatch + hoursBack) * 3600)
      const receivedBefore = now - (hoursBeforeBatch * 3600)

      const fetchPromises = accounts.map(async (account) => {
        try {
          const url = new URL(`${nylasApiUri}/v3/grants/${account.grant_id}/messages`)
          url.searchParams.set('limit', '200')
          url.searchParams.set('in', folderId)
          url.searchParams.set('received_after', String(receivedAfter))
          url.searchParams.set('received_before', String(receivedBefore))

          const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${nylasApiKey}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
          })

          if (!response.ok) {
            if (response.status === 429 || response.status === 400) {
              console.warn(`⚠️ ${folderId}: API error ${response.status} for ${account.email}`)
              return []
            }
            return []
          }

          const data = await response.json()
          return (data.data || []).map((email: any) => ({
            id: email.id,
            subject: email.subject || '(No subject)',
            from: email.from || [],
            to: email.to || [],
            cc: email.cc || [],
            bcc: email.bcc || [],
            snippet: email.snippet || '',
            body: email.body || '',
            html: email.html || '',
            date: email.date,
            unread: email.unread,
            starred: email.starred,
            thread_id: email.thread_id,
            attachments: email.attachments || [],
            folders: email.folders || [],
            accountId: account.id,
            accountEmail: account.email,
            accountProvider: account.provider,
            grantId: account.grant_id,
            emailAccountId: account.id,
          }))
        } catch (error) {
          console.warn(`❌ ${folderId}: Fetch error for ${account.email}`)
          return []
        }
      })

      const results = await Promise.all(fetchPromises)
      
      const windowEmails: any[] = []
      let newCount = 0
      results.forEach((emails: any[]) => {
        emails.forEach((email: any) => {
          if (!seenIds.has(email.id)) {
            seenIds.add(email.id)
            windowEmails.push(email)
            newCount++
          }
        })
      })

      return windowEmails
    }

    // Step 4: Fetch with intelligent math-based window selection
    // Offset window based on which batch/page we're fetching
    // page 0 gets most recent, page 1 gets older, page 2 even older, etc.
    const batchOffset = page  // 0 for first batch, 1 for second, 2 for third, etc.
    
    // Attempt 1: Initial window (learned or 24h baseline)
    let windowEmails = await fetchEmailsInWindow(currentHours, batchOffset)
    allEmails.push(...windowEmails)
    attemptCount = 1

    console.log(`🔄 ${folderId}: Batch ${page} Attempt 1 | ${currentHours}h: +${windowEmails.length} | Total: ${allEmails.length}/${batchSize}`)

    // Always recalculate if we don't have enough emails (whether pattern existed or not)
    if (allEmails.length < batchSize) {
      const emailsInFirstAttempt = windowEmails.length
      
      if (emailsInFirstAttempt > 0) {
        const calculatedHours = Math.ceil((currentHours * batchSize) / emailsInFirstAttempt)
        console.log(`📐 ${folderId}: Batch ${page} Calc ${emailsInFirstAttempt}/${batchSize} → ${calculatedHours}h`)

        // Attempt 2: Use calculated window (only if different and reasonable)
        if (calculatedHours !== currentHours && calculatedHours <= 720) { // Cap at 30 days
          currentHours = calculatedHours
          windowEmails = await fetchEmailsInWindow(currentHours, batchOffset)
          allEmails.push(...windowEmails)
          attemptCount = 2

          console.log(`🔄 ${folderId}: Batch ${page} Attempt 2 | ${currentHours}h: +${windowEmails.length} | Total: ${allEmails.length}/${batchSize}`)

          // If still not enough, recalculate once more
          if (allEmails.length < batchSize && windowEmails.length > 0) {
            const emailsInSecondAttempt = windowEmails.length
            const recalculatedHours = Math.ceil((currentHours * batchSize) / emailsInSecondAttempt)
            console.log(`📐 ${folderId}: Batch ${page} Recalc ${emailsInSecondAttempt}/${batchSize} → ${recalculatedHours}h`)

            if (recalculatedHours !== currentHours && recalculatedHours <= 720) {
              currentHours = recalculatedHours
              windowEmails = await fetchEmailsInWindow(currentHours, batchOffset)
              allEmails.push(...windowEmails)
              attemptCount = 3

              console.log(`🔄 ${folderId}: Batch ${page} Attempt 3 | ${currentHours}h: +${windowEmails.length} | Total: ${allEmails.length}/${batchSize}`)
            }
          }
        }
      }
    }

    // Step 5: Sort by date (newest first)
    allEmails.sort((a: any, b: any) => (b.date || 0) - (a.date || 0))

    // Step 6: Return full batch (200 emails) not paginated
    // Frontend handles pagination through allEmails array
    // For prefetch requests (page > 0), return only new batch
    const paginatedEmails = page === 0 ? allEmails : allEmails
    const hasMore = allEmails.length >= batchSize

    console.log(`✨ ${folderId}: Batch ${page} | Returning ${paginatedEmails.length} emails | Total fetched: ${allEmails.length}`)

    // Step 7: Save optimal window size for this folder
    if (allEmails.length >= batchSize) {
      try {
        await supabaseAdmin
          .from('email_fetch_patterns')
          .upsert({
            user_id: userId,
            folder_id: folderId,
            optimal_hours: currentHours,
            emails_in_last_fetch: allEmails.length,
            last_fetched_at: new Date().toISOString(),
          }, { onConflict: 'user_id,folder_id' })
        console.log(`💾 ${folderId}: Saved ${currentHours}h (got ${allEmails.length}|${batchSize})`)
      } catch (err) {
        // Silent fail
      }
    }

    return NextResponse.json
       ({
      success: true,
      data: paginatedEmails,
      metadata: {
        count: paginatedEmails.length,
        totalCount: allEmails.length,
        page,
        folderId,
        hasMore,
        pageSize,
        batchSize,
        attemptsUsed: attemptCount,
        optimalWindowHours: currentHours,
      },
    })
  } catch (error) {
    console.error('Error in GET /api/accounts/all-emails-by-folder:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
