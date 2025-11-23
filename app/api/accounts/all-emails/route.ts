import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/accounts/all-emails
 * Intelligent email fetching with adaptive time windows
 * 
 * Algorithm:
 * 1. Start with 24h window, fetch 200+ emails
 * 2. Track expansion attempts - if needed >1 expansion, increase initial window next time
 * 3. Prefetch subsequent batches with learned window size
 * 4. Cache expansion patterns per user to minimize Nylas requests
 * 
 * Query params:
 * - userId: Auth ID of user
 * - page: Page number for pagination (0-based, 50 emails per page)
 * - pageSize: Emails per page (default 50)
 * - batchSize: Batch size for prefetch (default 200)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const authId = searchParams.get('userId')
    const page = parseInt(searchParams.get('page') || '0', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10)
    const batchSize = parseInt(searchParams.get('batchSize') || '200', 10)

    console.log('📧 All Emails Request:', { authId, page, pageSize, batchSize })

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

    // Step 2: Get stored optimal hours (learned from previous fetches)
    const { data: pattern } = await supabaseAdmin
      .from('email_fetch_patterns')
      .select('optimal_hours, emails_in_last_fetch')
      .eq('user_id', userId)
      .eq('folder_id', 'INBOX')
      .single()
    
    const allEmails: any[] = []
    const seenIds = new Set<string>() // ⭐ Global deduplication across ALL windows
    const now = Math.floor(Date.now() / 1000)
    let attemptCount = 0
    let currentHours = 0

    // Step 3: Smart mathematical window calculation
    if (pattern?.optimal_hours) {
      currentHours = pattern.optimal_hours
      console.log(`✅ Learned: ${currentHours}h`)
    } else {
      currentHours = 24
      console.log(`🚀 Start: baseline 24h`)
    }

    // Helper function to fetch emails for a given window with proper deduplication
    // For different pages/batches, offset the time window to get older emails
    // page 0: now - currentHours to now (most recent)
    // page 1: now - (2*currentHours) to now - currentHours (older)
    // page 2: now - (3*currentHours) to now - (2*currentHours) (even older)
    const fetchEmailsInWindow = async (hoursBack: number, batchOffset: number = 0): Promise<{ newEmails: any[]; totalFetched: number; newCount: number }> => {
      const hoursBeforeBatch = batchOffset * hoursBack
      const receivedAfter = now - ((hoursBeforeBatch + hoursBack) * 3600)
      const receivedBefore = now - (hoursBeforeBatch * 3600)

      const fetchPromises = accounts.map(async (account) => {
        try {
          const url = new URL(`${nylasApiUri}/v3/grants/${account.grant_id}/messages`)
          url.searchParams.set('limit', '200')
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

          if (!response.ok) return []

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
          return []
        }
      })

      const results = await Promise.all(fetchPromises)
      
      // Flatten all results
      const fetchedEmails: any[] = []
      results.forEach((emails: any[]) => {
        fetchedEmails.push(...emails)
      })

      // Deduplicate against global seenIds
      const newEmails: any[] = []
      fetchedEmails.forEach((email: any) => {
        if (!seenIds.has(email.id)) {
          seenIds.add(email.id)
          newEmails.push(email)
        }
      })

      return {
        newEmails,
        totalFetched: fetchedEmails.length,
        newCount: newEmails.length,
      }
    }

    // Step 4: Fetch with intelligent math-based window selection
    // Offset window based on which batch/page we're fetching
    // page 0 gets most recent, page 1 gets older, page 2 even older, etc.
    const batchOffset = page  // 0 for first batch, 1 for second, 2 for third, etc.
    
    // Attempt 1: Initial window (learned or 24h baseline)
    let result1 = await fetchEmailsInWindow(currentHours, batchOffset)
    allEmails.push(...result1.newEmails)
    attemptCount = 1
    console.log(`[Batch ${page}] [1/${batchSize}] ${currentHours}h: +${result1.newCount} new (${result1.totalFetched} fetched)`)

    // Always recalculate if we don't have enough emails (whether pattern existed or not)
    if (allEmails.length < batchSize) {
      const emailsInFirstAttempt = result1.totalFetched
      
      if (emailsInFirstAttempt > 0) {
        const calculatedHours = Math.ceil((currentHours * batchSize) / emailsInFirstAttempt)
        
        if (calculatedHours !== currentHours && calculatedHours <= 720) {
          currentHours = calculatedHours
          let result2 = await fetchEmailsInWindow(currentHours, batchOffset)
          allEmails.push(...result2.newEmails)
          attemptCount = 2
          console.log(`[Batch ${page}] [${allEmails.length}/${batchSize}] ${currentHours}h: +${result2.newCount} new (${result2.totalFetched} fetched)`)

          // If still not enough, recalculate once more
          if (allEmails.length < batchSize && result2.totalFetched > 0) {
            const emailsInSecondAttempt = result2.totalFetched
            const recalculatedHours = Math.ceil((currentHours * batchSize) / emailsInSecondAttempt)

            if (recalculatedHours !== currentHours && recalculatedHours <= 720) {
              currentHours = recalculatedHours
              let result3 = await fetchEmailsInWindow(currentHours, batchOffset)
              allEmails.push(...result3.newEmails)
              attemptCount = 3
              console.log(`[Batch ${page}] [${allEmails.length}/${batchSize}] ${currentHours}h: +${result3.newCount} new (${result3.totalFetched} fetched)`)
            }
          }
        }
      }
    }

    // Step 5: Save optimal window size for next fetch
    if (allEmails.length >= batchSize) {
      try {
        await supabaseAdmin
          .from('email_fetch_patterns')
          .upsert({
            user_id: userId,
            folder_id: 'INBOX',
            optimal_hours: currentHours,
            emails_in_last_fetch: allEmails.length,
            last_fetched_at: new Date().toISOString(),
          }, { onConflict: 'user_id,folder_id' })
        console.log(`💾 Optimal: ${currentHours}h (${attemptCount} attempt${attemptCount > 1 ? 's' : ''})`)
      } catch (err) {
        // Silent fail
      }
    }

    // Step 6: Sort by date (newest first)
    allEmails.sort((a, b) => (b.date || 0) - (a.date || 0))

    // Step 7: Return full batch (200 emails) not paginated
    // Frontend handles pagination through allEmails array
    // For prefetch requests (page > 0), return only new batch
    const paginatedEmails = page === 0 ? allEmails : allEmails
    const hasMore = allEmails.length >= batchSize

    console.log(`✨ Batch ${page} | Returning ${paginatedEmails.length} emails | Total fetched: ${allEmails.length}`)

    return NextResponse.json({
      success: true,
      data: paginatedEmails,
      metadata: {
        count: paginatedEmails.length,
        totalCount: allEmails.length,
        page,
        hasMore,
        pageSize,
        batchSize,
        attemptsUsed: attemptCount,
        optimalWindowHours: currentHours,
      },
    })
  } catch (error) {
    console.error('Error in GET /api/accounts/all-emails:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}

