import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/accounts/search
 * Search and filter emails across all connected accounts
 * 
 * Query params:
 * - userId: Auth ID of user
 * - searchQuery: Search query string (searches subject, body, from, to, etc)
 * - filters: JSON stringified filters object
 * - page: Page number (0-based)
 * - pageSize: Emails per page (default 50)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const searchQuery = searchParams.get('searchQuery') || ''
    const filtersJson = searchParams.get('filters') || '{}'
    const page = parseInt(searchParams.get('page') || '0', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10)

    console.log('🔎 All-Accounts Search Request:', { userId, searchQuery, page, pageSize })

    if (!userId) {
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

    // Step 1: Resolve auth_id to user_id
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', userId)
      .single()

    if (userError || !userData) {
      console.error('Error fetching user:', userError)
      return NextResponse.json({
        success: true,
        data: [],
        metadata: {
          count: 0,
          totalCount: 0,
          page,
          hasMore: false
        }
      })
    }

    // Step 2: Get all connected accounts
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('email_accounts')
      .select('id, grant_id, email, provider')
      .eq('user_id', userData.id)

    if (accountsError || !accounts || accounts.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        metadata: {
          count: 0,
          totalCount: 0,
          page,
          hasMore: false
        }
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

    // Step 3: Parse filters
    let filters: any = {}
    try {
      filters = JSON.parse(filtersJson)
    } catch (e) {
      console.warn('Failed to parse filters:', e)
    }

    // Step 4: Fetch emails from all accounts in parallel
    const allEmails: any[] = []
    const seenIds = new Set<string>()

    const searchPromises = accounts.map(async (account) => {
      try {
        const url = new URL(`${nylasApiUri}/v3/grants/${encodeURIComponent(account.grant_id)}/messages`)

        // Add search query if provided
        if (searchQuery) {
          url.searchParams.set('search_query_native', searchQuery)
        }

        // Add filters
        if (filters.from) url.searchParams.set('from', filters.from)
        if (filters.to) url.searchParams.set('to', filters.to)
        if (filters.cc) url.searchParams.set('cc', filters.cc)
        if (filters.bcc) url.searchParams.set('bcc', filters.bcc)
        if (filters.any_email) url.searchParams.set('any_email', filters.any_email)
        if (typeof filters.unread === 'boolean') url.searchParams.set('unread', String(filters.unread))
        if (typeof filters.has_attachment === 'boolean') url.searchParams.set('has_attachment', String(filters.has_attachment))
        if (filters.received_after) url.searchParams.set('received_after', String(filters.received_after))
        if (filters.received_before) url.searchParams.set('received_before', String(filters.received_before))

        // Nylas pagination - fetch more results per request to combine them
        url.searchParams.set('limit', '200')

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${nylasApiKey}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          if (response.status === 429 || response.status === 400) {
            console.warn(`⚠️ Search API error ${response.status} for ${account.email}`)
            return []
          }
          return []
        }

        const data = await response.json()
        const emails = (data.data || []).map((email: any) => ({
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
          emailAccountId: account.id
        }))

        return emails
      } catch (error) {
        console.warn(`❌ Search error for ${account.email}:`, error)
        return []
      }
    })

    // Execute all searches in parallel
    const results = await Promise.all(searchPromises)

    // Combine and deduplicate
    results.forEach((emails) => {
      emails.forEach((email: any) => {
        if (!seenIds.has(email.id)) {
          seenIds.add(email.id)
          allEmails.push(email)
        }
      })
    })

    // Sort by date (newest first)
    allEmails.sort((a: any, b: any) => (b.date || 0) - (a.date || 0))

    // Paginate
    const startIndex = page * pageSize
    const endIndex = startIndex + pageSize
    const paginatedEmails = allEmails.slice(startIndex, endIndex)
    const hasMore = endIndex < allEmails.length

    console.log(`✨ All-Accounts Search: Found ${allEmails.length} total | Returning page ${page} (${paginatedEmails.length}/${pageSize})`)

    return NextResponse.json({
      success: true,
      data: paginatedEmails,
      metadata: {
        count: paginatedEmails.length,
        totalCount: allEmails.length,
        page,
        hasMore,
        pageSize,
        accountsSearched: accounts.length
      }
    })
  } catch (error) {
    console.error('Error in all-accounts search:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
