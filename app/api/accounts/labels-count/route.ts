import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/accounts/labels-count
 * 
 * Fetch custom labels for the user and count messages for EACH label
 * by querying the message_custom_labels table.
 * 
 * Example response:
 * {
 *   "data": [
 *     { "id": "uuid1", "name": "To Respond", "color": "#FF0000", "count": 42 },
 *     { "id": "uuid2", "name": "FYI", "color": "#0000FF", "count": 15 },
 *     ...
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    console.log('🏷️ Labels Count Request (Multi-Account):', { userId })

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
    }

    // Resolve auth_id to user_id
    let resolvedUserId = userId
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', userId)
      .single()

    if (!userError && userData) {
      resolvedUserId = userData.id
      console.log(`✓ Resolved auth_id "${userId}" → user_id: ${resolvedUserId}`)
    } else if (userError) {
      console.log(`⚠️ Could not resolve auth_id "${userId}", using as-is (assuming it's a user_id UUID)`)
    }

    // Get all connected accounts for this user
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('email_accounts')
      .select('id, grant_id, email, provider')
      .eq('user_id', resolvedUserId)

    if (accountsError || !accounts || accounts.length === 0) {
      console.log(`🏷️ No accounts found for user ${userId}`)
      return NextResponse.json({
        data: []
      })
    }

    console.log(`🏷️ Found ${accounts.length} connected accounts`)

    // Step 1: Get all custom labels
    console.log(`🔄 Step 1: Fetching custom labels...`)
    const { data: allLabels, error: labelsError } = await supabaseAdmin
      .from('custom_labels')
      .select('id, name, color, sort_order')
      .order('sort_order', { ascending: true })

    if (labelsError || !allLabels) {
      console.error(`❌ Error fetching labels:`, labelsError)
      return NextResponse.json({
        data: []
      })
    }

    console.log(`✓ Found ${allLabels.length} custom labels`)

    // Step 2: Get all message_custom_labels for all accounts of this user
    console.log(`🔄 Step 2: Fetching message_custom_labels for all accounts...`)
    const accountIds = accounts.map(a => a.id)
    
    const { data: allMessageLabels, error: msgError } = await supabaseAdmin
      .from('message_custom_labels')
      .select('custom_label_id, email_account_id, mail_details, applied_by')
      .in('email_account_id', accountIds)

    if (msgError) {
      console.error(`❌ Error fetching message labels:`, msgError)
      return NextResponse.json({
        data: []
      })
    }

    console.log(`✓ Fetched ${allMessageLabels?.length || 0} message_custom_labels records`)

    // Step 3: Count emails per label across all accounts
    console.log(`🔀 Step 3: Merging label counts across accounts...`)
    const labelCounts = new Map<string, number>()

    allLabels.forEach((label) => {
      labelCounts.set(label.id, 0)
    })

    // Count messages for each label
    allMessageLabels?.forEach((msgLabel) => {
      const currentCount = labelCounts.get(msgLabel.custom_label_id) || 0
      labelCounts.set(msgLabel.custom_label_id, currentCount + 1)
    })

    // Step 4: Build response with non-zero counts only
    const labelsWithCounts = allLabels
      .map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        count: labelCounts.get(label.id) || 0
      }))
      .filter((l) => l.count > 0)

    console.log(`🏷️ ════════════════════════════════════════════════════════`)
    console.log(`🏷️ Result: ${labelsWithCounts.length} labels with emails from ${accounts.length} accounts`)
    console.log(`🏷️ User: ${resolvedUserId}`)
    console.log(`🏷️ Label Summary:`, labelsWithCounts.map(l => `${l.name}(${l.count})`))
    console.log(`🏷️ First 3 labels:`, labelsWithCounts.slice(0, 3).map(l => ({ 
      id: l.id, 
      name: l.name, 
      color: l.color,
      count: l.count
    })))
    console.log(`🏷️ ════════════════════════════════════════════════════════`)

    return NextResponse.json({ data: labelsWithCounts })
  } catch (error) {
    console.error('Error in GET /api/accounts/labels-count:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
