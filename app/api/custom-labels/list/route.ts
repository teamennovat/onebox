import { createSupabaseServerClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/custom-labels/list?emailAccountId=...
 * 
 * Returns all custom labels and which ones are applied to the current message
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const emailAccountId = searchParams.get('emailAccountId')
    const messageId = searchParams.get('messageId')

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

    // Fetch all custom labels
    const { data: labels, error: labelsError } = await supabase
      .from('custom_labels')
      .select('id, name, color, sort_order')
      .order('sort_order', { ascending: true })

    if (labelsError) {
      console.error('Error fetching labels:', labelsError)
      return NextResponse.json(
        { error: 'Failed to fetch labels' },
        { status: 500 }
      )
    }

    // If messageId is provided, fetch which labels are applied to this message
    let appliedLabelIds: string[] = []
    if (messageId) {
      const { data: appliedLabels, error: appliedError } = await supabase
        .from('message_custom_labels')
        .select('custom_label_id')
        .eq('message_id', messageId)

      if (appliedError) {
        console.error('Error fetching applied labels:', appliedError)
      } else {
        appliedLabelIds = (appliedLabels || []).map((item: any) => item.custom_label_id)
      }
    }

    return NextResponse.json({
      labels: labels || [],
      appliedLabels: appliedLabelIds
    })
  } catch (error) {
    console.error('Unexpected error in get labels endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
