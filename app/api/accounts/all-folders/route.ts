import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/accounts/all-folders
 * Fetch folders from all connected accounts and merge their counts
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const authId = searchParams.get('userId')

    console.log('📂 All Folders Request:', { authId })

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
      console.error('Error fetching user:', userError)
      return NextResponse.json(
        { error: 'Failed to fetch user information' },
        { status: 500 }
      )
    }

    if (!userData) {
      return NextResponse.json({
        success: true,
        data: [],
        accountResults: [],
      })
    }

    const userId = userData.id
    console.log('✓ Resolved auth_id to user_id:', { authId, userId })

    // Get all connected accounts for the user
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('email_accounts')
      .select('id, grant_id, email, provider')
      .eq('user_id', userId)

    if (accountsError) {
      console.error('❌ Error fetching email_accounts:', accountsError)
      return NextResponse.json({
        success: true,
        data: [],
        accountResults: [],
      })
    }

    console.log(`📧 Found ${accounts?.length || 0} email accounts for user ${userId}`)

    if (!accounts || accounts.length === 0) {
      console.warn('⚠️ No email accounts found for user')
      return NextResponse.json({
        success: true,
        data: [],
        accountResults: [],
      })
    }

    const nylasApiKey = process.env.NYLAS_API_KEY
    const nylasApiUri = process.env.NYLAS_API_URI || 'https://api.us.nylas.com'

    if (!nylasApiKey) {
      return NextResponse.json(
        { error: 'NYLAS_API_KEY not configured' },
        { status: 500 }
      )
    }

    // Fetch folders from each account
    const allFolders = new Map<string, any>() // folderId -> folder with merged counts
    const accountResults = await Promise.all(
      accounts.map(async (account) => {
        try {
          const url = `${nylasApiUri}/v3/grants/${account.grant_id}/folders`
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${nylasApiKey}`,
              'Accept': 'application/json',
            },
          })

          if (!response.ok) {
            console.error(`Nylas API error for ${account.email}:`, response.status)
            return {
              accountId: account.id,
              email: account.email,
              grantId: account.grant_id,
              success: false,
              folders: [],
            }
          }

          const data = await response.json()
          const folders = data.data || []

          // Merge folder counts
          folders.forEach((folder: any) => {
            const folderId = String(folder.id).toUpperCase()
            if (allFolders.has(folderId)) {
              const existing = allFolders.get(folderId)
              existing.total_count += folder.total_count || 0
              existing.unread_count += folder.unread_count || 0
            } else {
              allFolders.set(folderId, {
                id: folder.id,
                name: folder.name,
                total_count: folder.total_count || 0,
                unread_count: folder.unread_count || 0,
                children: folder.children || [],
              })
            }
          })

          return {
            accountId: account.id,
            email: account.email,
            grantId: account.grant_id,
            success: true,
            folders: folders,
            count: folders.length,
          }
        } catch (error) {
          console.error(`Error fetching folders for ${account.email}:`, error)
          return {
            accountId: account.id,
            email: account.email,
            grantId: account.grant_id,
            success: false,
            error: String(error),
            folders: [],
          }
        }
      })
    )

    const mergedFolders = Array.from(allFolders.values())

    console.log('📊 All Folders Merged:', {
      totalAccounts: accounts.length,
      uniqueFolders: mergedFolders.length,
      folders: mergedFolders.map(f => ({ id: f.id, name: f.name, count: f.total_count })),
    })

    return NextResponse.json({
      success: true,
      data: mergedFolders,
      metadata: {
        totalAccounts: accounts.length,
        accountResults,
      },
    })
  } catch (error) {
    console.error('Error in GET /api/accounts/all-folders:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
