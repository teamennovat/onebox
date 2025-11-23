import { createSupabaseServerClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params
    const { labelId, action } = await request.json() // action: 'add' or 'remove'

    if (!messageId || !labelId || !action) {
      return NextResponse.json(
        { error: 'Missing messageId, labelId, or action' },
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

    if (action === 'add') {
      // Add label to message
      const { data, error } = await supabase
        .from('message_custom_labels')
        .insert({
          message_id: messageId,
          custom_label_id: labelId,
          applied_at: new Date().toISOString()
        })
        .select()

      if (error) {
        // If it's a duplicate key error, that's fine - label is already applied
        if (error.code === '23505') {
          return NextResponse.json({ success: true, message: 'Label already applied' })
        }
        console.error('Error adding label:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to add label' },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, data })
    } else if (action === 'remove') {
      // Remove label from message
      const { error } = await supabase
        .from('message_custom_labels')
        .delete()
        .eq('message_id', messageId)
        .eq('custom_label_id', labelId)

      if (error) {
        console.error('Error removing label:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to remove label' },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, message: 'Label removed' })
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "add" or "remove"' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('Unexpected error in label endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
