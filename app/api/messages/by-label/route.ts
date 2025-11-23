import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/messages/by-label
 * Fetch messages filtered by custom label
 * 
 * Query params:
 * - labelId: UUID of the custom label
 * - emailAccountId: UUID of the email account
 * - grantId: (optional) Nylas grant ID to filter labeled emails by account visibility (applied_by)
 * - limit: number of messages to fetch (default 50)
 * - offset: pagination offset (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const labelId = searchParams.get('labelId')
    const emailAccountId = searchParams.get('emailAccountId')
    const grantId = searchParams.get('grantId')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Log incoming request payload
    console.log('📥 [GET /api/messages/by-label] INCOMING REQUEST')
    console.log('=' .repeat(80))
    console.log('Query Parameters Received:', {
      labelId,
      emailAccountId,
      grantId,
      limit,
      offset,
      fullUrl: request.url,
    })
    console.log('=' .repeat(80))

    if (!labelId || !emailAccountId) {
      console.error('❌ Missing required parameters:', { labelId, emailAccountId })
      return NextResponse.json(
        { error: 'Missing labelId or emailAccountId' },
        { status: 400 }
      )
    }

    if (!supabaseAdmin) {
      console.error('❌ Database connection error')
      return NextResponse.json(
        { error: 'Database connection error' },
        { status: 500 }
      )
    }

    console.log('🔍 Querying Supabase with filters:', {
      custom_label_id: labelId,
      email_account_id: emailAccountId,
      limit,
      offset,
    })

    // Fetch message custom labels with mail details
    const { data, error } = await supabaseAdmin!
      .from('message_custom_labels')
      .select(
        `
        id,
        message_id,
        custom_label_id,
        applied_at,
        applied_by,
        mail_details,
        custom_labels!inner(id, name, color)
      `
      )
      .eq('custom_label_id', labelId)
      .eq('email_account_id', emailAccountId)
      .order('applied_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('❌ Supabase query error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      )
    }

    console.log('✅ Supabase returned', data?.length || 0, 'rows')

    // Filter by applied_by if grantId is provided
    // applied_by is a TEXT[] array of grant_id strings
    const filteredData = grantId
      ? data.filter((item: any) => {
          const appliedBy = item.applied_by
          if (Array.isArray(appliedBy)) {
            return appliedBy.includes(grantId)
          } else if (typeof appliedBy === 'string') {
            return appliedBy === grantId
          }
          return false
        })
      : data

    console.log('📊 After grant_id filter:', filteredData.length, 'rows remaining')
    if (grantId) {
      console.log('   Grant ID applied_by filter details:')
      data?.forEach((item: any, idx: number) => {
        const appliedBy = item.applied_by
        const matches = Array.isArray(appliedBy) 
          ? appliedBy.includes(grantId)
          : appliedBy === grantId
        console.log(`   Row ${idx}: applied_by=${JSON.stringify(appliedBy)} matches=${matches}`)
      })
    }

    // Transform data to match Mail interface
    const mails = filteredData.map((item: any) => ({
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

    console.log('✅ [GET /api/messages/by-label] RESPONSE')
    console.log('=' .repeat(80))
    console.log('Response Data:', {
      success: true,
      count: mails.length,
      mails: mails.slice(0, 2).map(m => ({ id: m.id, subject: m.subject, from: m.email })),
    })
    console.log('=' .repeat(80))

    return NextResponse.json({
      success: true,
      data: mails,
      count: filteredData.length,
    })
  } catch (error) {
    console.error('❌ [GET /api/messages/by-label] ERROR:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
