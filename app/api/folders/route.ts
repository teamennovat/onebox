import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const grantId = searchParams.get('grantId')
  const userId = searchParams.get('userId')
  
  try {
    // Case 1: Single account folder fetch
    if (grantId && grantId !== '__all_accounts__' && grantId !== 'none') {
      const encodedGrant = encodeURIComponent(String(grantId))
      const url = `https://api.us.nylas.com/v3/grants/${encodedGrant}/folders`
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      })
      
      if (!response.ok) {
        console.warn(`Nylas error for grant ${grantId}: ${response.status}`)
        return NextResponse.json({
          data: [
            { id: 'INBOX', name: 'INBOX', total_count: 0, unread_count: 0 },
            { id: 'SENT', name: 'SENT', total_count: 0, unread_count: 0 },
            { id: 'DRAFT', name: 'DRAFT', total_count: 0, unread_count: 0 },
            { id: 'SPAM', name: 'SPAM', total_count: 0, unread_count: 0 },
            { id: 'TRASH', name: 'TRASH', total_count: 0, unread_count: 0 }
          ]
        })
      }
      
      const data = await response.json()
      console.log(`✓ Single account folders for grant ${grantId}:`, data.data?.map((f: any) => ({
        id: f.id,
        name: f.name,
        total_count: f.total_count,
        unread_count: f.unread_count
      })))
      return NextResponse.json(data)
    }
    
    // Case 2: All accounts - fetch folders with summed counts
    if (grantId === '__all_accounts__' && userId) {
      if (!supabaseAdmin) {
        return NextResponse.json(
          { error: 'Server not configured' },
          { status: 500 }
        )
      }
      
      console.log(`📁 All-Accounts: Resolving userId ${userId}...`)
      
      // First resolve auth_id to user_id if needed
      let resolvedUserId = userId
      const { data: userData, error: userError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('auth_id', userId)
        .single()
      
      if (!userError && userData) {
        resolvedUserId = userData.id
      }
      
      // Get all accounts for this user
      const { data: accounts, error: accountsError } = await supabaseAdmin
        .from('email_accounts')
        .select('id, grant_id, email, provider')
        .eq('user_id', resolvedUserId)
      
      if (accountsError || !accounts || accounts.length === 0) {
        console.log(`📁 No accounts found for user ${userId}`)
        return NextResponse.json({
          data: [
            { id: 'INBOX', name: 'INBOX', total_count: 0, unread_count: 0 },
            { id: 'SENT', name: 'SENT', total_count: 0, unread_count: 0 },
            { id: 'DRAFT', name: 'DRAFT', total_count: 0, unread_count: 0 },
            { id: 'SPAM', name: 'SPAM', total_count: 0, unread_count: 0 },
            { id: 'TRASH', name: 'TRASH', total_count: 0, unread_count: 0 }
          ]
        })
      }
      
      console.log(`📁 Fetching folders from ${accounts.length} accounts...`)
      const nylasApiKey = process.env.NYLAS_API_KEY
      
      if (!nylasApiKey) {
        return NextResponse.json(
          { error: 'NYLAS_API_KEY not configured' },
          { status: 500 }
        )
      }
      
      // Fetch folders from all accounts in parallel
      const folderPromises = accounts.map(async (account) => {
        try {
          const encoded = encodeURIComponent(account.grant_id)
          const url = `https://api.us.nylas.com/v3/grants/${encoded}/folders`
          const resp = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${nylasApiKey}`,
              'Accept': 'application/json'
            }
          })
          if (!resp.ok) {
            console.warn(`⚠️ Failed to fetch folders for ${account.email} (${account.grant_id}): ${resp.status}`)
            return []
          }
          const json = await resp.json()
          const folders = json.data || []
          console.log(`✓ ${account.email}: Got ${folders.length} folders (unread total: ${folders.reduce((sum: number, f: any) => sum + (f.unread_count || 0), 0)})`)
          return folders
        } catch (e) {
          console.error(`❌ Error fetching folders for ${account.email}:`, e)
          return []
        }
      })
      
      const allFolders = await Promise.all(folderPromises)
      
      // Sum counts by folder ID
      const folderMap = new Map<string, { name: string; total_count: number; unread_count: number }>()
      allFolders.forEach((folders, accountIndex) => {
        const account = accounts[accountIndex]
        folders.forEach((f: any) => {
          const id = f.id || f.name
          if (!folderMap.has(id)) {
            folderMap.set(id, { name: f.name, total_count: 0, unread_count: 0 })
          }
          const existing = folderMap.get(id)!
          const foldersTotal = f.total_count || 0
          const foldersUnread = f.unread_count || 0
          existing.total_count += foldersTotal
          existing.unread_count += foldersUnread
          console.log(`  + ${account.email}: ${f.name} → total:${foldersTotal} unread:${foldersUnread} (totals: ${existing.total_count}/${existing.unread_count})`)
        })
      })
      
      const mergedFolders = Array.from(folderMap.entries()).map(([id, data]) => ({
        id,
        name: data.name,
        total_count: data.total_count,
        unread_count: data.unread_count
      }))
      
      const totalUnread = mergedFolders.reduce((sum, f) => sum + f.unread_count, 0)
      console.log(`📁 Merged: ${mergedFolders.length} folders | Total unread: ${totalUnread} | From ${accounts.length} accounts`)
      return NextResponse.json({ data: mergedFolders })
    }
    
    // Default case
    return NextResponse.json({
      data: [
        { id: 'INBOX', name: 'INBOX', total_count: 0, unread_count: 0 },
        { id: 'SENT', name: 'SENT', total_count: 0, unread_count: 0 },
        { id: 'DRAFT', name: 'DRAFT', total_count: 0, unread_count: 0 },
        { id: 'SPAM', name: 'SPAM', total_count: 0, unread_count: 0 },
        { id: 'TRASH', name: 'TRASH', total_count: 0, unread_count: 0 }
      ]
    })
  } catch (error) {
    console.error('Error fetching folders:', error)
    return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 })
  }
}
