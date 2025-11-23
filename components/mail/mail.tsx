"use client"

import * as React from "react"
import {
  AlertCircle,
  Archive,
  ArchiveX,
  File,
  Inbox,
  Tag,
  MessagesSquare,
  Search,
  Send,
  ShoppingCart,
  Star,
  Trash2,
  Users2,
  X,
} from "lucide-react"

import { MailListSkeleton } from "./mail-list-skeleton"
import { FoldersSkeleton } from "./folders-skeleton"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Separator } from "@/components/ui/separator"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AccountSwitcher } from "./account-switcher"
import { MailDisplay } from "./mail-display"
import { MailList } from "./mail-list"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Nav } from "./nav"
import { NoAccountMessage } from "./no-account-message"
import { type Mail } from "./use-mail"
import { useMail } from "./use-mail"
import { FilterSheet, type EmailFilters } from "./filter-sheet"
import { CustomLabels } from "./custom-labels"
import { MailHeader } from "./mail-header"
import { MailSearchBar } from "./mail-search-bar"
import { MailListSection } from "./mail-list-section"
import { createBrowserClient } from "@supabase/ssr"

interface MailProps {
  accounts: {
    label: string
    email: string
    icon: React.ReactNode
    grantId: string
  }[]
  defaultLayout: number[] | undefined
  defaultCollapsed?: boolean
  navCollapsedSize: number
  mails?: Mail[]
}

