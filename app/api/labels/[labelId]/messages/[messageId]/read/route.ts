import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/labels/[labelId]/messages/[messageId]/read
 * 
 * Mark a labeled email as read by updating the mail_details in Supabase.
 * This endpoint updates:
 * - mail_details.unread = false
 * - Removes "UNREAD" from mail_details.folders array
 * 
 * Query params:
 * - grantId: The grant ID of the user (required)
 * - emailAccountId: The email account ID (required)
 * - unread: 'true' or 'false' (default: 'false')
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ labelId: string; messageId: string }> }
) {
  try {
    // Await params since Next.js 15+ returns it as a Promise
    const resolvedParams = await params;
    const labelId = resolvedParams.labelId;
    const messageId = resolvedParams.messageId;

    if (!labelId || !messageId) {
      console.error('❌ Missing labelId or messageId in params');
      return NextResponse.json(
        { error: 'Missing labelId or messageId' },
        { status: 400 }
      );
    }

    const grantId = request.nextUrl.searchParams.get('grantId');
    const emailAccountId = request.nextUrl.searchParams.get('emailAccountId');
    const unreadParam = request.nextUrl.searchParams.get('unread') || 'false';
    const unread = unreadParam === 'true';

    if (!grantId || !emailAccountId) {
      console.error('❌ Missing grantId or emailAccountId in query params');
      return NextResponse.json(
        { error: 'Missing grantId or emailAccountId' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      console.error('❌ Supabase admin client not initialized');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    console.log('📡 BACKEND UPDATE - Mark labeled email as read');
    console.log('   Label ID:', labelId);
    console.log('   Message ID:', messageId);
    console.log('   Grant ID:', grantId);
    console.log('   Email Account ID:', emailAccountId);
    console.log('   Unread:', unread);

    // First, fetch the current email record
    const { data: currentRecord, error: fetchError } = await supabaseAdmin
      .from('message_custom_labels')
      .select('id, mail_details')
      .eq('custom_label_id', labelId)
      .eq('message_id', messageId)
      .eq('email_account_id', emailAccountId)
      .contains('applied_by', [grantId])
      .single();

    if (fetchError) {
      console.error('❌ Failed to fetch record:', fetchError);
      return NextResponse.json(
        { error: 'Record not found' },
        { status: 404 }
      );
    }

    if (!currentRecord) {
      console.error('❌ Record not found');
      return NextResponse.json(
        { error: 'Record not found' },
        { status: 404 }
      );
    }

    // Update mail_details
    const updatedMailDetails = {
      ...currentRecord.mail_details,
      unread: unread,
      // Remove "UNREAD" from folders array if unread is false
      folders: unread 
        ? currentRecord.mail_details?.folders || []
        : (currentRecord.mail_details?.folders || []).filter((f: string) => f !== 'UNREAD')
    };

    // Update the record in Supabase
    const { error: updateError } = await supabaseAdmin
      .from('message_custom_labels')
      .update({ mail_details: updatedMailDetails })
      .eq('id', currentRecord.id);

    if (updateError) {
      console.error('❌ Failed to update record:', updateError);
      return NextResponse.json(
        { error: 'Failed to update record', details: updateError.message },
        { status: 500 }
      );
    }

    console.log('✅ Email marked as read in Supabase');
    console.log('   Record ID:', currentRecord.id);
    console.log('   New unread value:', unread);
    console.log('   New folders:', updatedMailDetails.folders);

    return NextResponse.json({
      success: true,
      message: 'Email marked as read',
      data: {
        labelId,
        messageId,
        unread,
        folders: updatedMailDetails.folders
      }
    });

  } catch (error) {
    console.error('❌ Backend error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
