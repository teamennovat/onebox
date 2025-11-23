import { createSupabaseServerClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * PATCH endpoint to change a message's custom label
 * Removes the old label and adds the new one
 * 
 * Body: {
 *   oldLabelId: string,    // Label to remove
 *   newLabelId: string,    // Label to add
 *   emailAccountId: string,
 *   grantId: string
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params
    const { oldLabelId, newLabelId, emailAccountId, grantId } = await request.json()

    if (!messageId || !oldLabelId || !newLabelId) {
      return NextResponse.json(
        { error: 'Missing messageId, oldLabelId, or newLabelId' },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServerClient()

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Remove old label
    const { error: deleteError } = await supabase
      .from('message_custom_labels')
      .delete()
      .eq('message_id', messageId)
      .eq('custom_label_id', oldLabelId)
      .eq('email_account_id', emailAccountId)

    if (deleteError) {
      console.error('Error removing old label:', deleteError)
      return NextResponse.json(
        { error: deleteError.message || 'Failed to remove old label' },
        { status: 500 }
      )
    }

    // Add new label with same mail_details if available
    // First, get the mail_details from the old label entry
    const { data: oldLabelData } = await supabase
      .from('message_custom_labels')
      .select('mail_details')
      .eq('message_id', messageId)
      .eq('custom_label_id', newLabelId)
      .single()

    const { data, error: insertError } = await supabase
      .from('message_custom_labels')
      .insert({
        message_id: messageId,
        custom_label_id: newLabelId,
        email_account_id: emailAccountId,
        applied_by: grantId ? [grantId] : null,
        applied_at: new Date().toISOString(),
        mail_details: oldLabelData?.mail_details || null,
      })
      .select()

    if (insertError) {
      // If it's a duplicate key error, that's fine - label is already applied
      if (insertError.code === '23505') {
        return NextResponse.json({ success: true, message: 'Label already applied' })
      }
      console.error('Error adding new label:', insertError)
      return NextResponse.json(
        { error: insertError.message || 'Failed to add new label' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      data,
      message: 'Label changed successfully'
    })
  } catch (error) {
    console.error('Unexpected error in label-change endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
