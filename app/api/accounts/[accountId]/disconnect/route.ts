import { NextRequest, NextResponse } from 'next/server'
import { revokeGrant } from '@/lib/nylas'
import { supabase } from '@/lib/supabase'

export async function DELETE(
  request: NextRequest,
  context: { params: { accountId: string } | Promise<{ accountId: string }> }
) {
  try {
    // Resolve params (some Next types provide params as a Promise)
    const params = await context.params

    // Get account details
    const { data: account, error: accountError } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', params.accountId)
      .single()

    if (accountError) throw accountError
    if (!account) throw new Error('Account not found')

    // Revoke Nylas grant via helper
    await revokeGrant(account.grant_id)

    // Delete account from database
    const { error: deleteError } = await supabase
      .from('email_accounts')
      .delete()
      .eq('id', params.accountId)

    if (deleteError) throw deleteError

    // If this was the primary account, set another account as primary
    if (account.is_primary) {
      const { data: nextAccount } = await supabase
        .from('email_accounts')
        .select('id')
        .eq('user_id', account.user_id)
        .neq('id', params.accountId)
        .limit(1)
        .single()

      if (nextAccount) {
        await supabase
          .from('email_accounts')
          .update({ is_primary: true })
          .eq('id', nextAccount.id)
      }
    }

    return NextResponse.json({ 
      success: true,
      message: 'Account disconnected successfully'
    })
  } catch (error) {
    console.error('Error disconnecting account:', error)
    return NextResponse.json(
      { 
        error: 'Failed to disconnect account',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}