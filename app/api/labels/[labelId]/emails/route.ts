import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ labelId: string }> }
) {
  try {
    // Await params since Next.js 15+ returns it as a Promise
    const resolvedParams = await params;
    const labelId = resolvedParams.labelId;
    
    if (!labelId) {
      console.error('❌ Missing labelId in params');
      return NextResponse.json(
        { error: 'Missing labelId' },
        { status: 400 }
      );
    }

    const grantId = request.nextUrl.searchParams.get('grantId');
    const emailAccountId = request.nextUrl.searchParams.get('emailAccountId');

    if (!grantId || !emailAccountId) {
      console.error('❌ Missing grantId or emailAccountId in query params');
      return NextResponse.json(
        { error: 'Missing grantId or emailAccountId' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      console.error('❌ Supabase admin client not initialized - SUPABASE_SERVICE_ROLE_KEY may not be set');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    console.log('📡 BACKEND QUERY - Get labeled emails');
    console.log('   Label ID:', labelId);
    console.log('   Grant ID:', grantId);
    console.log('   Email Account ID:', emailAccountId);

    // Use service role to bypass RLS
    const supabase = supabaseAdmin;

    // Query: Get emails with this label for this email account
    // Match either: applied_by contains grantId OR applied_by is null
    const { data, error, count } = await supabase
      .from('message_custom_labels')
      .select('id, message_id, applied_at, applied_by, mail_details', { count: 'exact' })
      .eq('custom_label_id', labelId)
      .eq('email_account_id', emailAccountId)
      .or(`applied_by.cs.{"${grantId}"},applied_by.is.null`)
      .order('applied_at', { ascending: false });

    if (error) {
      console.error('❌ Supabase query error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    console.log(`✅ Found ${count || 0} labeled emails`);
    console.log('   Data sample:', data?.[0] || 'No data');

    return NextResponse.json({
      success: true,
      count: count || 0,
      data: data || [],
    });
  } catch (error) {
    console.error('❌ Backend error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
