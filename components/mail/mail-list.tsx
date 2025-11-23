import * as React from "react"
import { ComponentProps } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Mail } from "./use-mail"
import { useMail } from "./use-mail";
import { MailListSkeleton } from "./mail-list-skeleton"
import { cn } from "../../lib/utils";
import { Archive, ArchiveX, Trash2, Star, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { EmailFilters } from "./filter-sheet"
import { Badge } from "../ui/badge";

interface MailListProps {
  items: Mail[]
  selectedGrantId?: string | null
  mailboxType?: string
  isUnreadTab?: boolean
  onFolderChange?: (opts?: { from?: string | null; to?: string | null }) => Promise<void> | void
  // optional setter to allow optimistic updates from this component
  setItems?: React.Dispatch<React.SetStateAction<Mail[]>>
  // initial pagination state from parent (if parent performed initial fetch)
  initialNextCursor?: string | null
  initialHasMore?: boolean
  dateFilterFrom?: number | null
  dateFilterTo?: number | null
  filters?: EmailFilters
  onDateFilterChange?: (from: number | null, to: number | null) => void
  onDraftClick?: (draft: Mail) => void
  // Pagination callback for parent to handle fetching next page with current filters/search
  onPaginate?: (pageToken: string) => Promise<void>
  // Optional refresh callback for labeled emails
  onRefresh?: () => Promise<void>
}

export function MailList({ items, selectedGrantId, mailboxType, isUnreadTab, setItems, initialNextCursor, initialHasMore, onFolderChange, dateFilterFrom, dateFilterTo, filters, onDateFilterChange, onDraftClick, onPaginate, onRefresh }: MailListProps) {
  const [mail, setMail] = useMail()
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const CHUNK_SIZE = 50 
  const API_FETCH_SIZE = 200
  const PREFETCH_AT_EMAIL = 100
  const RATE_LIMIT_DELAY = 1000

  const lastFetchAt = React.useRef<number>(0)
  const inFlight = React.useRef<boolean>(false)
  const lastRequestedCursor = React.useRef<string | null>(null)
  const debounceTimer = React.useRef<number | null>(null)
  const prevFiltersRef = React.useRef<{ from: number | null | undefined; to: number | null | undefined } | null>(null)
  const lastPrefetchedPageRef = React.useRef<number>(0) // Track last prefetched batch (batch 0 is initial load)

  const [allEmails, setAllEmails] = React.useState<Mail[]>(items || [])
  const [displayEmails, setDisplayEmails] = React.useState<Mail[]>([])
  const [currentChunk, setCurrentChunk] = React.useState(0)
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [isFetchingBackground, setIsFetchingBackground] = React.useState(false)
  const [hasMoreEmails, setHasMoreEmails] = React.useState(true)
  const [lastFetchPosition, setLastFetchPosition] = React.useState(0)
  const [isOnLastFetchedPage, setIsOnLastFetchedPage] = React.useState(false) // Track if user is on the last currently-loaded page
  const prevMailboxTypeRef = React.useRef<string | undefined>(undefined)
  const prevSelectedGrantIdRef = React.useRef<string | null | undefined>(undefined)
  const isInitialDateFilterMountRef = React.useRef(true)
  const prevDateFilterFromRef = React.useRef<number | null | undefined>(null)
  const prevDateFilterToRef = React.useRef<number | null | undefined>(null)

  React.useEffect(() => {
    console.log('🔍 MAILBOX EFFECT CHECK:', {
      prevMailbox: prevMailboxTypeRef.current,
      currentMailbox: mailboxType,
      prevGrant: prevSelectedGrantIdRef.current,
      currentGrant: selectedGrantId,
      mailboxChanged: prevMailboxTypeRef.current !== undefined && prevMailboxTypeRef.current !== mailboxType,
      grantChanged: prevSelectedGrantIdRef.current !== undefined && prevSelectedGrantIdRef.current !== selectedGrantId
    })
    
    // Only reset if this is a genuine change, not initial mount
    const mailboxChanged = prevMailboxTypeRef.current !== undefined && prevMailboxTypeRef.current !== mailboxType
    const grantChanged = prevSelectedGrantIdRef.current !== undefined && prevSelectedGrantIdRef.current !== selectedGrantId
    
    prevMailboxTypeRef.current = mailboxType
    prevSelectedGrantIdRef.current = selectedGrantId
    
    if (mailboxChanged || grantChanged) {
      console.log('⏰ mailbox effect: resetting state - mailbox or grant changed')
      console.log('🗑️ RESETTING STATE - mailbox or grant changed')
      setAllEmails([])
      setDisplayEmails([])
      setCurrentChunk(0)
      setNextCursor(null)
      setHasMoreEmails(true)
      setLastFetchPosition(0)
      setIsOnLastFetchedPage(false)
    } else {
      console.log('⏰ mailbox effect: NOT resetting (still initial mount)')
    }
    // DO NOT fetch here - parent mail.tsx handles all fetching
  }, [mailboxType, selectedGrantId])
  // Reset UI state when date filters change
  // NOTE: Parent (mail.tsx) handles fetching with date filters
  React.useEffect(() => {
    // Skip on initial mount - only process when filters are actually changed by user
    if (isInitialDateFilterMountRef.current) {
      console.log('⏰ date filter effect: skipping on initial mount')
      isInitialDateFilterMountRef.current = false
      prevDateFilterFromRef.current = dateFilterFrom
      prevDateFilterToRef.current = dateFilterTo
      return
    }
    
    // Check if filters ACTUALLY changed
    const fromChanged = prevDateFilterFromRef.current !== dateFilterFrom
    const toChanged = prevDateFilterToRef.current !== dateFilterTo
    
    console.log('⏰ date filter effect: checking if changed', { 
      prevFrom: prevDateFilterFromRef.current, 
      currentFrom: dateFilterFrom, 
      prevTo: prevDateFilterToRef.current, 
      currentTo: dateFilterTo,
      fromChanged,
      toChanged
    })
    
    if (!fromChanged && !toChanged) {
      console.log('⏰ date filter effect: no actual change, skipping')
      return
    }
    
    console.log('⏰ date filter effect: filters changed, setting debounce timer', { dateFilterFrom, dateFilterTo })
    
    // Update refs
    prevDateFilterFromRef.current = dateFilterFrom
    prevDateFilterToRef.current = dateFilterTo
    
    // Debounce date filter changes slightly so the user can pick both From and To
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current)
    }
    // short delay to allow both from/to selections to complete
    debounceTimer.current = window.setTimeout(() => {
      console.log('🗑️ DATE FILTER TIMER FIRED - Resetting state')
      // reset when date filter changes
      setAllEmails([])
      setDisplayEmails([])
      setCurrentChunk(0)
      setNextCursor(null)
      setHasMoreEmails(true)
      setLastFetchPosition(0)
      setIsOnLastFetchedPage(false)
      // DO NOT fetch here - parent mail.tsx handles fetching with filters
    }, 300)

    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current)
    }
  }, [dateFilterFrom, dateFilterTo])

  React.useEffect(() => {
    console.log('📨 MailList received items from parent:', {
      itemsCount: items.length,
      firstItem: items[0] ? { id: items[0].id, subject: items[0].subject } : null
    })
    console.log('📌 BEFORE setAllEmails - items.length:', items.length)
    console.log('⏰ items effect firing')
    setAllEmails(items || [])
    console.log('📌 AFTER setAllEmails called')
  }, [items])

  React.useEffect(() => {
    if (typeof (initialNextCursor) !== 'undefined') setNextCursor(initialNextCursor || null)
    if (typeof (initialHasMore) !== 'undefined') setHasMoreEmails(Boolean(initialHasMore))
  }, [initialNextCursor, initialHasMore])

  React.useEffect(() => {
    console.log('⚡ updateDisplayEmails effect triggered:', { currentChunk, allEmailsLength: allEmails.length })
    updateDisplayEmails()
    
    // ONLY check prefetch in all-accounts mode
    const isAllAccountsMode = selectedGrantId === '__all_accounts__'
    if (isAllAccountsMode) {
      checkAndPrefetch()
    }
  }, [currentChunk, allEmails, selectedGrantId])

  React.useEffect(() => {
    console.log('📦 displayEmails state changed:', {
      count: displayEmails.length,
      first: displayEmails[0] ? { id: displayEmails[0].id, subject: displayEmails[0].subject } : null
    })
  }, [displayEmails])

  async function fetchBatch(cursor: string | null, isBackground = false) {
    if (!selectedGrantId || !mailboxType) return

    if (inFlight.current) {
      console.debug('fetchBatch: request already in flight — skipping duplicate')
      return
    }

    if (cursor && lastRequestedCursor.current === cursor) {
      console.debug('fetchBatch: cursor already requested, skipping duplicate', { cursor })
      return
    }

    const currentCount = allEmails.length
    const isLargeBatchTransition = (
      (currentCount >= 1500 && currentCount < 1800) ||
      (currentCount >= 3700 && currentCount < 4000)
    )
    
    if (currentCount === 0 || !isBackground || isLargeBatchTransition) {
      setIsLoading(true)
      setIsFetchingBackground(false)
    } else {
      setIsFetchingBackground(true)
    }

    try {
      const params = new URLSearchParams()
      params.set('grantId', String(selectedGrantId))
      params.set('limit', String(API_FETCH_SIZE))
      if (cursor) params.set('page_token', String(cursor))
      if (mailboxType) params.set('in', String(mailboxType).toUpperCase())
      // include date filter params when provided (received_after and received_before expect unix seconds)
      if (dateFilterFrom !== null && dateFilterFrom !== undefined) {
        params.set('received_after', String(dateFilterFrom))
      }
      if (dateFilterTo !== null && dateFilterTo !== undefined) {
        params.set('received_before', String(dateFilterTo))
      }

      // Include other filters if provided
      if (typeof (filters) !== 'undefined' && filters !== null) {
        try {
          const f = filters as any
          if (f.subject) params.set('subject', String(f.subject))
          if (f.any_email) params.set('any_email', String(f.any_email))
          if (f.to) params.set('to', String(f.to))
          if (f.from) params.set('from', String(f.from))
          if (f.cc) params.set('cc', String(f.cc))
          if (f.bcc) params.set('bcc', String(f.bcc))
          if (f.thread_id) params.set('thread_id', String(f.thread_id))
          if (f.fields) params.set('fields', String(f.fields))
          if (f.search_query_native) params.set('search_query_native', String(f.search_query_native))
          if (typeof f.unread !== 'undefined' && f.unread !== null) params.set('unread', String(Boolean(f.unread)))
          if (typeof f.starred !== 'undefined' && f.starred !== null) params.set('starred', String(Boolean(f.starred)))
          if (typeof f.has_attachment !== 'undefined' && f.has_attachment !== null) params.set('has_attachment', String(Boolean(f.has_attachment)))
          if (f.in) params.set('in', String(f.in).toUpperCase())
        } catch (e) {}
      }

      const url = `/api/messages?${params.toString()}`
      console.debug('Fetching messages batch', {
        url,
        isBackground,
        mailboxType,
        cursor,
        batchSize: API_FETCH_SIZE
      })

      const now = Date.now()
      const since = now - (lastFetchAt.current || 0)
      if (since < RATE_LIMIT_DELAY) {
        const wait = RATE_LIMIT_DELAY - since
        console.debug('Throttling fetch, waiting', { wait })
        await new Promise((resolve) => setTimeout(resolve, wait))
      }

      lastFetchAt.current = Date.now()
      inFlight.current = true
      lastRequestedCursor.current = cursor

      const res = await fetch(url, { 
        credentials: 'same-origin',
        ...(isBackground ? { signal: AbortSignal.timeout(30000) } : {})
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '<no body>')
        console.error('Failed to fetch messages batch', {
          status: res.status,
          mailboxType,
          cursor,
          error: text
        })

        try {
          const errorData = JSON.parse(text)
          if (errorData.error?.type === 'rate_limit_error' || 
              errorData.error?.provider_error?.error?.code === 403) {
            setAllEmails((prev) => prev)
            setHasMoreEmails(true)
            setIsLoading(false)
            setIsFetchingBackground(false)
            
            if (isBackground) {
              console.log('Rate limit hit, will retry after delay', { delay: RATE_LIMIT_DELAY })
              await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY))
              return fetchBatch(cursor, true)
            }
            
            alert('Too many email requests. Please wait a minute before loading more emails.')
            return
          }
        } catch (e) {}
        
        if (isBackground && res.status !== 404) {
          console.debug('Retrying background fetch after error')
          await new Promise(resolve => setTimeout(resolve, 1000))
          return fetchBatch(cursor, true)
        }
        
        return
      }

      const data = await res.json()
      
      if (!data || !Array.isArray(data?.data)) {
        console.error('Invalid response format', { data })
        return
      }

      const rawItems: any[] = data.data
      const newCursor: string | null = data.next_cursor || null

      function stripHtml(input: string) {
        if (!input) return ""
        return String(input)
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim()
      }

      const transformed: Mail[] = rawItems.map((msg: any) => ({
        id: msg.id,
        name: msg.from?.[0]?.name || msg.from?.[0]?.email || 'Unknown',
        email: msg.from?.[0]?.email || '',
        subject: msg.subject || '(No subject)',
        text: msg.snippet || stripHtml(msg.body) || stripHtml(msg.html) || '',
        html: msg.html || msg.body || undefined,
        attachments: msg.attachments || [],
        date: new Date((Number(msg.date) || 0) * 1000).toISOString(),
        read: !msg.unread,
        labels: msg.folders || ['inbox'],
      }))

      setAllEmails((prev) => {
        const existing = new Set(prev.map((p) => p.id))
        const toAdd = transformed.filter((t) => !existing.has(t.id))
        return [...prev, ...toAdd]
      })

      if (setItems) {
        try {
          setItems((prev) => {
            const existing = new Set(prev.map((p) => p.id))
            const toAdd = transformed.filter((t) => !existing.has(t.id))
            return [...prev, ...toAdd]
          })
        } catch (e) {
          console.warn('Failed to append to parent items via setItems', e)
        }
      }

      setNextCursor(newCursor)
      setHasMoreEmails(Boolean(newCursor))
      console.debug('Fetched batch', { added: transformed.length, totalNow: (allEmails?.length || 0) + transformed.length, nextCursor: newCursor })
    } catch (err) {
      console.error('Error fetching messages batch', err)
    } finally {
      inFlight.current = false
      if (!allEmails || allEmails.length === 0) {
        lastRequestedCursor.current = null
      }
      if (isBackground) setIsFetchingBackground(false)
      else setIsLoading(false)
    }
  }

  function updateDisplayEmails() {
    const startIndex = currentChunk * CHUNK_SIZE
    const endIndex = startIndex + CHUNK_SIZE

    // Get the slice of emails to display
    const chunk = allEmails.slice(startIndex, endIndex)
    
    console.log('📄 updateDisplayEmails:', {
      currentChunk,
      startIndex,
      endIndex,
      chunkLength: chunk.length,
      allEmailsLength: allEmails.length,
      emails: chunk.map(e => e.id)
    })
    
    setDisplayEmails(chunk)
  }

  function checkAndPrefetch() {
    const isAllAccountsMode = selectedGrantId === '__all_accounts__'
    
    if (!isAllAccountsMode) {
      return // Only prefetch in all-accounts mode
    }

    // Prefetch strategy: Load next batch when at 50% through current batch
    // Each batch = 4 pages (200 emails / 50 per page)
    // Page 0-3 = batch 0, Page 4-7 = batch 1, Page 8-11 = batch 2, etc.
    // Trigger prefetch at page 2, 6, 10, 14... (middle of each batch)
    // So next batch is ready BEFORE reaching pages 4, 8, 12, 16... (start of next batch)
    
    const pagesPerBatch = 4
    const currentBatch = Math.floor(currentChunk / pagesPerBatch)
    const currentPageInBatch = currentChunk % pagesPerBatch
    
    // Prefetch when we're at page 2 within the batch (50% through)
    const shouldPrefetch = currentPageInBatch === 2 && !isFetchingBackground && !inFlight.current && onPaginate
    
    if (shouldPrefetch) {
      // Next batch that needs to be prefetched
      const nextBatchNumber = currentBatch + 1
      
      // Check if we've already prefetched this batch
      const alreadyPrefetched = lastPrefetchedPageRef.current >= nextBatchNumber
      
      if (alreadyPrefetched) {
        console.log('✅ Already prefetched batch', { currentBatch, nextBatchNumber, lastPrefetched: lastPrefetchedPageRef.current })
        return
      }
      
      console.log('⚡ PREFETCH TRIGGERED at page', currentChunk, '(batch', currentBatch, 'page', currentPageInBatch, ') | Prefetching batch', nextBatchNumber, 'with', allEmails.length, 'emails loaded', {
        currentChunk,
        currentBatch,
        currentPageInBatch,
        nextBatchNumber,
        totalEmails: allEmails.length
      })
      
      // Mark that we're prefetching this batch
      lastPrefetchedPageRef.current = nextBatchNumber
      
      // Fetch next 200 emails in background
      inFlight.current = true
      setIsFetchingBackground(true)
      
      const prefetchNextBatch = async () => {
        try {
          await onPaginate('')
          console.log('✅ Background prefetch completed for batch', nextBatchNumber, '| now have', allEmails.length, 'emails')
        } catch (error) {
          console.error('Error in prefetch batch', nextBatchNumber, ':', error)
          lastPrefetchedPageRef.current = nextBatchNumber - 1 // Reset on error
        } finally {
          inFlight.current = false
          setIsFetchingBackground(false)
        }
      }
      
      void prefetchNextBatch()
    }
  }

  function goToNextChunk() {
    const desired = currentChunk + 1
    const startIndex = desired * CHUNK_SIZE
    const endIndex = startIndex + CHUNK_SIZE
    const isAllAccountsMode = selectedGrantId === '__all_accounts__'
    
    if (isAllAccountsMode) {
      // All-accounts mode: just navigate through existing data
      // NO requests here - checkAndPrefetch will handle loading more data
      if (endIndex <= allEmails.length) {
        // We have the data, just show it
        setCurrentChunk(desired)
        setIsOnLastFetchedPage(false)
        return
      }
      
      // If we don't have data yet, don't advance
      // Wait for checkAndPrefetch to load more
      console.log('⏸️ Cannot navigate to page', desired, '- need', endIndex, 'but only have', allEmails.length, 'emails')
      return
    }
    
    // Single-account mode: cursor-based pagination (original logic)
    const neededEnd = (desired + 1) * CHUNK_SIZE
    const haveNextChunkData = neededEnd <= allEmails.length

    if (haveNextChunkData) {
      setCurrentChunk((c) => c + 1)
    } else if (hasMoreEmails && nextCursor && !isLoading && !isFetchingBackground && !inFlight.current) {
      if (onPaginate) {
        inFlight.current = true
        lastRequestedCursor.current = nextCursor
        
        setCurrentChunk((c) => c + 1)
        setIsFetchingBackground(true)
        onPaginate(nextCursor)
          .finally(() => {
            inFlight.current = false
            setIsFetchingBackground(false)
          })
      } else {
        setIsLoading(true)
        fetchBatch(nextCursor, false)
          .then(() => {
            setCurrentChunk((c) => c + 1)
          })
          .finally(() => {
            setIsLoading(false)
          })
      }
    }
  }

  function goToPreviousChunk() {
    if (currentChunk > 0) setCurrentChunk((c) => c - 1)
  }

  async function handleRefresh() {
    setIsRefreshing(true)
    try {
      // If custom refresh handler provided (for labeled emails), use it
      if (onRefresh) {
        await onRefresh()
      } else {
        // Default behavior for folder emails
        setCurrentChunk(0)
        setAllEmails([])
        setDisplayEmails([])
        setNextCursor(null)
        setHasMoreEmails(true)
        setLastFetchPosition(0)
        
        // Trigger parent refresh
        if (onFolderChange) {
          await onFolderChange()
        }
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  const startEmail = displayEmails.length > 0 ? currentChunk * CHUNK_SIZE + 1 : 0
  const endEmail = displayEmails.length > 0 ? startEmail + displayEmails.length - 1 : 0

  return (
    <div className="flex flex-col h-screen">
      <div className="p-3 border-b flex items-center gap-4 flex-wrap">
        <div className="ml-auto flex items-center gap-2">
          <Button 
            variant="secondary" 
            size="icon" 
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh email list"
            className={isRefreshing ? "animate-spin" : ""}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button 
            variant="secondary" 
            size="icon" 
            onClick={goToPreviousChunk} 
            disabled={currentChunk === 0} 
            aria-label="Previous 50"
          >
            {'<'}
          </Button>
          <div className="text-sm">
            <span>
              {isLoading ? 'Loading...' : `Showing ${startEmail || 1}-${endEmail || 50}`}
            </span>
          </div>
          <Button 
            variant="secondary" 
            size="icon" 
            onClick={goToNextChunk} 
            disabled={!(endEmail < allEmails.length || hasMoreEmails)} 
            aria-label="Next 50"
          >
            {'>'}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-2 p-4 pt-0 mb-[150px]">
            {(isLoading && displayEmails.length === 0) || (isFetchingBackground && displayEmails.length === 0) ? (
              <MailListSkeleton />
            ) : (
              <>
                {displayEmails.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent group relative",
                      mail.selected === item.id && "bg-muted"
                    )}
                  >
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/95 rounded-lg px-2 py-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={item.labels?.map(String).join(' ').toLowerCase().includes('archiv') ? 'Move to Inbox' : 'Archive'}
                    onClick={(e) => {
                      e.stopPropagation();
                      const isArchived = (item.labels || []).map(String).join(' ').toLowerCase().includes('archiv')
                      const destination = isArchived ? 'inbox' : 'archive'
                      
                      // Optimistic UI update first
                      if (destination !== mailboxType && destination !== String(mailboxType).toLowerCase()) {
                        setAllEmails(prev => prev.filter(m => m.id !== item.id));
                        if (setItems) setItems(prev => prev.filter(m => m.id !== item.id));
                        onFolderChange?.({ from: mailboxType, to: destination })
                      } else {
                        setAllEmails(prev => prev.map(m => m.id === item.id ? { ...m, labels: destination === 'inbox' ? [] : [destination] } : m))
                        if (setItems) setItems(prev => prev.map(m => m.id === item.id ? { ...m, labels: destination === 'inbox' ? [] : [destination] } : m))
                        onFolderChange?.({ from: mailboxType, to: destination })
                      }

                      // Then send API request
                      const params = new URLSearchParams();
                      if (item.grantId) params.set('grantId', item.grantId);
                      params.set('messageId', item.id);
                      params.set('destination', destination);
                      fetch(`/api/messages/${item.id}/move?${params.toString()}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ destination, grantId: item.grantId }),
                      }).catch(error => {
                        console.error('Failed to move message:', error);
                        // Revert optimistic update on error
                        setAllEmails(prev => [...prev]);
                        if (setItems) setItems(prev => [...prev]);
                        if (onFolderChange) onFolderChange()
                      });
                    }}
                  >
                    {(item.labels || []).map(String).join(' ').toLowerCase().includes('archiv') ? 
                      <ArchiveX className="h-4 w-4" /> : 
                      <Archive className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={item.labels?.map(String).join(' ').toLowerCase().includes('spam') ? 'Not Spam' : 'Mark as Spam'}
                    onClick={(e) => {
                      e.stopPropagation();
                      const isSpam = (item.labels || []).map(String).join(' ').toLowerCase().includes('spam')
                      const destination = isSpam ? 'inbox' : 'spam'
                      
                      // Optimistic UI update first
                      if (destination !== mailboxType && destination !== String(mailboxType).toLowerCase()) {
                        setAllEmails(prev => prev.filter(m => m.id !== item.id));
                        if (setItems) setItems(prev => prev.filter(m => m.id !== item.id));
                        onFolderChange?.({ from: mailboxType, to: destination })
                      } else {
                        setAllEmails(prev => prev.map(m => m.id === item.id ? { ...m, labels: destination === 'inbox' ? [] : [destination] } : m))
                        if (setItems) setItems(prev => prev.map(m => m.id === item.id ? { ...m, labels: destination === 'inbox' ? [] : [destination] } : m))
                        onFolderChange?.({ from: mailboxType, to: destination })
                      }

                      // Then send API request
                      const params = new URLSearchParams();
                      if (item.grantId) params.set('grantId', item.grantId);
                      params.set('messageId', item.id);
                      params.set('destination', destination);
                      fetch(`/api/messages/${item.id}/move?${params.toString()}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ destination, grantId: item.grantId }),
                      }).catch(error => {
                        console.error('Failed to move message:', error);
                        // Revert optimistic update on error
                        setAllEmails(prev => [...prev]);
                        if (setItems) setItems(prev => [...prev]);
                        if (onFolderChange) onFolderChange()
                      });
                    }}
                  >
                    {(item.labels || []).map(String).join(' ').toLowerCase().includes('spam') ?
                      <ArchiveX className="h-4 w-4" /> : 
                      <ArchiveX className="h-4 w-4 rotate-45" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={item.labels?.map(String).join(' ').toLowerCase().includes('trash') ? 'Restore from Trash' : 'Move to Trash'}
                    onClick={(e) => {
                      e.stopPropagation();
                      const isTrashed = (item.labels || []).map(String).join(' ').toLowerCase().includes('trash')
                      const destination = isTrashed ? 'inbox' : 'trash'

                      // Optimistic UI update first
                      if (destination !== mailboxType && destination !== String(mailboxType).toLowerCase()) {
                        setAllEmails(prev => prev.filter(m => m.id !== item.id));
                        if (setItems) setItems(prev => prev.filter(m => m.id !== item.id));
                        onFolderChange?.({ from: mailboxType, to: destination })
                      } else {
                        setAllEmails(prev => prev.map(m => m.id === item.id ? { ...m, labels: destination === 'inbox' ? [] : [destination] } : m))
                        if (setItems) setItems(prev => prev.map(m => m.id === item.id ? { ...m, labels: destination === 'inbox' ? [] : [destination] } : m))
                        onFolderChange?.({ from: mailboxType, to: destination })
                      }

                      // Then send API request
                      const params = new URLSearchParams();
                      if (item.grantId) params.set('grantId', item.grantId);
                      params.set('messageId', item.id);
                      params.set('destination', destination);
                      fetch(`/api/messages/${item.id}/move?${params.toString()}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ destination, grantId: item.grantId }),
                      }).catch(error => {
                        console.error('Failed to move message:', error);
                        // Revert optimistic update on error
                        setAllEmails(prev => [...prev]);
                        if (setItems) setItems(prev => [...prev]);
                        if (onFolderChange) onFolderChange()
                      });
                    }}
                  >
                    {(item.labels || []).map(String).join(' ').toLowerCase().includes('trash') ? 
                      <ArchiveX className="h-4 w-4" /> :
                      <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 mr-2 shrink-0"
                  title={item.labels?.map(String).join(' ').toLowerCase().includes('star') ? 'Unstar' : 'Star'}
                  onClick={(e) => {
                    e.stopPropagation();
                    const isStarred = (item.labels || []).map(String).join(' ').toLowerCase().includes('star')
                    const destination = isStarred ? 'inbox' : 'starred'
                    
                    // Optimistic UI update first
                    setAllEmails(prev => prev.map(m => m.id === item.id ? { ...m, labels: destination === 'inbox' ? [] : [destination] } : m))
                    if (setItems) setItems(prev => prev.map(m => m.id === item.id ? { ...m, labels: destination === 'inbox' ? [] : [destination] } : m))
                    onFolderChange?.({ from: mailboxType, to: destination })

                    // Then send API request
                    const params = new URLSearchParams();
                    if (item.grantId) params.set('grantId', item.grantId);
                    params.set('messageId', item.id);
                    params.set('destination', destination);
                    fetch(`/api/messages/${item.id}/move?${params.toString()}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ destination, grantId: item.grantId }),
                    }).catch(error => {
                      console.error('Failed to move message:', error);
                      // Revert optimistic update on error
                      setAllEmails(prev => [...prev]);
                      if (setItems) setItems(prev => [...prev]);
                        onFolderChange?.({ from: mailboxType, to: destination })
                    });
                  }}
                >
                  <Star className={cn("h-4 w-4", (item.labels || []).map(String).join(' ').toLowerCase().includes('star') && "fill-yellow-400 text-yellow-400")} />
                </Button>
                <div 
                  className="w-full cursor-pointer"
                  onClick={() => {
                    // Check if this is a draft
                    const isDraft = (item.labels || []).map(String).some(l => l.toUpperCase() === 'DRAFT')
                    
                    if (isDraft) {
                      // For drafts, call the draft click handler instead of displaying the email
                      if (onDraftClick) {
                        onDraftClick(item)
                      }
                      return
                    }
                    
                    // Instantly update UI to mark as read and show email
                    if (isUnreadTab || item.read === false) {
                      // Update local state
                      setAllEmails(prev => prev.map(m => m.id === item.id ? { ...m, read: true } : m))
                      
                      // Update parent state if available
                      if (setItems) {
                        setItems(prev => prev.map(m => m.id === item.id ? { ...m, read: true } : m))
                      }

                      // Fire and forget API call to mark as read
                      const isLabeledEmail = item.labelId && item.emailAccountId
                      const params = new URLSearchParams()
                      if (item.grantId) params.set('grantId', String(item.grantId))
                      params.set('unread', 'false')
                      
                      // Use label-specific read endpoint for labeled emails, general endpoint for folder emails
                      let url: string
                      if (isLabeledEmail) {
                        url = `/api/labels/${item.labelId}/messages/${item.id}/read?${params.toString()}&emailAccountId=${encodeURIComponent(item.emailAccountId!)}`
                      } else {
                        url = `/api/messages/${item.id}/read?${params.toString()}`
                      }
                      
                      fetch(url, {
                        method: 'PUT',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({})
                      }).catch(e => {
                        console.error('Failed to mark message as read:', e)
                      })
                    }
                    
                    // Instantly show the email
                    setMail({
                      ...mail,
                      selected: item.id
                    })

                    setMail({
                      ...mail,
                      selected: item.id,
                    })
                  }}
                >
                  <div className="flex w-full flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">{item.name}</div>
                        {!item.read && (
                          <span className="flex h-2 w-2 rounded-full bg-blue-600" />
                        )}
                      </div>
                      {/* Account badge for multi-account mode */}
                      {(item as any).accountEmail && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                          {(item as any).accountEmail.split('@')[0]}
                        </span>
                      )}
                      <div
                        className={cn(
                          "ml-auto text-xs",
                          mail.selected === item.id
                            ? "text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {formatDistanceToNow(new Date(item.date), {
                          addSuffix: true,
                        })}
                      </div>
                    </div>
                    <div className="text-xs font-medium">{item.subject}</div>
                  </div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">
                    {(String((item as any).text ?? (item as any).snippet ?? '')).substring(0, 300)}
                  </div>
                </div>
              </div>
            ))}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function getBadgeVariantFromLabel(
  label: string
): ComponentProps<typeof Badge>["variant"] {
  if (["work"].includes(label.toLowerCase())) {
    return "default"
  }

  if (["personal"].includes(label.toLowerCase())) {
    return "outline"
  }

  return "secondary"
}