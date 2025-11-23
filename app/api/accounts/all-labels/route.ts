import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/accounts/all-labels
 * Fetch custom labels from all connected accounts (merged view)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const authId = searchParams.get('userId')

    console.log('🏷️ All Labels Request:', { authId })

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

    // Resolve auth_id to user_id
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', authId)
      .single()

    if (userError) {
      // If auth_id doesn't resolve, try using authId as user_id directly (it might already be a UUID)
      console.warn('⚠️ Could not resolve auth_id, will try using as-is:', { authId, error: userError.message })
    }

    if (!userData && userError) {
      // Try using authId as-is (assume it's a user_id UUID)
      console.log(`ℹ️ Attempting to use authId "${authId}" as user_id directly`)
    }

    const userId = userData?.id || authId
    console.log('✓ Resolved auth_id to user_id:', { authId, userId, foundUser: !!userData })

    // Fetch all custom labels for this user
    const { data: allLabels, error: labelsError } = await supabaseAdmin
      .from('custom_labels')
      .select('id, name, color, sort_order')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })

    if (labelsError) {
      console.error('❌ Error fetching custom labels:', labelsError)
      return NextResponse.json({
        success: false,
        error: labelsError.message,
      }, { status: 500 })
    }

    console.log(`📊 Found ${allLabels?.length || 0} custom labels for user ${userId}`)

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server not configured' },
        { status: 500 }
      )
    }

    // For each label, count messages across ALL email accounts
    const labelsWithCounts: any[] = []
    for (const label of allLabels || []) {
      try {
        const { count, error: countError } = await supabaseAdmin
          .from('message_custom_labels')
          .select('id', { count: 'exact' })
          .eq('custom_label_id', label.id)

        if (countError) {
          console.error(`❌ Error counting messages for label ${label.name}:`, countError)
          labelsWithCounts.push({ ...label, count: 0 })
          continue
        }

        console.log(`  - Label "${label.name}": ${count || 0} messages`)
        labelsWithCounts.push({ ...label, count: count || 0 })
      } catch (err) {
        console.error(`❌ Error processing label ${label.name}:`, err)
        labelsWithCounts.push({ ...label, count: 0 })
      }
    }

    const totalMessages = labelsWithCounts.reduce((sum, l) => sum + (l.count || 0), 0)
    console.log(`📊 All Labels with counts: ${labelsWithCounts.length} labels | Total: ${totalMessages} messages`)

    return NextResponse.json({
      success: true,
      data: labelsWithCounts,
      metadata: {
        totalLabels: labelsWithCounts.length,
        totalMessages,
      },
    })
  } catch (error) {
    console.error('Error in GET /api/accounts/all-labels:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
