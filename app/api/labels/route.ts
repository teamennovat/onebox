import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')
  const emailAccountId = searchParams.get('emailAccountId')

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
    }

    console.log(`🏷️ Labels Request:`, { userId, emailAccountId, isAllAccounts: emailAccountId === '__all_accounts__' })

    // First resolve auth_id to user_id if needed
    let resolvedUserId = userId
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', userId)
      .single()
    
    if (!userError && userData) {
      resolvedUserId = userData.id
      console.log(`✓ Resolved auth_id ${userId} → user_id ${resolvedUserId}`)
    }

    // Fetch user's custom labels
    let query = supabaseAdmin
      .from('custom_labels')
      .select('id, name, color, created_at, email_account_id')
      .eq('user_id', resolvedUserId)

    // If emailAccountId specified and not all-accounts, filter by account
    if (emailAccountId && emailAccountId !== '__all_accounts__') {
      query = query.eq('email_account_id', emailAccountId)
      console.log(`🏷️ Fetching labels for account: ${emailAccountId}`)
    } else if (emailAccountId === '__all_accounts__') {
      // All accounts - no email_account_id filter, get all labels for user
      console.log(`🏷️ Fetching labels for ALL accounts`)
    }

    const { data: labels, error } = await query

    if (error) {
      console.error('Error fetching labels:', error)
      return NextResponse.json({ error: 'Failed to fetch labels' }, { status: 500 })
    }

    console.log(`🏷️ Found ${labels?.length || 0} custom labels for user`)

    // For each label, get the count of messages
    const labelsWithCounts = await Promise.all(
      (labels || []).map(async (label) => {
        if (!supabaseAdmin) {
          return {
            id: label.id,
            name: label.name,
            color: label.color,
            count: 0,
            created_at: label.created_at
          }
        }
        
        // For all-accounts mode, count messages across ALL email accounts
        // For single-account mode, count only for that account
        let countQuery = supabaseAdmin
          .from('message_custom_labels')
          .select('id', { count: 'exact' })
          .eq('custom_label_id', label.id)

        // If single account, join with messages table to filter by email_account_id
        if (emailAccountId && emailAccountId !== '__all_accounts__') {
          // For single account, the label itself is associated with that account
          // Just count messages tagged with this label
        }
        // For all-accounts mode, count all messages tagged with this label across all accounts

        const { count } = await countQuery

        const labelWithCount = {
          id: label.id,
          name: label.name,
          color: label.color,
          count: count || 0,
          created_at: label.created_at
        }

        console.log(`  - Label "${label.name}": ${labelWithCount.count} messages`)

        return labelWithCount
      })
    )

    console.log(`🏷️ Labels for user ${userId}: ${labelsWithCounts.length} labels | Total messages: ${labelsWithCounts.reduce((sum, l) => sum + l.count, 0)}`)

    return NextResponse.json({ data: labelsWithCounts })
  } catch (error) {
    console.error('Error in labels endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
