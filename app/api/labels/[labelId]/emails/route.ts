import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ labelId: string }> }
) {
  try {
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
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
    const pageSize = 50;
    const offset = (page - 1) * pageSize;

    // Check if this is all-accounts mode
    const isAllAccounts = grantId === '__all_accounts__';

    if (!isAllAccounts && (!grantId || !emailAccountId)) {
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

    console.log('📡 BACKEND QUERY - Get labeled emails');
    console.log('   Label ID:', labelId);
    console.log('   All Accounts Mode:', isAllAccounts);
    console.log('   Page:', page, 'Offset:', offset, 'Size:', pageSize);

    if (isAllAccounts) {
      // ===== ALL-ACCOUNTS MODE (SAME ALGORITHM AS labels-count) =====
      
      // Get userId from session
      const cookieStore = await cookies();
      const supabaseClient = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
          },
        }
      );

      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
      
      if (userError || !user?.id) {
        console.error('❌ Failed to get authenticated user:', userError);
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      const userId = user.id;
      console.log('   User ID:', userId);

      // Step 1: Resolve auth_id to user_id if needed
      let resolvedUserId = userId;
      const { data: userData, error: userLookupError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('auth_id', userId)
        .single();

      if (!userLookupError && userData) {
        resolvedUserId = userData.id;
        console.log(`✓ Resolved auth_id "${userId}" → user_id: ${resolvedUserId}`);
      } else {
        console.log(`⚠️ Using userId as-is: ${userId}`);
      }

      // Step 2: Get all connected accounts for this user
      const { data: accounts, error: accountsError } = await supabaseAdmin
        .from('email_accounts')
        .select('id, grant_id, email, provider')
        .eq('user_id', resolvedUserId);

      if (accountsError || !accounts || accounts.length === 0) {
        console.log(`🏷️ No accounts found for user ${userId}`);
        return NextResponse.json({
          success: true,
          count: 0,
          totalCount: 0,
          page,
          pageSize,
          totalPages: 0,
          data: [],
        });
      }

      console.log(`✓ Found ${accounts.length} connected accounts`);
      const accountIds = accounts.map(a => a.id);
      console.log(`   Accounts: ${accountIds.join(', ')}`);

      // Step 3: Get ALL message_custom_labels matching this labelId across ALL accounts
      console.log(`🔄 Fetching all message_custom_labels for labelId="${labelId}" across ${accountIds.length} accounts...`);
      
      const { data: allMessageLabels, error: msgError, count: totalCount } = await supabaseAdmin
        .from('message_custom_labels')
        .select('id, message_id, applied_at, applied_by, mail_details, email_account_id', { count: 'exact' })
        .eq('custom_label_id', labelId)
        .in('email_account_id', accountIds)
        .order('applied_at', { ascending: false });

      if (msgError) {
        console.error(`❌ Error fetching message labels:`, msgError);
        return NextResponse.json(
          { error: msgError.message },
          { status: 500 }
        );
      }

      console.log(`✓ Found ${totalCount || 0} total message_custom_labels for this label`);

      // Step 4: Apply pagination to the merged results
      const paginatedData = (allMessageLabels || []).slice(offset, offset + pageSize);
      const totalPages = Math.ceil((totalCount || 0) / pageSize);

      console.log(`🏷️ ════════════════════════════════════════════════════════`);
      console.log(`🏷️ All-Accounts Label Fetch Result:`);
      console.log(`🏷️ Label ID: ${labelId}`);
      console.log(`🏷️ Total across all accounts: ${totalCount}`);
      console.log(`🏷️ Page: ${page}/${totalPages} (showing ${paginatedData.length} of ${pageSize})`);
      console.log(`🏷️ User accounts: ${accounts.length}`);
      console.log(`🏷️ ════════════════════════════════════════════════════════`);

      return NextResponse.json({
        success: true,
        count: paginatedData.length,
        totalCount: totalCount || 0,
        page,
        pageSize,
        totalPages,
        data: paginatedData,
      });
    } else {
      // ===== SINGLE-ACCOUNT MODE =====
      console.log('   Grant ID:', grantId);
      console.log('   Email Account ID:', emailAccountId);

      const { data, error, count } = await supabaseAdmin
        .from('message_custom_labels')
        .select('id, message_id, applied_at, applied_by, mail_details, email_account_id', { count: 'exact' })
        .eq('custom_label_id', labelId)
        .eq('email_account_id', emailAccountId)
        .or(`applied_by.cs.{"${grantId}"},applied_by.is.null`)
        .order('applied_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('❌ Supabase query error:', error);
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }

      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / pageSize);

      console.log(`✅ Found ${totalCount} labeled emails (page ${page}/${totalPages})`);

      return NextResponse.json({
        success: true,
        count: data?.length || 0,
        totalCount,
        page,
        pageSize,
        totalPages,
        data: data || [],
      });
    }
  } catch (error) {
    console.error('❌ Backend error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
