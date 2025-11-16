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
import { LabeledEmailsView } from "./labeled-emails-view"
import { CustomLabels } from "./custom-labels"

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
  defaultLayout = [20, 32, 48],
  defaultCollapsed = false,
  navCollapsedSize,
}: MailProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed)
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
  
  // Prevent duplicate folder change requests
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
      console.log('🔎 SEARCH SUBMITTED:', { searchText, searchQuery: searchText })
      currentSearchRef.current = searchText
      setFetchedNextCursor(null)
      setFetchedHasMore(true)
      // Create temporary filters with ONLY search_query_native
      // This overrides all other filters per Nylas API constraint
      const searchOnlyFilters: EmailFilters = {
        search_query_native: searchText
      }
      fetchEmails(currentGrantId, mailboxType, searchOnlyFilters)
    }
  }, [currentGrantId, mailboxType, searchText, filters])

  const fetchEmails = React.useCallback(async (grantId: string, folderId?: string, suppliedFilters?: EmailFilters, pageToken?: string | null) => {
    if (!grantId || grantId === 'none') {
      // clear if 'none' selected
      setCurrentGrantId(undefined)
      setFetchedMails([])
      setFetchedNextCursor(null)
      setFetchedHasMore(false)
      return
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
        // prefer explicit snippet, fall back to plain-text-stripped html/body
        text: msg.snippet || stripHtml(msg.body) || stripHtml(msg.html) || '',
        // include raw html when provided so MailDisplay can render it
        html: msg.html || msg.body || undefined,
        thread_id: msg.thread_id || undefined,
        reply_to_message_id: msg.reply_to_message_id || undefined,
        attachments: msg.attachments || [],
        // Convert Unix timestamp to ISO string for display
        date: new Date(msg.date * 1000).toISOString(),
        read: !msg.unread,
        labels: msg.folders || ['inbox']
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
  const fetchFolders = React.useCallback(async () => {
    if (!currentGrantId) {
      setSidebarFolders([])
      return
    }
    
    // Only show loading state on initial load
    if (initialSidebarLoad) {
      setSidebarLoading(true)
    }
    // Implement a small retry/backoff for transient 5xx errors from provider
    const maxAttempts = 3
    let attempt = 0
    let lastErr: any = null
    while (attempt < maxAttempts) {
      attempt += 1
      try {
        const res = await fetch(`/api/folders?grantId=${currentGrantId}`)
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
          clone.push({ id: toId, name: toId, total_count: 1, system_folder: toId === 'ARCHIVE' })
        }
      }

      return clone
    })

    // Refresh authoritative folder list in background (do not await)
    void fetchFolders()
  }, [fetchFolders])

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
    } else {
      // Account selected
      isAccountChangeInProgressRef.current = true
      
      // Serialize: fetch folders FIRST, then emails
      // This prevents concurrent requests to different endpoints that cause rate limiting
      fetchFolders().then(() => {
        // After folders complete, fetch inbox emails
        // Use small delay to ensure folders response is fully processed
        setTimeout(() => {
          // Only fetch if still the same account (prevent race conditions)
          if (currentGrantId) {
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
          if (currentGrantId) {
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
        grantId: currentGrantId
      })
      prevFiltersRef.current = filters
      
      // Reset pagination when filters change
      setFetchedNextCursor(null)
      setFetchedHasMore(true)
      // Refetch with new filters
      fetchEmails(currentGrantId, mailboxType, filters)
    } else if (prevFiltersRef.current === null) {
      // First time initialization - just track, don't fetch
      prevFiltersRef.current = filters
    }
  }, [filters]) // ONLY depend on filters, not mailboxType or currentGrantId

  const handleAccountChange = React.useCallback((grantId: string) => {
    setCurrentGrantId(grantId)
    
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
        className="h-full max-h-[800px] items-stretch"
      >
        <ResizablePanel
          defaultSize={defaultLayout[0]}
          collapsedSize={navCollapsedSize}
          collapsible={true}
          minSize={15}
          maxSize={20}
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
            isCollapsed &&
              "min-w-[50px] transition-all duration-300 ease-in-out"
          )}
        >
          <ScrollArea className="h-full">
            <div className="flex flex-col h-full min-h-0">
            <div
              className={cn(
                "flex h-[52px] items-center justify-center",
                isCollapsed ? "h-[52px]" : "px-2"
              )}
            >
              <AccountSwitcher
                isCollapsed={isCollapsed}
                accounts={accounts}
                onAccountChange={handleAccountChange}
              />
            </div>
            <Separator />
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
                // Prevent duplicate requests for the same folder (debounce rapid clicks)
                if (lastFolderChangeRef.current?.grantId === currentGrantId && lastFolderChangeRef.current?.folder === folderToUse) {
                  return
                }
                lastFolderChangeRef.current = { grantId: currentGrantId!, folder: folderToUse }
                setMailboxType(folderToUse)
                setFilters({}) // Reset filters when changing folders
                setSearchText('') // Reset search when changing folders
                currentSearchRef.current = ''
                if (currentGrantId) {
                  setFetchedNextCursor(null)
                  setFetchedHasMore(true)
                  // Fetch emails for new folder (request will be deduplicated if identical)
                  fetchEmails(currentGrantId, folderToUse)
                }
              }}
            />
            <Separator />
            {/* Labels / Custom Supabase Labels Only (No Nylas) */}
            {currentGrantId && currentEmailAccountId && (
              <div className="px-3 py-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Labels</h3>
                <CustomLabels 
                  emailAccountId={currentEmailAccountId}
                  onLabelSelect={(labelId, labelName, emails) => {
                    setShowLabeledEmails(true)
                  }}
                />
              </div>
            )}
            </div>
          </ScrollArea>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={defaultLayout[1]} minSize={30}>
          {showLabeledEmails && currentGrantId && currentEmailAccountId ? (
            <LabeledEmailsView 
              emailAccountId={currentEmailAccountId}
              grantId={currentGrantId}
            />
          ) : (
            <Tabs defaultValue="all" onValueChange={(v) => setActiveTab(v)}>
              <div className="flex items-center px-4 py-2">
                <h1 className="text-xl font-bold">Inbox</h1>
                <TabsList className="ml-auto">
                  <TabsTrigger
                    value="all"
                    className="text-zinc-600 dark:text-zinc-200"
                  >
                    All mail
                  </TabsTrigger>
                  <TabsTrigger
                    value="unread"
                    className="text-zinc-600 dark:text-zinc-200"
                  >
                    Unread
                  </TabsTrigger>
                </TabsList>
              </div>
              <Separator />
              <div className="bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search emails..." 
                    className="pl-8 pr-20"
                    value={searchText}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearchSubmit()
                      }
                    }}
                  />
                  <div className="absolute right-2 top-2.5 flex items-center gap-1">
                    {searchText && (
                      <button 
                        type="button" 
                        onClick={handleSearchClear}
                        className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors"
                        title="Clear search"
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Clear search</span>
                      </button>
                    )}
                    <button 
                      type="button" 
                      onClick={handleSearchSubmit}
                      disabled={!searchText}
                      className="p-1 rounded hover:bg-accent/30 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Search"
                    >
                      <Search className="h-4 w-4" />
                      <span className="sr-only">Search</span>
                    </button>
                    <button type="button" onClick={() => setIsFilterOpen(true)} className="p-1 rounded hover:bg-accent/30">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 12h12M10 20h4"/></svg>
                      <span className="sr-only">Open filters</span>
                    </button>
                  </div>
                </div>
              </div>
              <TabsContent value="all" className="m-0">
                {!currentGrantId ? (
                  <NoAccountMessage />
                ) : loading ? (
                  <MailListSkeleton />
                ) : (
                  <>
                    {console.log('🎯 RENDERING MAILLIST WITH:', { mailCount: fetchedMails.length, loading })}
                    <MailList 
                      items={fetchedMails} 
                      selectedGrantId={currentGrantId} 
                      mailboxType={mailboxType} 
                      isUnreadTab={activeTab === 'unread'} 
                      dateFilterFrom={dateFilterFrom}
                      dateFilterTo={dateFilterTo}
                        filters={filters}
                      onDateFilterChange={(from, to) => {
                        setDateFilterFrom(from)
                        setDateFilterTo(to)
                      }}
                      setItems={setFetchedMails} 
                      onFolderChange={handleFolderChange}
                      initialNextCursor={fetchedNextCursor} 
                      initialHasMore={fetchedHasMore}
                      onPaginate={async (cursor) => {
                        // Pagination requested - fetch next page with same filters/search
                        if (currentGrantId && mailboxType) {
                          await fetchEmails(currentGrantId, mailboxType, filters, cursor)
                        }
                      }}
                      onDraftClick={(draft) => {
                        setDraftToEdit(draft)
                        setIsComposeOpen(true)
                      }}
                    />
                  </>
                )}
              </TabsContent>
              <TabsContent value="unread" className="m-0">
                {loading ? (
                  <MailListSkeleton />
                ) : (
                  <MailList 
                    items={(currentGrantId ? fetchedMails : (mails ?? [])).filter((item: Mail) => !item.read)} 
                    selectedGrantId={currentGrantId}
                    mailboxType={mailboxType}
                    isUnreadTab={activeTab === 'unread'}
                    setItems={setFetchedMails}
                    onFolderChange={handleFolderChange}
                    initialNextCursor={fetchedNextCursor} 
                    initialHasMore={fetchedHasMore}
                    onDraftClick={(draft) => {
                      setDraftToEdit(draft)
                      setIsComposeOpen(true)
                    }}
                  />
                )}
              </TabsContent>
            </Tabs>
          )}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={defaultLayout[2]} minSize={30}>
          <MailDisplay
            mail={(currentGrantId ? fetchedMails : (mails ?? [])).find((item: Mail) => item.id === mail.selected) || null}
            selectedGrantId={currentGrantId}
            setItems={setFetchedMails}
            onFolderChange={handleFolderChange}
            onForward={(forwardData) => {
              setForwardEmail(forwardData);
              // Trigger compose drawer to open
              // This needs to be communicated to Nav component
            }}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
      <FilterSheet open={isFilterOpen} onOpenChange={setIsFilterOpen} filters={filters} setFilters={setFilters} />
    </TooltipProvider>
  )
}