export function Mail({
  accounts,
  mails,
  defaultLayout = [18, 30, 52],
  defaultCollapsed = false,
  navCollapsedSize,
}: MailProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed)
  const [screenSize, setScreenSize] = React.useState<'mobile' | 'tablet' | 'desktop' | 'large'>('desktop')
  const [mail] = useMail()
  const [fetchedMails, setFetchedMails] = React.useState<Mail[]>([])
  const [loading, setLoading] = React.useState(false)
  const [currentGrantId, setCurrentGrantId] = React.useState<string>()
  const [sidebarFolders, setSidebarFolders] = React.useState<any[]>([])
  const [sidebarLoading, setSidebarLoading] = React.useState(false)
  const [initialSidebarLoad, setInitialSidebarLoad] = React.useState(true)
  const [mailboxType, setMailboxType] = React.useState<string>('INBOX')
  const [dateFilterFrom, setDateFilterFrom] = React.useState<number | null>(null)
  const [dateFilterTo, setDateFilterTo] = React.useState<number | null>(null)
  const [filters, setFilters] = React.useState<EmailFilters>({})
  const [searchText, setSearchText] = React.useState<string>('')
  const [isFilterOpen, setIsFilterOpen] = React.useState(false)
  const [fetchedNextCursor, setFetchedNextCursor] = React.useState<string | null>(null)
  const [fetchedHasMore, setFetchedHasMore] = React.useState<boolean>(true)
  const [forwardEmail, setForwardEmail] = React.useState<{ subject: string; body: string; attachments: Array<{ filename: string; content_type: string; size: number; id: string }> } | null>(null)
  const [draftToEdit, setDraftToEdit] = React.useState<any | null>(null)
  const [isComposeOpen, setIsComposeOpen] = React.useState(false)
  const [showLabeledEmails, setShowLabeledEmails] = React.useState(false)
  const [currentEmailAccountId, setCurrentEmailAccountId] = React.useState<string>('')
  const [selectedLabelData, setSelectedLabelData] = React.useState<{ labelId: string; labelName: string; labelColor: string; emails: any[] } | null>(null)
  const [labelLoadingId, setLabelLoadingId] = React.useState<string | null>(null)
  const [labelCountRefreshTrigger, setLabelCountRefreshTrigger] = React.useState(0)
  const [isEmailDetailOpen, setIsEmailDetailOpen] = React.useState(false)
  const [selectedEmailForSheet, setSelectedEmailForSheet] = React.useState<Mail | null>(null)
  const [currentBatch, setCurrentBatch] = React.useState(0)
  const [isPreloadingNextBatch, setIsPreloadingNextBatch] = React.useState(false)
  // State for all-accounts pagination
  const [allAccountsPage, setAllAccountsPage] = React.useState(0)
  
  // Track screen size for responsive layout
  React.useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      if (width <= 425) {
        setScreenSize('mobile')
      } else if (width <= 764) {
        setScreenSize('tablet')
      } else if (width <= 1024) {
        setScreenSize('tablet')
      } else if (width >= 2560) {
        setScreenSize('large')
      } else {
        setScreenSize('desktop')
      }
    }
    
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  // Determine responsive layout
  const getResponsiveLayout = () => {
    switch (screenSize) {
      case 'large': // 2560px+
        return [10, 20, 70]
      case 'desktop': // 1024px - 2560px
        return [18, 30, 52]
      case 'tablet': // 425px - 1024px
        return [20, 80, 0] // Left sidebar visible but narrow, middle takes most, right hidden
      case 'mobile': // < 425px
        return [5, 95, 0] // Left completely hidden (drawer only), middle takes all, right hidden
      default:
        return [18, 30, 52]
    }
  }
  
  const responsiveLayout = getResponsiveLayout()
  const lastFolderChangeRef = React.useRef<{ grantId: string; folder: string } | null>(null)
  // Track current search query to detect search changes
  const currentSearchRef = React.useRef<string>('')
  // Track in-flight requests by key to prevent duplicates
  const inFlightRequestsRef = React.useRef<Map<string, Promise<any>>>(new Map())
  // Track account change to prevent re-running effect when callbacks change
  const lastProcessedGrantIdRef = React.useRef<string | undefined>(undefined)
  // Track if we're in account change to skip filters effect
  const isAccountChangeInProgressRef = React.useRef(false)
  // Track previous filters to detect actual changes (not just re-renders)
  const prevFiltersRef = React.useRef<EmailFilters | null>(null)
  
  // Debug: Log fetchedMails whenever it changes
  React.useEffect(() => {
    console.log('📨 fetchedMails updated:', {
      count: fetchedMails.length,
      data: fetchedMails.slice(0, 2) // Show first 2 for debugging
    })
  }, [fetchedMails])

  // Debug: Log loading state changes
  React.useEffect(() => {
    console.log('🔄 loading state changed:', loading)
  }, [loading])
  
  // Handle search - ONLY on Enter key or explicit button click, NOT on typing
  const handleSearchChange = React.useCallback((newSearchText: string) => {
    setSearchText(newSearchText)
    // Just update state - do NOT trigger fetch automatically
  }, [])

  const handleSearchClear = React.useCallback(() => {
    // Clear search and restore normal email list
    setSearchText('')
    currentSearchRef.current = ''
    setFetchedNextCursor(null)
    setFetchedHasMore(true)
    // Refetch without search filter
    if (currentGrantId && mailboxType) {
      fetchEmails(currentGrantId, mailboxType, filters)
    }
  }, [currentGrantId, mailboxType, filters])

  const handleSearchSubmit = React.useCallback(() => {
    // User pressed Enter or clicked search button
    // Prevent duplicate search requests
    if (!searchText || currentSearchRef.current === searchText) {
      return
    }
    
    if (currentGrantId && mailboxType) {
      console.log('🔎 SEARCH SUBMITTED:', { searchText, grantId: currentGrantId, isAllAccounts: currentGrantId === '__all_accounts__' })
      currentSearchRef.current = searchText
      setFetchedNextCursor(null)
      setFetchedHasMore(true)
      setAllAccountsPage(0) // Reset page for new search
      
      // Create temporary filters with ONLY search_query_native
      // This overrides all other filters per Nylas API constraint
      const searchOnlyFilters: EmailFilters = {
        search_query_native: searchText
      }
      
      // For all-accounts mode, use the search endpoint; otherwise use fetchEmails
      if (currentGrantId === '__all_accounts__') {
        performAllAccountsSearch(searchOnlyFilters, 0)
      } else {
        fetchEmails(currentGrantId, mailboxType, searchOnlyFilters)
      }
    }
  }, [currentGrantId, mailboxType, searchText, filters])

  // All-accounts search function
  const performAllAccountsSearch = React.useCallback(async (filterObj: EmailFilters, page: number = 0) => {
    try {
      setLoading(true)

      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session?.user?.id) {
        console.error('Failed to get auth session:', sessionError)
        setLoading(false)
        throw new Error('Not authenticated')
      }

      const params = new URLSearchParams()
      params.set('userId', session.user.id)
      params.set('searchQuery', filterObj.search_query_native || '')
      params.set('filters', JSON.stringify(filterObj))
      params.set('page', String(page))

      const response = await fetch(`/api/accounts/search?${params.toString()}`)

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '<no body>')
        console.error('Failed to search all accounts:', {
          status: response.status,
          body: bodyText,
        })
        throw new Error(`Failed to search emails: ${response.status}`)
      }

      const data = await response.json()
      const emails = data.data || []

      // Transform emails to Mail format
      function stripHtml(input: string) {
        if (!input) return ""
        return input
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim()
      }

      const transformedMails = emails.map((msg: any) => ({
        id: msg.id,
        name: msg.from?.[0]?.name || msg.from?.[0]?.email || 'Unknown',
        email: msg.from?.[0]?.email || '',
        subject: msg.subject || '(No subject)',
        text: msg.html || msg.body || stripHtml(msg.body) || msg.snippet || '',
        html: msg.html || msg.body || undefined,
        thread_id: msg.thread_id || undefined,
        reply_to_message_id: msg.reply_to_message_id || undefined,
        attachments: msg.attachments || [],
        date: new Date(msg.date * 1000).toISOString(),
        read: !msg.unread,
        labels: msg.folders || ['inbox'],
        accountEmail: msg.accountEmail,
        accountProvider: msg.accountProvider,
        emailAccountId: msg.emailAccountId,
        grantId: msg.grantId,
      }))

      console.log('📨 All-Accounts Search Results:', {
        searchQuery: filterObj.search_query_native,
        totalFound: data.metadata?.totalCount,
        pageCount: transformedMails.length,
        hasMore: data.metadata?.hasMore,
      })

      if (page === 0) {
        setFetchedMails(transformedMails)
      } else {
        setFetchedMails(prev => [...prev, ...transformedMails])
      }

      setFetchedHasMore(data.metadata?.hasMore || false)
      setLoading(false)
    } catch (error) {
      console.error('Error searching all accounts:', error)
      setLoading(false)
      throw error
    }
  }, [])

  // REMOVED: prefetchMultiplePages function
  // Reason: Caused excessive looping (pages 0,1,2,3 fetched immediately)
  // NEW APPROACH: Only fetch page 0 on load, then page 1 at 50% threshold
  // This is now handled by mail-list.tsx checkAndPrefetch()

  // Fetch emails from all connected accounts with smart proportional distribution
  const fetchAllAccountsEmails = React.useCallback(async (page: number = 0, batchIndex: number = 0, isLoadMore: boolean = false) => {
    try {
      if (!isLoadMore) {
        setLoading(true)
      }

      // Get current auth user to pass userId
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session?.user?.id) {
        console.error('Failed to get auth session:', sessionError)
        setLoading(false)
        throw new Error('Not authenticated')
      }

      const params = new URLSearchParams()
      params.set('userId', session.user.id)
      params.set('page', String(page))
      params.set('batchIndex', String(batchIndex))

      const response = await fetch(`/api/accounts/all-emails?${params.toString()}`)

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '<no body>')
        console.error('Failed to fetch all accounts emails:', {
          status: response.status,
          body: bodyText,
        })
        throw new Error(`Failed to fetch emails: ${response.status}`)
      }

      const data = await response.json()
      const emails = data.data || []

      // Transform emails to Mail format
      function stripHtml(input: string) {
        if (!input) return ""
        return input
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim()
      }

      const transformedMails = emails.map((msg: any) => ({
        id: msg.id,
        name: msg.from?.[0]?.name || msg.from?.[0]?.email || 'Unknown',
        email: msg.from?.[0]?.email || '',
        subject: msg.subject || '(No subject)',
        text: msg.html || msg.body || stripHtml(msg.body) || msg.snippet || '',
        html: msg.html || msg.body || undefined,
        thread_id: msg.thread_id || undefined,
        reply_to_message_id: msg.reply_to_message_id || undefined,
        attachments: msg.attachments || [],
        date: new Date(msg.date * 1000).toISOString(),
        read: !msg.unread,
        labels: msg.folders || ['inbox'],
        // Account info for UI badges
        accountEmail: msg.accountEmail,
        accountProvider: msg.accountProvider,
        emailAccountId: msg.emailAccountId,
        grantId: msg.grantId,
      }))

      console.log('📧 All Accounts Emails:', {
        page,
        batchIndex,
        totalEmails: data.metadata?.totalCount,
        paginatedCount: transformedMails.length,
        hasMore: data.metadata?.hasMore,
      })

      // If page === 0, replace the list; otherwise append
      if (page === 0) {
        setFetchedMails(transformedMails)
      } else {
        setFetchedMails(prev => [...prev, ...transformedMails])
      }

      setFetchedHasMore(data.metadata?.hasMore || false)
      if (!isLoadMore) {
        setLoading(false)
      }

      // Return metadata for pagination logic
      return {
        totalFetched: transformedMails.length,
        hasMore: data.metadata?.hasMore,
        nextPage: page + 1,
        nextBatchIndex: batchIndex,
      }
    } catch (error) {
      console.error('Error fetching all accounts emails:', error)
      if (!isLoadMore) {
        setLoading(false)
      }
      throw error
    }
  }, [])

  // Fetch emails from a specific folder across all accounts using expandable time windows
  const fetchAllAccountsEmailsByFolder = React.useCallback(async (folderId: string = 'INBOX', page: number = 0, isLoadMore: boolean = false) => {
    try {
      if (!isLoadMore) {
        setLoading(true)
      }

      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session?.user?.id) {
        console.error('Failed to get auth session:', sessionError)
        setLoading(false)
        throw new Error('Not authenticated')
      }

      const params = new URLSearchParams()
      params.set('userId', session.user.id)
      params.set('folderId', folderId)
      params.set('page', String(page))

      const response = await fetch(`/api/accounts/all-emails-by-folder?${params.toString()}`)

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '<no body>')
        console.error('Failed to fetch all accounts emails by folder:', {
          status: response.status,
          body: bodyText,
        })
        throw new Error(`Failed to fetch emails: ${response.status}`)
      }

      const data = await response.json()
      const emails = data.data || []

      function stripHtml(input: string) {
        if (!input) return ""
        return input
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim()
      }

      const transformedMails = emails.map((msg: any) => ({
        id: msg.id,
        name: msg.from?.[0]?.name || msg.from?.[0]?.email || 'Unknown',
        email: msg.from?.[0]?.email || '',
        subject: msg.subject || '(No subject)',
        text: msg.html || msg.body || stripHtml(msg.body) || msg.snippet || '',
        html: msg.html || msg.body || undefined,
        thread_id: msg.thread_id || undefined,
        reply_to_message_id: msg.reply_to_message_id || undefined,
        attachments: msg.attachments || [],
        date: new Date(msg.date * 1000).toISOString(),
        read: !msg.unread,
        labels: msg.folders || ['inbox'],
        accountEmail: msg.accountEmail,
        accountProvider: msg.accountProvider,
        emailAccountId: msg.emailAccountId,
        grantId: msg.grantId,
      }))

      console.log('📂 All Accounts Emails By Folder:', {
        folderId,
        page,
        totalEmails: data.metadata?.totalCount,
        paginatedCount: transformedMails.length,
        hasMore: data.metadata?.hasMore,
      })

      if (page === 0) {
        setFetchedMails(transformedMails)
      } else {
        setFetchedMails(prev => [...prev, ...transformedMails])
      }

      setFetchedHasMore(data.metadata?.hasMore || false)
      if (!isLoadMore) {
        setLoading(false)
      }

      return {
        totalFetched: transformedMails.length,
        hasMore: data.metadata?.hasMore,
        nextPage: page + 1,
      }
    } catch (error) {
      console.error('Error fetching all accounts emails by folder:', error)
      if (!isLoadMore) {
        setLoading(false)
      }
      throw error
    }
  }, [])

  const fetchEmails = React.useCallback(async (grantId: string, folderId?: string, suppliedFilters?: EmailFilters, pageToken?: string | null) => {
    if (!grantId || grantId === 'none') {
      // clear if 'none' selected
      setCurrentGrantId(undefined)
      setFetchedMails([])
      setFetchedNextCursor(null)
      setFetchedHasMore(false)
      return
    }

    // Handle All Accounts mode - always start from batch 0
    if (grantId === '__all_accounts__') {
      // Route to folder-specific endpoint if a specific folder is requested
      if (folderId) {
        return fetchAllAccountsEmailsByFolder(folderId, 0, false)
      }
      // Otherwise use default all-emails endpoint (defaults to INBOX)
      return fetchAllAccountsEmails(0, 0, false)
    }
    
    // Prevent duplicate concurrent fetches with intelligent deduplication
    // For pagination (pageToken), always allow (different slice of data)
    // For folder/filter changes, prevent concurrent duplicates
    const key = `${grantId}:${folderId ?? ''}:${suppliedFilters?.search_query_native || ''}`
    
    if (!pageToken) {
      // Check if identical request is already in flight
      const existingRequest = inFlightRequestsRef.current.get(key)
      if (existingRequest) {
        console.log('⏭️ DEDUPE: Skipping duplicate request', { key })
        return existingRequest // Return existing promise
      }
    }
    
    // Only set currentGrantId once to avoid triggering dependent effects
    setCurrentGrantId(prev => prev === grantId ? prev : grantId)
    if (!pageToken) {
      setLoading(true)
    }
    
    // Create promise for this request
    const requestPromise = (async () => {
    try {
      // Check if this is a draft folder fetch - use drafts API instead
      const isDraftFolder = folderId && String(folderId).toUpperCase() === 'DRAFT'
      let response
      if (isDraftFolder) {
        // Use drafts endpoint for DRAFT folder
        const draftParams = new URLSearchParams()
        draftParams.set('grantId', grantId)
        draftParams.set('limit', '200')
        
        console.log('='.repeat(80))
        console.log('📋 FETCHING DRAFTS')
        console.log('='.repeat(80))
        console.log('Draft Fetch Params:', {
          grantId,
          limit: '200'
        })
        console.log('='.repeat(80))
        
        response = await fetch(`/api/messages/draft?${draftParams.toString()}`)
      } else {
        // Use messages endpoint for other folders
        const params = new URLSearchParams()
        params.set('grantId', grantId)
        // request up to 200 messages from provider (we page in chunks client-side)
        params.set('limit', '200')
        
        // Add page_token for pagination (pagination with same search query)
        if (pageToken) {
          params.set('page_token', pageToken)
        } else {
          // Only add folder if NOT paginating (pagination keeps same folder context)
          if (folderId) params.set('in', String(folderId).toUpperCase()) // Use exact folder ID case for v3 API
        }
        
        // include filters when provided
        const f = suppliedFilters ?? filters
        if (f) {
          // IMPORTANT: If search_query_native is set, Nylas only allows limit and page_token as other params
          // If search_query_native is used, DO NOT include other filter parameters
          if (f.search_query_native) {
            // When using search_query_native, ONLY add search and pagination params
            params.set('search_query_native', String(f.search_query_native))
          } else {
            // Only use other filters if NOT using advanced search
            if (f.any_email) params.set('any_email', String(f.any_email))
            if (f.to) params.set('to', String(f.to))
            if (f.from) params.set('from', String(f.from))
            if (f.cc) params.set('cc', String(f.cc))
            if (f.bcc) params.set('bcc', String(f.bcc))
            // Only add boolean filters if they are true
            if (f.unread === true) params.set('unread', 'true')
            if (f.has_attachment === true) params.set('has_attachment', 'true')
            // Only add date filters if they have valid timestamps
            if (f.received_after && f.received_after > 0) params.set('received_after', String(f.received_after))
            if (f.received_before && f.received_before > 0) params.set('received_before', String(f.received_before))
          }
        }
        // NOTE: searchText is now only used in Advanced Search field (search_query_native)
        // Do NOT add it separately to params - it's handled above via search_query_native

        response = await fetch(`/api/messages?${params.toString()}`)
      }
      
      if (!response.ok) {
        // Try to read response body for better debugging
        let bodyText = ''
        try {
          bodyText = await response.text()
          console.error('Fetch messages/drafts failed', { 
            status: response.status, 
            body: bodyText,
            grantId,
            folderId,
            isDraftFolder,
            url: response.url
          })
        } catch (e) {
          console.error('Failed to read error response', e)
          bodyText = '<unreadable response body>'
        }
        throw new Error(`Failed to fetch messages: status=${response.status} body=${bodyText}`)
      }
  const data = await response.json()
      // Transform Nylas messages to our Mail format
      function stripHtml(input: string) {
        if (!input) return ""
        // remove script/style tags and all html tags — simple sanitizer for preview
        return input
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim()
      }

      // Get the emails array from response (drafts API returns {drafts: []}, messages API returns {data: []})
      const emailsArray = isDraftFolder ? (data.drafts || []) : (data.data || [])
      
      const transformedMails = emailsArray.map((msg: any) => ({
        id: msg.id,
        name: msg.from?.[0]?.name || msg.from?.[0]?.email || 'Unknown',
        email: msg.from?.[0]?.email || '',
        subject: msg.subject || '(No subject)',
        // Store full body in both text and html to ensure full content is displayed
        text: msg.html || msg.body || stripHtml(msg.body) || msg.snippet || '',
        // include raw html when provided so MailDisplay can render it with full content
        html: msg.html || msg.body || undefined,
        thread_id: msg.thread_id || undefined,
        reply_to_message_id: msg.reply_to_message_id || undefined,
        attachments: msg.attachments || [],
        // Convert Unix timestamp to ISO string for display
        date: new Date(msg.date * 1000).toISOString(),
        read: !msg.unread,
        labels: msg.folders || ['inbox'],
        emailAccountId: currentEmailAccountId // Add email account ID for RLS
      }))
      
      console.log('🔍 TRANSFORM DEBUG:', {
        rawCount: emailsArray.length,
        transformedCount: transformedMails.length,
        firstEmail: transformedMails[0] ? {
          id: transformedMails[0].id,
          subject: transformedMails[0].subject,
          from: transformedMails[0].email
        } : null
      })
      
      // Log fetched emails with thread information
      console.log('='.repeat(80))
      console.log(isDraftFolder ? '📋 DRAFTS FETCH SUCCESS' : '📬 EMAIL LIST FETCH SUCCESS')
      console.log('='.repeat(80))
      console.log('Emails Loaded:', {
        count: transformedMails.length,
        grantId,
        folderId: folderId || 'INBOX',
        timestamp: new Date().toISOString()
      })
      console.log('📧 Emails with Thread IDs:')
      transformedMails.forEach((mail: any, index: number) => {
        console.log(`  ${index + 1}. [${mail.id}]`, {
          subject: mail.subject.substring(0, 50) + (mail.subject.length > 50 ? '...' : ''),
          from: mail.email,
          threadId: mail.thread_id || 'NO_THREAD',
          hasAttachments: mail.attachments?.length > 0,
          isRead: mail.read,
          date: new Date(mail.date).toLocaleString()
        })
      })
      console.log('='.repeat(80))
      
      // If paginating (pageToken provided), APPEND new results. Otherwise REPLACE.
      if (pageToken) {
        console.log('📄 PAGINATION MODE: Appending results')
        setFetchedMails(prev => {
          const updated = [...prev, ...transformedMails]
          console.log('📄 setFetchedMails called (append)', { prevCount: prev.length, addedCount: transformedMails.length, newCount: updated.length })
          return updated
        })
      } else {
        console.log('📄 INITIAL FETCH MODE: Replacing results')
        setFetchedMails(transformedMails)
      }
      
      // store provider pagination tokens for MailList to use for prefetch
      const next = data.next_cursor || data.nextCursor || null
      setFetchedNextCursor(next)
      setFetchedHasMore(Boolean(next))
    } catch (error) {
      console.error('Error fetching messages:', error)
      if (!pageToken) {
        setFetchedMails([])
      }
    } finally {
      if (!pageToken) {
        setLoading(false)
        // Remove from in-flight tracking after completion
        inFlightRequestsRef.current.delete(key)
      }
    }
    })()
    
    // Store request if not pagination
    if (!pageToken) {
      inFlightRequestsRef.current.set(key, requestPromise)
    }
    
    return requestPromise
  }, [])

  const [activeTab, setActiveTab] = React.useState<string>('all')

  // Fetch folders for sidebar counts when grant changes or a message is moved
  const fetchFolders = React.useCallback(async (isBackgroundRefresh = true) => {
    if (!currentGrantId) {
      setSidebarFolders([])
      return
    }
    
    // Only show loading state on initial load, NOT on background refreshes
    if (initialSidebarLoad && !isBackgroundRefresh) {
      setSidebarLoading(true)
    }
    // Implement a small retry/backoff for transient 5xx errors from provider
    const maxAttempts = 3
    let attempt = 0
    let lastErr: any = null
    while (attempt < maxAttempts) {
      attempt += 1
      try {
        let foldersUrl = ''
        if (currentGrantId === "__all_accounts__") {
          // For all-accounts, we need to get userId from session
          const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
          )
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          if (sessionError || !session?.user?.id) {
            throw new Error('Not authenticated')
          }
          foldersUrl = `/api/accounts/all-folders?userId=${encodeURIComponent(session.user.id)}`
        } else {
          foldersUrl = `/api/folders?grantId=${currentGrantId}`
        }
        
        const res = await fetch(foldersUrl)
        if (!res.ok) {
          const text = await res.text().catch(() => 'Failed to read error response')
          console.error('Failed to fetch folders:', {
            status: res.status,
            body: text,
            grantId: currentGrantId
          })
          // For client-side display/debugging, throw and allow retry for 5xx
          const err = new Error(`Failed to fetch folders: ${res.status} ${text}`)
          ;(err as any).status = res.status
          throw err
        }
        const data = await res.json()
      
      // Ensure we have all system folders with at least 0 count
      const systemFolders = ['INBOX', 'SENT', 'IMPORTANT', 'DRAFT', 'SPAM', 'TRASH', 'STARRED']
      const folders = Array.isArray(data.data) ? data.data : []
      
      // Add missing system folders with 0 count
      const normalizedFolders = [...folders]
      systemFolders.forEach(folderId => {
        if (!normalizedFolders.some(f => String(f.id).toUpperCase() === folderId)) {
          normalizedFolders.push({
            id: folderId,
            name: folderId.charAt(0) + folderId.slice(1).toLowerCase(),
            total_count: 0,
            unread_count: 0,
            system_folder: true
          })
        }
      })
      
        setSidebarFolders(normalizedFolders)
        lastErr = null
        break
      } catch (e: any) {
        lastErr = e
        // If client error (4xx) don't retry
        const status = (e && e.status) || 0
        if (status >= 400 && status < 500) break
        // else wait and retry (exponential backoff)
        const waitMs = 200 * Math.pow(2, attempt - 1)
        // If the grant changed during retries, abort
        if (!currentGrantId) break
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, waitMs))
      }
    }
    if (lastErr) {
      console.error('Folder fetch error:', lastErr)
      // Keep existing folders on error to prevent UI flicker
      setSidebarFolders(prev => prev.length ? prev : [])
    }
    setSidebarLoading(false)
    setInitialSidebarLoad(false)
  }, [currentGrantId])

  // Optimistic sidebar updater: adjust counts immediately when a message is moved locally
  const handleFolderChange = React.useCallback(async (opts?: { from?: string | null; to?: string | null }) => {
    if (!opts) {
      // If no opts provided, just refresh from server in background
      void fetchFolders()
      return
    }

    const fromId = opts.from ? String(opts.from).toUpperCase() : undefined
    const toId = opts.to ? String(opts.to).toUpperCase() : undefined

    setSidebarFolders((prev) => {
      // make a shallow copy and update counts
      const clone = (prev || []).map((f: any) => ({ ...f }))

      if (fromId) {
        const ix = clone.findIndex((f: any) => String(f.id).toUpperCase() === fromId)
        if (ix >= 0) {
          clone[ix].total_count = Math.max(0, Number(clone[ix].total_count || 0) - 1)
        }
      }

      if (toId) {
        const ix2 = clone.findIndex((f: any) => String(f.id).toUpperCase() === toId)
        if (ix2 >= 0) {
          clone[ix2].total_count = Number(clone[ix2].total_count || 0) + 1
        } else {
          // Add a minimal entry so the sidebar shows the folder immediately (e.g., ARCHIVE)
          clone.push({ id: toId, name: toId, total_count: 1, unread_count: 0, system_folder: toId === 'ARCHIVE' })
        }
      }

      return clone
    })

    // Refresh authoritative folder list in background (do not await)
    // Pass true to indicate this is a background refresh, not initial load
    void fetchFolders(true)
  }, [fetchFolders])

  const handleLabelChange = React.useCallback((data: { messageId: string; oldLabelId: string | null; newLabelId: string | null }) => {
    const { messageId, oldLabelId, newLabelId } = data

    console.log(`🏷️ Label changed in mail list:`, { messageId, oldLabelId, newLabelId })

    // If we're viewing a specific label's email list, update it
    if (selectedLabelData) {
      setSelectedLabelData((prev) => {
        if (!prev) return prev

        return {
          ...prev,
          emails: prev.emails.filter((email: Mail) => {
            // Remove email from current label list if the old label was this label
            if (oldLabelId === prev.labelId && newLabelId !== prev.labelId) {
              return email.id !== messageId
            }
            return true
          }),
        }
      })
    }

    // Trigger label count refresh to update sidebar counts
    setLabelCountRefreshTrigger((prev) => prev + 1)
  }, [selectedLabelData])

  // Refresh handler for folder emails
  const handleRefreshFolderEmails = React.useCallback(async () => {
    if (!currentGrantId || !mailboxType) {
      return
    }
    
    // Reset pagination and refetch from Nylas
    setFetchedMails([])
    setFetchedNextCursor(null)
    setFetchedHasMore(true)
    await fetchEmails(currentGrantId, mailboxType, filters, null)
  }, [currentGrantId, mailboxType, filters, fetchEmails])

  // Refresh handler for labeled emails
  const handleRefreshLabeledEmails = React.useCallback(async () => {
    if (!selectedLabelData || !currentGrantId || !currentEmailAccountId) {
      return
    }

    try {
      const response = await fetch(
        `/api/labels/${selectedLabelData.labelId}/emails?grantId=${encodeURIComponent(currentGrantId)}&emailAccountId=${encodeURIComponent(currentEmailAccountId)}`,
        {
          method: 'GET',
          credentials: 'include',
        }
      )

      const result = await response.json()
      const { data, success } = result

      if (!success) {
        console.error('Error refreshing labeled emails:', result.error)
        return
      }

      // Map data to Mail format and update state
      const emails = (data || []).map((item: any) => ({
        id: item.message_id,
        name: item.mail_details?.from?.[0]?.name || item.mail_details?.from?.[0]?.email || 'Unknown',
        email: item.mail_details?.from?.[0]?.email || '',
        subject: item.mail_details?.subject || '(No subject)',
        text: item.mail_details?.body || item.mail_details?.snippet || '',
        html: item.mail_details?.html,
        body: item.mail_details?.body,
        thread_id: item.mail_details?.thread_id,
        from: item.mail_details?.from,
        to: item.mail_details?.to,
        cc: item.mail_details?.cc,
        bcc: item.mail_details?.bcc,
        reply_to: item.mail_details?.reply_to,
        attachments: item.mail_details?.attachments || [],
        date: (() => {
          const dateValue = item.mail_details?.date;
          if (!dateValue) return new Date().toISOString();
          if (typeof dateValue === 'string') return dateValue;
          if (typeof dateValue === 'number') return new Date(dateValue * 1000).toISOString();
          return new Date().toISOString();
        })(),
        read: !item.mail_details?.unread,
        labels: [selectedLabelData.labelName],
        grant_id: item.mail_details?.grant_id || currentGrantId,
        labelId: selectedLabelData.labelId,
        emailAccountId: currentEmailAccountId,
        mailDetails: item.mail_details,
      }))

      setSelectedLabelData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          emails: emails
        }
      })

      // Refresh label counts
      setLabelCountRefreshTrigger(prev => prev + 1)
    } catch (error) {
      console.error('Error in handleRefreshLabeledEmails:', error)
    }
  }, [selectedLabelData, currentGrantId, currentEmailAccountId])

  // When account changes: (1) reset state, (2) fetch folders, (3) then fetch emails for INBOX
  React.useEffect(() => {
    // Only process if this is a NEW account change (not just a callback update)
    if (lastProcessedGrantIdRef.current === currentGrantId) {
      return
    }
    lastProcessedGrantIdRef.current = currentGrantId

    if (!currentGrantId) {
      // Account deselected
      isAccountChangeInProgressRef.current = true
      setFetchedMails([])
      setSidebarFolders([])
      setInitialSidebarLoad(true)
      currentSearchRef.current = ''
      isAccountChangeInProgressRef.current = false
    } else if (currentGrantId === "__all_accounts__") {
      // All Accounts mode - fetch ONLY page 0 initially
      // Page 1+ will load when user reaches 50% threshold (handled by mail-list.tsx)
      isAccountChangeInProgressRef.current = true
      setFetchedMails([])
      setSidebarFolders([])
      setInitialSidebarLoad(true)
      setMailboxType('INBOX')
      setFilters({})
      setSearchText('')
      currentSearchRef.current = ''
      setFetchedNextCursor(null)
      setFetchedHasMore(true)
      setCurrentBatch(0)
      setIsPreloadingNextBatch(false)
      setAllAccountsPage(0)
      
      // Fetch ONLY page 0 (200 emails) - no prefetching of pages 1,2,3
      setTimeout(() => {
        if (currentGrantId === "__all_accounts__") {
          isAccountChangeInProgressRef.current = false
          // Single fetch: page 0 only
          void fetchAllAccountsEmailsByFolder('INBOX', 0, false)
        }
      }, 150)
    } else {
      // Account selected (single account)
      isAccountChangeInProgressRef.current = true
      
      // Serialize: fetch folders FIRST, then emails
      // This prevents concurrent requests to different endpoints that cause rate limiting
      fetchFolders().then(() => {
        // After folders complete, fetch inbox emails
        // Use small delay to ensure folders response is fully processed
        setTimeout(() => {
          // Only fetch if still the same account (prevent race conditions)
          if (currentGrantId && currentGrantId !== "__all_accounts__") {
            setMailboxType('INBOX') // Now set mailboxType
            setFilters({}) // Now set filters to empty
            setSearchText('') // Reset search
            currentSearchRef.current = ''
            setFetchedNextCursor(null)
            setFetchedHasMore(true)
            isAccountChangeInProgressRef.current = false
            fetchEmails(currentGrantId, 'INBOX')
          }
        }, 150)
      }).catch((err) => {
        console.error('Failed to fetch folders:', err)
        // Even if folders fail, try to fetch emails
        setTimeout(() => {
          if (currentGrantId && currentGrantId !== "__all_accounts__") {
            setMailboxType('INBOX')
            setFilters({})
            setSearchText('')
            currentSearchRef.current = ''
            setFetchedNextCursor(null)
            setFetchedHasMore(true)
            isAccountChangeInProgressRef.current = false
            fetchEmails(currentGrantId, 'INBOX')
          }
        }, 150)
      })
    }
  }, [currentGrantId])
  
  // Refetch emails ONLY when filter VALUES change (not when mailboxType or grant changes)
  // The account change effect and mailbox change handlers already call fetchEmails
  React.useEffect(() => {
    if (!currentGrantId || !mailboxType) return
    
    // Skip if we're in account change (it will handle fetching)
    if (isAccountChangeInProgressRef.current) {
      console.log('⏭️  Skipping filters effect during account change')
      return
    }

    // Check if filters actually changed (not just object reference change)
    const filtersChanged = JSON.stringify(prevFiltersRef.current) !== JSON.stringify(filters)
    
    if (filtersChanged && prevFiltersRef.current !== null) {
      // Filters actually changed, refetch
      console.log('🔍 FILTERS CHANGED - REFETCHING EMAILS', {
        filters,
        mailboxType,
        grantId: currentGrantId,
        isAllAccounts: currentGrantId === '__all_accounts__'
      })
      prevFiltersRef.current = filters
      
      // Reset pagination when filters change
      setFetchedNextCursor(null)
      setFetchedHasMore(true)
      setAllAccountsPage(0)
      
      // Use different endpoint for all-accounts mode
      if (currentGrantId === '__all_accounts__') {
        performAllAccountsFilter(mailboxType, filters, 0)
      } else {
        fetchEmails(currentGrantId, mailboxType, filters)
      }
    } else if (prevFiltersRef.current === null) {
      // First time initialization - just track, don't fetch
      prevFiltersRef.current = filters
    }
  }, [filters]) // ONLY depend on filters, not mailboxType or currentGrantId

  // All-accounts filter function
  const performAllAccountsFilter = React.useCallback(async (folder: string, filterObj: EmailFilters, page: number = 0) => {
    try {
      setLoading(true)

      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session?.user?.id) {
        console.error('Failed to get auth session:', sessionError)
        setLoading(false)
        throw new Error('Not authenticated')
      }

      const params = new URLSearchParams()
      params.set('userId', session.user.id)
      params.set('mailboxType', folder)
      params.set('filters', JSON.stringify(filterObj))
      params.set('page', String(page))

      const response = await fetch(`/api/accounts/filter?${params.toString()}`)

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '<no body>')
        console.error('Failed to filter all accounts:', {
          status: response.status,
          body: bodyText,
        })
        throw new Error(`Failed to filter emails: ${response.status}`)
      }

      const data = await response.json()
      const emails = data.data || []

      // Transform emails to Mail format
      function stripHtml(input: string) {
        if (!input) return ""
        return input
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim()
      }

      const transformedMails = emails.map((msg: any) => ({
        id: msg.id,
        name: msg.from?.[0]?.name || msg.from?.[0]?.email || 'Unknown',
        email: msg.from?.[0]?.email || '',
        subject: msg.subject || '(No subject)',
        text: msg.html || msg.body || stripHtml(msg.body) || msg.snippet || '',
        html: msg.html || msg.body || undefined,
        thread_id: msg.thread_id || undefined,
        reply_to_message_id: msg.reply_to_message_id || undefined,
        attachments: msg.attachments || [],
        date: new Date(msg.date * 1000).toISOString(),
        read: !msg.unread,
        labels: msg.folders || ['inbox'],
        accountEmail: msg.accountEmail,
        accountProvider: msg.accountProvider,
        emailAccountId: msg.emailAccountId,
        grantId: msg.grantId,
      }))

      console.log('📨 All-Accounts Filter Results:', {
        mailboxType: folder,
        totalFound: data.metadata?.totalCount,
        pageCount: transformedMails.length,
        hasMore: data.metadata?.hasMore,
      })

      if (page === 0) {
        setFetchedMails(transformedMails)
      } else {
        setFetchedMails(prev => [...prev, ...transformedMails])
      }

      setFetchedHasMore(data.metadata?.hasMore || false)
      setLoading(false)
    } catch (error) {
      console.error('Error filtering all accounts:', error)
      setLoading(false)
      throw error
    }
  }, [])

  const handleAccountChange = React.useCallback((grantId: string) => {
    setCurrentGrantId(grantId)
    // Reset batch pagination when account changes
    setCurrentBatch(0)
    setIsPreloadingNextBatch(false)
    
    // Fetch the email account ID from Supabase based on grant_id
    const fetchAccountId = async () => {
      try {
        const response = await fetch(`/api/accounts?grantId=${grantId}`)
        const data = await response.json()
        if (data.account && data.account.id) {
          setCurrentEmailAccountId(data.account.id)
        }
      } catch (error) {
        console.error('Error fetching account ID:', error)
      }
    }
    
    fetchAccountId()
  }, [])

  // Fallback static links when provider folders aren't available yet
  const primaryLinks = [
    { title: 'Inbox', label: '0', icon: Inbox, variant: 'default' as const, folderId: 'INBOX' },
    { title: 'Starred', label: '0', icon: Star, variant: 'ghost' as const, folderId: 'STARRED' },
    { title: 'Important', label: '0', icon: Archive, variant: 'ghost' as const, folderId: 'IMPORTANT' },
    { title: 'Drafts', label: '0', icon: File, variant: 'ghost' as const, folderId: 'DRAFT' },
    { title: 'Sent', label: '0', icon: Send, variant: 'ghost' as const, folderId: 'SENT' },
    { title: 'Junk', label: '0', icon: ArchiveX, variant: 'ghost' as const, folderId: 'SPAM' },
    { title: 'Trash', label: '0', icon: Trash2, variant: 'ghost' as const, folderId: 'TRASH' },
  ]

  const secondaryLinks = [
    { title: 'Social', label: '0', icon: Users2, variant: 'ghost' as const },
    { title: 'Updates', label: '0', icon: AlertCircle, variant: 'ghost' as const },
    { title: 'Forums', label: '0', icon: MessagesSquare, variant: 'ghost' as const },
    { title: 'Shopping', label: '0', icon: ShoppingCart, variant: 'ghost' as const },
    { title: 'Promotions', label: '0', icon: Archive, variant: 'ghost' as const },
  ]

  // When provider folders are available, normalize and sort them by total_count desc.
  const primaryFolderIds = new Set(['INBOX', 'SENT', 'IMPORTANT', 'SPAM', 'JUNK', 'TRASH', 'STARRED'])

  const folderLinks = sidebarFolders.length > 0
    ? sidebarFolders.map((f: any) => ({
      title: f.name,
      label: String(f.total_count ?? 0),
      total_count: Number(f.total_count ?? 0),
      system_folder: Boolean(f.system_folder),
      icon:
        f.id === 'INBOX' ? Inbox :
        f.id === 'DRAFT' ? File :
        f.id === 'SENT' ? Send :
        f.id === 'SPAM' || f.id === 'JUNK' ? ArchiveX :
        f.id === 'TRASH' ? Trash2 :
        f.id === 'ARCHIVE' ? Archive :
        f.id === 'STARRED' ? Star :
        f.id === 'CATEGORY_FORUMS' ? MessagesSquare :
        f.id === 'CATEGORY_PERSONAL' ? Users2 :
        f.id === 'CATEGORY_PROMOTIONS' ? Archive :
        f.id === 'CATEGORY_SOCIAL' ? Users2 :
        f.id === 'CATEGORY_UPDATES' ? AlertCircle :
        f.id === 'IMPORTANT' ? Archive :
        Inbox,
      variant: (String(f.id).toUpperCase() === 'INBOX' ? 'default' : 'ghost') as 'default' | 'ghost',
      folderId: f.id
    })).sort((a: any, b: any) => (b.total_count || 0) - (a.total_count || 0))
    : []

  // Primary system folders to show (in descending order by count)
  const primaryLinksFromFolders = folderLinks.filter((l: any) => primaryFolderIds.has(String(l.folderId).toUpperCase()))

  // Labels / custom non-system folders
  const labelLinksFromFolders = folderLinks.filter((l: any) => !primaryFolderIds.has(String(l.folderId).toUpperCase()) && !l.system_folder)
  // Custom default labels to show when no account is selected
  const defaultCustomLabelTitles = [
    'To Respond',
    'Need Action',
    'FYI',
    'Resolved',
    'Newsletter',
    'Schedules',
    'Purchases',
    'Promotion',
    'Notification',
  ]

  const defaultCustomLabels = defaultCustomLabelTitles.map((t) => ({
    title: t,
    label: '0',
    icon: Tag,
    variant: 'ghost' as const,
  }))

  // Build navLinks depending on whether an account is selected
  let navLinks: any[] = []
  if (!currentGrantId) {
    // No account selected: show primary system folders + our default custom labels (counts 0)
    navLinks = [...primaryLinks, ...defaultCustomLabels]
  } else {
    // Account selected: show primary folders (from provider if available), then our custom labels at the top,
    // followed by any remaining non-system labels from the provider
    const primaryPart = primaryLinksFromFolders.length > 0 ? primaryLinksFromFolders : primaryLinks

    const customLabelObjects = defaultCustomLabelTitles.map((t) => {
      const found = labelLinksFromFolders.find((l: any) => String(l.title).toLowerCase() === t.toLowerCase())
      return found ? { ...found, icon: Tag } : { title: t, label: '0', icon: Tag, variant: 'ghost' as const }
    })

    const remainingLabels = labelLinksFromFolders.filter((l: any) => !defaultCustomLabelTitles.some((t) => String(l.title).toLowerCase() === t.toLowerCase()))

    if (folderLinks.length > 0) {
      navLinks = [...primaryPart, ...customLabelObjects, ...remainingLabels]
    } else {
      navLinks = [...primaryLinks, ...customLabelObjects, ...secondaryLinks]
    }
  }

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={(sizes: number[]) => {
          document.cookie = `react-resizable-panels:layout:mail=${JSON.stringify(
            sizes
          )}`
        }}
        className="h-full max-h-[100vh] items-stretch"
      >
        <ResizablePanel
          defaultSize={screenSize === 'mobile' ? 0 : responsiveLayout[0]}
          collapsedSize={navCollapsedSize}
          collapsible={true}
          minSize={screenSize === 'mobile' ? 0 : 5}
          maxSize={screenSize === 'mobile' ? 0 : 25}
          onCollapse={() => {
            setIsCollapsed(true)
            document.cookie = `react-resizable-panels:collapsed=${JSON.stringify(
              true
            )}`
          }}
          onResize={() => {
            setIsCollapsed(false)
            document.cookie = `react-resizable-panels:collapsed=${JSON.stringify(
              false
            )}`
          }}
          className={cn(
            (screenSize === 'mobile') && "hidden",
            isCollapsed &&
              "min-w-[50px] transition-all duration-300 ease-in-out"
          )}
        >
          <ScrollArea className="h-full">
            <div className="flex flex-col h-full min-h-0">
              {/* Logo Section */}
              <div className={cn("flex items-center border-b",
                isCollapsed ? "h-[52px] px-2 justify-center" : "justify-start h-[64px] px-2.5 py-2"
              )}>
                {isCollapsed ? (
                  <div className="w-8 h-8 flex items-center justify-center">
                    <img src="onebox_small.png" alt="" />
                  </div>
                ) : (
                  <div className="flex items-center justify-start">
                    <img src="onebox.png" alt="" className="w-40 h-10" />
                  </div>
                )}
              </div>

              {/* Account Switcher */}
              <div className={cn(
                "flex h-[52px] items-center justify-center border-b",
                isCollapsed ? "px-2" : "px-2"
              )}>
                <AccountSwitcher
                  isCollapsed={isCollapsed}
                  accounts={accounts}
                  onAccountChange={handleAccountChange}
                />
              </div>

              {/* Primary folders (Inbox, Sent, Important, Drafts, Spam/Junk, Trash) */}
              <Nav
                isCollapsed={isCollapsed}
                loading={sidebarLoading}
                links={(primaryLinksFromFolders.length > 0 ? primaryLinksFromFolders : primaryLinks)}
                activeMailbox={mailboxType}
                grantId={currentGrantId}
                forwardEmail={forwardEmail}
                onForwardEmailChange={setForwardEmail}
                isComposeOpen={isComposeOpen}
                onComposeOpenChange={setIsComposeOpen}
                draftToEdit={draftToEdit}
                onDraftEdit={setDraftToEdit}
                onMailboxTypeChange={(folderId) => {
                  const folderToUse = folderId || 'INBOX'
                  if (lastFolderChangeRef.current?.grantId === currentGrantId && lastFolderChangeRef.current?.folder === folderToUse) {
                    return
                  }
                  lastFolderChangeRef.current = { grantId: currentGrantId!, folder: folderToUse }
                  setMailboxType(folderToUse)
                  setSelectedLabelData(null)
                  setFilters({})
                  setSearchText('')
                  currentSearchRef.current = ''
                  setCurrentBatch(0)
                  setIsPreloadingNextBatch(false)
                  setAllAccountsPage(0)
                  if (currentGrantId) {
                    setFetchedNextCursor(null)
                    setFetchedHasMore(true)
                    // For all-accounts mode, use different endpoint
                    if (currentGrantId === '__all_accounts__') {
                      void fetchAllAccountsEmailsByFolder(folderToUse, 0, false)
                    } else {
                      fetchEmails(currentGrantId, folderToUse)
                    }
                  }
                }}
              />
              <Separator />

              {/* Labels / Custom Supabase Labels */}
              {currentGrantId && currentEmailAccountId && (
                <CustomLabels 
                  emailAccountId={currentEmailAccountId}
                  grantId={currentGrantId}
                  isLoadingLabel={labelLoadingId !== null}
                  isCollapsed={isCollapsed}
                  refreshTrigger={labelCountRefreshTrigger}
                  onMailboxTypeChange={(mailboxType) => {
                    setMailboxType(mailboxType)
                  }}
                  onLabelSelect={(labelId, labelName, emails, labelColor) => {
                    console.log('📬 CustomLabels callback received:', { labelId, labelName, labelColor, emailCount: emails.length })
                    setLabelLoadingId(labelId)
                    setSelectedLabelData({ labelId, labelName, labelColor, emails })
                    setShowLabeledEmails(true)
                    setLabelLoadingId(null)
                  }}
                />
              )}

              {/* Spacer to push account card to bottom */}
              <div className="flex-1" />

              {/* Account Details Card at Bottom */}
              {currentGrantId && (
                <div className={cn(
                  "border-t p-3 space-y-3",
                  isCollapsed ? "flex flex-col items-center" : ""
                )}>
                  {!isCollapsed ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {accounts[0]?.email?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{accounts[0]?.label || 'Account'}</p>
                          <p className="text-xs text-muted-foreground truncate">{accounts[0]?.email}</p>
                        </div>
                      </div>
                      <div className="bg-primary/15 rounded-lg p-3 border border-primary/20">
                        <p className="text-xs font-semibold mb-1">Upgrade to Pro</p>
                        <p className="text-xs text-muted-foreground mb-2">Get unlimited labels and more features</p>
                        <button className="w-full bg-primary text-primary-foreground text-xs font-medium py-1.5 rounded hover:bg-primary/90 transition-colors">
                          Upgrade
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center text-white text-xs font-bold">
                      {accounts[0]?.email?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={responsiveLayout[1]} minSize={30}>
          {!currentGrantId ? (
            // Show "Select an account" message when no account is selected
            <div className="h-full flex flex-col">
              <MailHeader 
                activeTab={activeTab}
                onTabChange={(v) => setActiveTab(v)}
                labelName={selectedLabelData?.labelName}
                labelColor={selectedLabelData?.labelColor}
              />
              <Separator />
              <MailSearchBar
                searchText={searchText}
                onSearchChange={handleSearchChange}
                onSearchSubmit={handleSearchSubmit}
                onSearchClear={handleSearchClear}
                onFilterOpen={() => setIsFilterOpen(true)}
              />
              <div className="flex-1 flex flex-col items-center justify-center bg-background">
                <div className="text-center space-y-4">
                  <h2 className="text-2xl font-semibold text-foreground">Select an account to see emails</h2>
                  <p className="text-muted-foreground max-w-md">
                    Choose an email account from the account switcher above
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <MailHeader 
                activeTab={activeTab}
                onTabChange={(v) => setActiveTab(v)}
                labelName={selectedLabelData?.labelName}
                labelColor={selectedLabelData?.labelColor}
              />
              <Separator />
              <MailSearchBar
                searchText={searchText}
                onSearchChange={handleSearchChange}
                onSearchSubmit={handleSearchSubmit}
                onSearchClear={handleSearchClear}
                onFilterOpen={() => setIsFilterOpen(true)}
              />
              {/* Show skeleton when label is loading */}
              {labelLoadingId !== null && selectedLabelData === null ? (
                <div className="p-4">
                  <MailListSkeleton />
                </div>
              ) : selectedLabelData !== null ? (
                // Show labeled emails
                <MailList
                  items={selectedLabelData.emails}
                  selectedGrantId={currentGrantId}
                  mailboxType={`label:${selectedLabelData.labelName}`}
                  initialNextCursor={null}
                  initialHasMore={false}
                  setItems={(updater) => {
                    // Update selectedLabelData when emails are modified (e.g., marked as read)
                    setSelectedLabelData(prev => {
                      if (!prev) return prev
                      return {
                        ...prev,
                        emails: typeof updater === 'function' ? updater(prev.emails) : updater
                      }
                    })
                    // Trigger label count refresh to update unread counts
                    setLabelCountRefreshTrigger(prev => prev + 1)
                  }}
                  onFolderChange={handleFolderChange}
                  onRefresh={handleRefreshLabeledEmails}
                  onPaginate={async (pageToken: string) => {
                    // No pagination for labeled emails
                  }}
                />
              ) : (
                // Show folder emails (normal flow)
                <MailListSection
                  activeTab={activeTab}
                  loading={loading}
                  currentGrantId={currentGrantId}
                  mailboxType={mailboxType}
                  fetchedMails={fetchedMails}
                  fetchedNextCursor={fetchedNextCursor}
                  fetchedHasMore={fetchedHasMore}
                  setFetchedMails={setFetchedMails}
                  onFolderChange={handleFolderChange}
                  onRefreshFolder={handleRefreshFolderEmails}
                  onPaginate={async (cursor) => {
                    if (currentGrantId && mailboxType) {
                      // For all-accounts mode, load next page with expandable time windows
                      if (currentGrantId === '__all_accounts__') {
                        const nextPage = allAccountsPage + 1
                        setAllAccountsPage(nextPage)
                        console.log('📄 Paginating to page:', nextPage)
                        // Always fetch with isLoadMore=true since we're fetching additional pages
                        if (mailboxType === 'INBOX') {
                          await fetchAllAccountsEmails(nextPage, 0, true)
                        } else {
                          await fetchAllAccountsEmailsByFolder(mailboxType, nextPage, true)
                        }
                      } else {
                        // For single-account mode, use cursor-based pagination
                        await fetchEmails(currentGrantId, mailboxType, filters, cursor)
                      }
                    }
                  }}
                  onDraftClick={(draft) => {
                    setDraftToEdit(draft)
                    setIsComposeOpen(true)
                  }}
                  dateFilterFrom={dateFilterFrom}
                  dateFilterTo={dateFilterTo}
                  filters={filters}
                  onDateFilterChange={(from, to) => {
                    setDateFilterFrom(from)
                    setDateFilterTo(to)
                  }}
                />
              )}
            </>
          )}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={responsiveLayout[2]} minSize={screenSize === 'mobile' || screenSize === 'tablet' ? 0 : 30}>
          {screenSize === 'mobile' || screenSize === 'tablet' ? (
            // On mobile/tablet, right panel is hidden (shows nothing)
            null
          ) : (
            // On desktop, show email detail or "No message selected"
            mail.selected ? (
              <MailDisplay
                mail={(() => {
                  if (selectedLabelData !== null) {
                    return selectedLabelData.emails.find((item: Mail) => item.id === mail.selected) || null
                  }
                  return (currentGrantId ? fetchedMails : (mails ?? [])).find((item: Mail) => item.id === mail.selected) || null
                })()}
                selectedGrantId={currentGrantId}
                setItems={setFetchedMails}
                onFolderChange={handleFolderChange}
                onLabelChange={handleLabelChange}
                onForward={(forwardData: any) => {
                  setForwardEmail(forwardData)
                  setIsComposeOpen(true)
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center bg-background">
                <p className="text-muted-foreground text-lg">No message selected</p>
              </div>
            )
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
      <FilterSheet open={isFilterOpen} onOpenChange={setIsFilterOpen} filters={filters} setFilters={setFilters} />
    </TooltipProvider>
  )
}