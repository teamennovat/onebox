import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
  }

  try {
    // First try: email_accounts where user_id matches the provided userId
    let { data: accounts, error } = await supabaseAdmin
      .from('email_accounts')
      .select('id, grant_id, email, provider, grant_status, is_primary, settings, connected_at, last_sync')
      .eq('user_id', userId)

    if (error) throw error

    // If no accounts found, it's possible userId is an auth uid stored in users.auth_id.
    // Try to resolve users.id by auth_id and query email_accounts with that id.
    if ((!accounts || accounts.length === 0)) {
      const { data: usersData, error: userErr } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('auth_id', userId)
        .limit(1)

      if (userErr) throw userErr

      const resolvedUserId = usersData && usersData.length > 0 ? usersData[0].id : null

      if (resolvedUserId) {
        const { data: accounts2, error: accountsErr } = await supabaseAdmin
          .from('email_accounts')
          .select('id, grant_id, email, provider, grant_status, is_primary, settings, connected_at, last_sync')
          .eq('user_id', resolvedUserId)

        if (accountsErr) throw accountsErr

        accounts = accounts2 ?? []
      }
    }

    return NextResponse.json({ accounts: accounts ?? [] })
  } catch (error) {
    console.error('Error fetching accounts:', error)
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }
}