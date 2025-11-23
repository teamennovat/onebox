import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/accounts/folders-count
 * 
 * For each connected account, fetch folder counts from Nylas separately.
 * Then merge and sum counts by folder ID.
 * 
 * Example response:
 * {
 *   "data": [
 *     { "id": "INBOX", "name": "Inbox", "total_count": 1500, "unread_count": 45 },
 *     { "id": "SENT", "name": "Sent", "total_count": 800, "unread_count": 0 },
 *     ...
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    console.log('📁 Folders Count Request (Multi-Account):', { userId })

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
    }

    // Resolve auth_id to user_id
    let resolvedUserId = userId
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', userId)
      .single()

    if (!userError && userData) {
      resolvedUserId = userData.id
      console.log(`✓ Resolved auth_id "${userId}" → user_id: ${resolvedUserId}`)
    } else if (userError) {
      console.log(`⚠️ Could not resolve auth_id "${userId}", using as-is (assuming it's a user_id UUID)`)
    }

    // Get all connected accounts for this user
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('email_accounts')
      .select('id, grant_id, email, provider')
      .eq('user_id', resolvedUserId)

    if (accountsError || !accounts || accounts.length === 0) {
      console.log(`📁 No accounts found for user ${userId}`)
      return NextResponse.json({
        data: []
      })
    }

    console.log(`📁 Found ${accounts.length} connected accounts`)

    const nylasApiKey = process.env.NYLAS_API_KEY
    const nylasApiUri = process.env.NYLAS_API_URI || 'https://api.us.nylas.com'

    if (!nylasApiKey) {
      return NextResponse.json({ error: 'NYLAS_API_KEY not configured' }, { status: 500 })
    }

    // Step 1: Fetch folder counts from EACH account in parallel
    console.log(`🔄 Step 1: Fetching folder counts from ${accounts.length} accounts...`)
    console.log(`   User ID: ${resolvedUserId}`)
    console.log(`   Accounts:`, accounts.map(a => ({ email: a.email, grant: a.grant_id.substring(0, 15) + '...' })))
    
    const folderPromises = accounts.map(async (account) => {
      try {
        const encodedGrant = encodeURIComponent(account.grant_id)
        const url = `${nylasApiUri}/v3/grants/${encodedGrant}/folders`

        console.log(`  ▶ Fetching folders for ${account.email}...`)
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${nylasApiKey}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          console.warn(`  ✗ Failed to fetch folders for ${account.email}: ${response.status}`)
          return { account, folders: [] }
        }

        const data = await response.json()
        const folders = data.data || []

        console.log(`  ✓ ${account.email}: Got ${folders.length} folders`)
        folders.forEach((f: any) => {
          console.log(`    - ${f.name}: total=${f.total_count}, unread=${f.unread_count}`)
        })

        return { account, folders }
      } catch (error) {
        console.error(`  ✗ Error fetching folders for ${account.email}:`, error)
        return { account, folders: [] }
      }
    })

    const allResults = await Promise.all(folderPromises)

    // Step 2: Merge folder counts by folder ID
    console.log(`🔀 Merging folder counts across accounts...`)
    const folderMap = new Map<string, {
      id: string
      name: string
      total_count: number
      unread_count: number
      accountCounts: Array<{ email: string; total: number; unread: number }>
    }>()

    allResults.forEach(({ account, folders }) => {
      folders.forEach((folder: any) => {
        const folderId = String(folder.id)

        if (!folderMap.has(folderId)) {
          folderMap.set(folderId, {
            id: folder.id,
            name: folder.name,
            total_count: 0,
            unread_count: 0,
            accountCounts: []
          })
        }

        const existing = folderMap.get(folderId)!
        existing.total_count += (folder.total_count || 0)
        existing.unread_count += (folder.unread_count || 0)
        existing.accountCounts.push({
          email: account.email,
          total: folder.total_count || 0,
          unread: folder.unread_count || 0
        })

        console.log(`  + ${account.email} ${folder.name}: +${folder.total_count || 0} (→ ${existing.total_count} total)`)
      })
    })

    // Step 3: Convert map to array and return
    const mergedFolders = Array.from(folderMap.values()).map(f => ({
      id: f.id,
      name: f.name,
      total_count: f.total_count,
      unread_count: f.unread_count
    }))

    console.log(`📁 ════════════════════════════════════════════════════════`)
    console.log(`📁 Result: ${mergedFolders.length} folders merged from ${accounts.length} accounts`)
    console.log(`📁 User: ${resolvedUserId}`)
    console.log(`📁 Folder Summary:`, mergedFolders.map(f => `${f.name}(${f.total_count})`))
    console.log(`📁 First 3 folders:`, mergedFolders.slice(0, 3).map(f => ({ 
      id: f.id, 
      name: f.name, 
      total_count: f.total_count,
      unread_count: f.unread_count
    })))
    console.log(`📁 ════════════════════════════════════════════════════════`)

    return NextResponse.json({ data: mergedFolders })
  } catch (error) {
    console.error('Error in GET /api/accounts/folders-count:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
