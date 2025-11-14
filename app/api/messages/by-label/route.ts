import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/messages/by-label
 * Fetch messages filtered by custom label
 * 
 * Query params:
 * - labelId: UUID of the custom label
 * - emailAccountId: UUID of the email account
 * - limit: number of messages to fetch (default 50)
 * - offset: pagination offset (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const labelId = searchParams.get('labelId')
    const emailAccountId = searchParams.get('emailAccountId')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!labelId || !emailAccountId) {
      return NextResponse.json(
        { error: 'Missing labelId or emailAccountId' },
        { status: 400 }
      )
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database connection error' },
        { status: 500 }
      )
    }

    // Fetch message custom labels with mail details
    const { data, error } = await supabaseAdmin!
      .from('message_custom_labels')
      .select(
        `
        id,
        message_id,
        custom_label_id,
        applied_at,
        mail_details,
        custom_labels!inner(id, name, color)
      `
      )
      .eq('custom_label_id', labelId)
      .eq('email_account_id', emailAccountId)
      .order('applied_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching labeled messages:', error)
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      )
    }

    // Transform data to match Mail interface
    const mails = data.map((item: any) => ({
      id: item.message_id,
      name: item.mail_details?.from?.[0]?.name || item.mail_details?.from?.[0]?.email || 'Unknown',
      email: item.mail_details?.from?.[0]?.email || '',
      subject: item.mail_details?.subject || '(No subject)',
      text: item.mail_details?.snippet || '',
      date: new Date(item.mail_details?.date ? item.mail_details.date * 1000 : Date.now()).toISOString(),
      read: !item.mail_details?.unread,
      labels: [item.custom_labels.name],
      archived: false,
      mailDetails: item.mail_details, // Include full mail details
      grantId: item.mail_details?.grant_id,
    }))

    return NextResponse.json({
      success: true,
      data: mails,
      count: data.length,
    })
  } catch (error) {
    console.error('Error in GET /api/messages/by-label:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
