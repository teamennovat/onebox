import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/test/multimail
 * Fetch 50 emails from each connected account
 * Used for testing multi-account email aggregation
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const authId = searchParams.get('userId')

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

    // Step 1: Get the actual user ID from the users table using auth_id
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
        message: 'User not found',
        accounts: [],
        allEmails: [],
      })
    }

    const userId = userData.id

    // Step 2: Fetch all connected accounts for the user
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('email_accounts')
      .select('id, grant_id, email, provider')
      .eq('user_id', userId)

    if (accountsError) {
      console.error('Error fetching accounts:', accountsError)
      return NextResponse.json(
        { error: 'Failed to fetch accounts' },
        { status: 500 }
      )
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No connected accounts found',
        accounts: [],
        allEmails: [],
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

    // Fetch emails from each account
    const allEmails: any[] = []
    const accountResults = await Promise.all(
      accounts.map(async (account) => {
        try {
          const response = await fetch(
            `${nylasApiUri}/v3/grants/${account.grant_id}/messages?limit=50`,
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
            console.error(`Nylas API error for ${account.email}:`, response.status)
            return {
              accountId: account.id,
              email: account.email,
              provider: account.provider,
              grantId: account.grant_id,
              success: false,
              error: `Failed to fetch: ${response.statusText}`,
              emails: [],
              count: 0,
            }
          }

          const data = await response.json()
          const emails = data.data || []

          // Add account info to each email for tracking
          const emailsWithAccount = emails.map((email: any) => ({
            id: email.id,
            subject: email.subject || '(No subject)',
            from: email.from || [],
            to: email.to || [],
            snippet: email.snippet || '',
            date: email.date,
            unread: email.unread,
            starred: email.starred,
            // Account info
            accountId: account.id,
            accountEmail: account.email,
            accountProvider: account.provider,
            grantId: account.grant_id,
          }))

          allEmails.push(...emailsWithAccount)

          return {
            accountId: account.id,
            email: account.email,
            provider: account.provider,
            grantId: account.grant_id,
            success: true,
            emails: emailsWithAccount,
            count: emailsWithAccount.length,
          }
        } catch (error) {
          console.error(`Error fetching emails for ${account.email}:`, error)
          return {
            accountId: account.id,
            email: account.email,
            provider: account.provider,
            grantId: account.grant_id,
            success: false,
            error: String(error),
            emails: [],
            count: 0,
          }
        }
      })
    )

    // Sort all emails by date (newest first)
    allEmails.sort((a, b) => {
      const dateA = a.date || 0
      const dateB = b.date || 0
      return dateB - dateA
    })

    return NextResponse.json({
      success: true,
      totalAccounts: accounts.length,
      totalEmails: allEmails.length,
      accountResults,
      allEmails,
    })
  } catch (error) {
    console.error('Error in GET /api/test/multimail:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
