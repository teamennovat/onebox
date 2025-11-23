import { addDays, addHours, format, nextSaturday } from "date-fns"
import dynamic from 'next/dynamic'
import { useState, useEffect, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  Archive,
  ArchiveX,
  Clock,
  Forward,
  MoreVertical,
  Reply,
  ReplyAll,
  Send,
  Star,
  Trash2,
  X,
  Zap,
  Check,
  Tag,
} from "lucide-react"

import '@/app/quill.css'
import { SummaryIcon } from './summary-icon'

// Dynamically import ReactQuill with no SSR
const ReactQuill = dynamic(
  async () => {
    const { default: RQ } = await import('react-quill-new')
    return function QuillWrapper({ value, onChange, modules, formats }: {
      value: string;
      onChange: (content: string) => void;
      modules: any;
      formats: string[];
    }) {
      return (
        <div className="quill-wrapper">
          <RQ
            theme="snow"
            value={value}
            onChange={onChange}
            modules={{
              ...modules,
              clipboard: {
                matchVisual: false
              }
            }}
            formats={formats}
          />
        </div>
      )
    }
  },
  {
    ssr: false,
    loading: () => <div className="h-64 w-full animate-pulse bg-muted" />
  }
)

import { DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"

import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Mail } from "./use-mail"
import { cn } from "@/lib/utils"

interface MailDisplayProps {
  mail: Mail | null
  // grant id of the currently selected/connected account (optional)
  selectedGrantId?: string | null
  setItems?: React.Dispatch<React.SetStateAction<Mail[]>>
  onFolderChange?: (opts?: { from?: string | null; to?: string | null }) => Promise<void> | void // callback to refresh folders after moves
  onForward?: (forwardData: { subject: string; body: string; attachments: Array<{ filename: string; content_type: string; size: number; id: string }> }) => void
  onLabelChange?: (data: { messageId: string; oldLabelId: string | null; newLabelId: string | null }) => void // callback when label changes to refresh lists
  nylasApiKey?: string // optional, for fetching thread data if needed
}

interface ReplyState {
  isOpen: boolean
  mode: 'reply' | 'replyAll' | 'forward'
  content: string
  draftId?: string | null
  quotedHtml?: string
}

// Type for thread messages/replies display
interface DisplayedMessage {
  id: string
  from: Array<{ name: string; email: string }>
  to: Array<{ name: string; email: string }>
  body: string
  date: number
  subject: string
  isOwn?: boolean // true if this is the current user's own message (to style differently)
}

export function MailDisplay({ mail, selectedGrantId, setItems, onFolderChange, onForward, onLabelChange, nylasApiKey }: MailDisplayProps) {
  const today = new Date()
  const [reply, setReply] = useState<ReplyState>({
    isOpen: false,
    mode: 'reply',
    content: '',
    draftId: null,
    quotedHtml: ''
  })
  const [threadMessages, setThreadMessages] = useState<DisplayedMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const autosaveRef = useRef<number | null>(null)

  // Use the email's actual grantId, not the selected one (which might be __all_accounts__)
  const actualGrantId = mail?.grantId || selectedGrantId

  // Fetch full thread when mail is selected
  useEffect(() => {
    if (!mail?.thread_id || !actualGrantId) {
      setThreadMessages([])
      return
    }

    const fetchThread = async () => {
      setLoadingThread(true)
      try {
        console.log('='.repeat(80))
        console.log('🔄 FETCHING THREAD DATA')
        console.log('='.repeat(80))
        console.log('📧 Email Info:', {
          id: mail.id,
          subject: mail.subject,
          from: mail.email,
          threadId: mail.thread_id,
          grantId: actualGrantId
        })
        
        const response = await fetch(
          `/api/messages/thread/${mail.thread_id}?grantId=${actualGrantId}`,
          { credentials: 'include' }
        )
        
        if (response.ok) {
          const data = await response.json()
          
          console.log('✅ THREAD FETCH SUCCESS')
          console.log('Thread Summary:', {
            totalMessages: data.message_count,
            messageIds: data.messages?.map((m: any) => m.id),
            replyCount: data.replies?.length || 0
          })
          
          console.log('📄 Original Message:', {
            id: data.original_message?.id,
            from: data.original_message?.from,
            subject: data.original_message?.subject,
            bodyPreview: data.original_message?.body?.substring(0, 100) + '...',
            date: data.original_message?.date
          })
          
          console.log('📤 All Messages in Thread:')
          data.messages?.forEach((msg: any, idx: number) => {
            console.log(`  [${idx + 1}/${data.messages.length}]`, {
              id: msg.id,
              from: msg.from,
              subject: msg.subject,
              bodyPreview: msg.body?.substring(0, 80) + '...',
              date: msg.date
            })
          })
          
          console.log('💬 Replies (excluding original):')
          const replyMessages = data.replies || []
          if (replyMessages.length === 0) {
            console.log('  No replies found')
          } else {
            replyMessages.forEach((reply: any, idx: number) => {
              console.log(`  [Reply ${idx + 1}/${replyMessages.length}]`, {
                id: reply.id,
                from: reply.from,
                subject: reply.subject,
                bodyPreview: reply.body?.substring(0, 80) + '...',
                date: reply.date
              })
            })
          }
          
          console.log('='.repeat(80))
          
          setThreadMessages(replyMessages)
        } else {
          console.warn('❌ Failed to fetch thread:', response.status)
          const errorText = await response.text()
          console.error('Error details:', errorText)
        }
      } catch (error) {
        console.error('❌ Error fetching thread:', error)
      } finally {
        setLoadingThread(false)
      }
    }

    fetchThread()
  }, [mail?.thread_id, actualGrantId, mail?.grantId])

    const updateReadStatus = async (messageId: string, unread: boolean) => {
    // Optimistic update: mark read = !unread locally so UI updates instantly.
    let rollback: Mail[] | null = null
    try {
      if (typeof setItems === 'function') {
        setItems((prev) => {
          rollback = prev
          return prev.map((m) => (m.id === messageId ? { ...m, read: !unread } : m))
        })
      }

      const params = new URLSearchParams()
      if (actualGrantId) params.set('grantId', String(actualGrantId))
      params.set('unread', String(unread))
      const url = `/api/messages/${messageId}/read?${params.toString()}`

      // include cookies so the server can validate the Supabase session
      console.debug('updateReadStatus request', { url, messageId, unread, grantId: actualGrantId })

      const response = await fetch(url, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      })

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '<no body>')
        console.error(`Failed to update message status: HTTP ${response.status}`, {
          messageId,
          grantId: actualGrantId,
          status: response.status,
          body: bodyText,
        })
        // rollback optimistic update if present
        if (rollback && typeof setItems === 'function') setItems(rollback)
        throw new Error(`Failed to update message status: ${response.status} ${bodyText}`)
      }
    } catch (error) {
      console.error('Error updating message status:', error)
    }
  }
    
  // Important is a system folder, no need to create it

  const [optimisticLabels, setOptimisticLabels] = useState([] as string[]);
  const [customLabels, setCustomLabels] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [appliedCustomLabels, setAppliedCustomLabels] = useState<Set<string>>(new Set());
  const [loadingLabels, setLoadingLabels] = useState(false);

  // Initialize Supabase browser client
  const supabase = useRef(createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )).current

  // Fetch available labels when mail is selected - use same approach as custom-labels.tsx
  useEffect(() => {
    const fetchLabels = async () => {
      if (!mail?.id) {
        setCustomLabels([])
        setAppliedCustomLabels(new Set())
        return
      }

      try {
        setLoadingLabels(true)

        // Fetch all custom labels from Supabase (same as custom-labels.tsx)
        const { data: allLabels, error: labelsError } = await supabase
          .from('custom_labels')
          .select('id, name, color, sort_order')
          .order('sort_order', { ascending: true })

        if (labelsError) {
          console.error('❌ Error fetching labels:', labelsError)
          setCustomLabels([])
          setAppliedCustomLabels(new Set())
          return
        }

        console.log('✅ Fetched custom_labels:', allLabels?.length)
        setCustomLabels(allLabels || [])

        // Fetch which labels are applied to this message
        const { data: appliedLabels, error: appliedError } = await supabase
          .from('message_custom_labels')
          .select('custom_label_id')
          .eq('message_id', mail.id)

        if (appliedError) {
          console.error('❌ Error fetching applied labels:', appliedError)
          setAppliedCustomLabels(new Set())
        } else {
          const labelIds = new Set((appliedLabels || []).map((item: any) => item.custom_label_id))
          console.log('✅ Applied labels:', Array.from(labelIds))
          setAppliedCustomLabels(labelIds)
        }
      } catch (error) {
        console.error('❌ Error fetching labels:', error)
        setCustomLabels([])
        setAppliedCustomLabels(new Set())
      } finally {
        setLoadingLabels(false)
      }
    }

    if (mail) {
      fetchLabels()
    }
  }, [mail?.id, supabase])
  
  const handleFolderAction = async (messageId: string, destination: string) => {
    if (!mail) return;
    
    // Get current folder for comparison
    const currentFolder = mail.labels?.[0]?.toLowerCase() || 'inbox';
    
    // Optimistic update for header (using state to trigger re-render)
    const newLabels = destination === 'inbox' ? [] : [destination];
    setOptimisticLabels(newLabels);

    // Store original labels for rollback
    const originalMailLabels = [...(mail.labels || [])];
    mail.labels = newLabels;

    // Update list component if available
    if (setItems) {
      if (destination !== currentFolder) {
        // Remove from current view if moving to different folder
        setItems(prev => prev.filter(m => m.id !== messageId));
      } else {
        // Update labels if staying in same folder
        setItems(prev => prev.map(m => m.id === messageId ? { ...m, labels: newLabels } : m));
      }
    }

    // Immediately update folder counts
    onFolderChange?.({ from: currentFolder, to: destination });

    // Important is a system folder, no creation needed

    // Optimistic update for list
    let rollback: Mail[] | null = null
    try {
      if (typeof setItems === 'function') {
        setItems((prev) => {
          rollback = prev
          return prev.map((m) =>
            m.id === messageId ? { ...m, labels: newLabels } as Mail : m
          )
        })
      }

  const params = new URLSearchParams()
  if (actualGrantId) params.set('grantId', String(actualGrantId))
  // include destination and messageId as query params (defensive)
  params.set('destination', destination)
  params.set('messageId', messageId)
  const url = `/api/messages/${messageId}/move?${params.toString()}`

      console.debug('handleFolderAction request', { url, messageId, destination, grantId: actualGrantId })

      // include messageId and grantId in the body as a defensive fallback
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ destination, messageId, grantId: actualGrantId ?? null })
      })

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '<no body>')
        console.error(`Failed to move message: HTTP ${response.status}`, {
          messageId,
          destination,
          grantId: actualGrantId,
          status: response.status,
          body: bodyText,
        })

        // Check for rate limit error
        try {
          const errorData = JSON.parse(bodyText)
          if (errorData.error?.type === 'rate_limit_error' || 
              errorData.error?.provider_error?.error?.code === 403) {
            // Roll back the move UI
            if (rollback && typeof setItems === 'function') setItems(rollback)
            throw new Error('Too many requests. Please wait a minute before moving more messages.')
          }
        } catch (e) {
          // Not a JSON error or not a rate limit error
        }

        // rollback both optimistic updates
        if (rollback && typeof setItems === 'function') setItems(rollback)
        if (mail) {
          mail.labels = originalMailLabels; // rollback header update
          setOptimisticLabels(originalMailLabels);
        }
        throw new Error(`Failed to move message: ${response.status} ${bodyText}`)
      }

      // On success, remove the message from the list and refresh folders
      if (typeof setItems === 'function') {
        setItems((prev) => prev.filter((m) => m.id !== messageId))
      }
      // Optimistically update sidebar counts (do not await)
      try {
        onFolderChange?.({ from: originalMailLabels?.[0] ?? undefined, to: destination })
      } catch (e) {
        // swallow — the parent will refresh folders in background
        console.debug('onFolderChange handler error (ignored)', e)
      }
    } catch (error) {
      console.error('Error moving message:', error)
      alert('Failed to move message. Please try again.')
    }
  }

  const handleCustomLabelAction = async (labelId: string) => {
    if (!mail) return;

    const isCurrentLabel = appliedCustomLabels.has(labelId)
    
    // Don't allow toggle off - must select a different label
    if (isCurrentLabel) {
      console.log(`⚠️ Label already applied, skipping (user must select a different label)`)
      return
    }

    console.log(`🏷️ Label action: changing to label ${labelId} on message ${mail.id}`, { isCurrentLabel })

    // Get the old label to remove
    const oldLabelId = Array.from(appliedCustomLabels)[0] || null

    // Optimistic update: remove old label, add new label
    const newAppliedLabels = new Set<string>()
    newAppliedLabels.add(labelId)
    setAppliedCustomLabels(newAppliedLabels)

    try {
      // Step 1: Remove old label if it exists
      if (oldLabelId) {
        console.log(`🗑️ Removing old label:`, oldLabelId)
        const { error: deleteError } = await supabase
          .from('message_custom_labels')
          .delete()
          .eq('message_id', mail.id)
          .eq('custom_label_id', oldLabelId)
          .eq('email_account_id', mail.emailAccountId)

        if (deleteError) {
          console.error('❌ Error removing old label:', deleteError)
          setAppliedCustomLabels(appliedCustomLabels)
          alert(`Failed to remove previous label: ${deleteError.message}`)
          return
        }
        console.log(`✅ Old label removed:`, oldLabelId)
      }

      // Step 2: Add new label
      console.log(`➕ Adding new label:`, labelId)
      const { error: insertError } = await supabase
        .from('message_custom_labels')
        .insert({
          message_id: mail.id,
          custom_label_id: labelId,
          email_account_id: mail.emailAccountId,
          applied_at: new Date().toISOString(),
          applied_by: mail.grant_id ? [mail.grant_id] : null,
          mail_details: {
            subject: mail.subject,
            from: mail.from || [{ email: mail.email, name: mail.name }],
            to: mail.to,
            cc: mail.cc,
            bcc: mail.bcc,
            reply_to: mail.reply_to,
            snippet: mail.text?.substring(0, 200),
            body: mail.body || mail.text,
            html: mail.html,
            date: mail.date,
            thread_id: mail.thread_id,
            folders: mail.labels,
            unread: !mail.read,
            grant_id: mail.grant_id,
            attachments: mail.attachments,
          }
        })
        .select()

      if (insertError) {
        console.error('❌ Error adding new label:', insertError)
        // Rollback to old label state
        if (oldLabelId) {
          setAppliedCustomLabels(new Set([oldLabelId]))
        } else {
          setAppliedCustomLabels(new Set())
        }
        alert(`Failed to add label: ${insertError.message}`)
        return
      }
      console.log(`✅ New label added:`, labelId)

      // Step 3: Trigger callback to refresh email lists
      if (onLabelChange) {
        console.log(`📢 Triggering onLabelChange callback`, { messageId: mail.id, oldLabelId, newLabelId: labelId })
        onLabelChange({
          messageId: mail.id,
          oldLabelId: oldLabelId,
          newLabelId: labelId
        })
      }
    } catch (error) {
      console.error('❌ Error updating label:', error)
      // Rollback to old label state
      if (oldLabelId) {
        setAppliedCustomLabels(new Set([oldLabelId]))
      } else {
        setAppliedCustomLabels(new Set())
      }
      alert('Failed to update label. Please try again.')
    }
  }

    const handleReply = (mode: ReplyState['mode']) => {
      if (!mail) return;

      if (mode === 'forward') {
        // For forward, call the parent callback to open compose drawer with pre-filled content
        if (onForward) {
          onForward({
            subject: mail.subject,
            body: mail.html || mail.text,
            attachments: (mail.attachments || []).map(att => ({
              filename: att.filename || 'attachment',
              content_type: att.content_type || 'application/octet-stream',
              size: att.size || 0,
              id: att.id || ''
            }))
          });
          // Open compose drawer by setting isComposeOpen to true (handled by parent)
        }
        return;
      }

      // Reply or Reply All
      const originalDate = mail.date ? format(new Date(mail.date), "PPpp") : 'unknown date';
      const quotedContent = `
      <blockquote style="border-left: 2px solid #ccc; padding-left: 1rem; color: #666; margin-top:1rem;">
        On ${originalDate}, ${mail.name} wrote:<br/>
        ${mail.html || mail.text}
      </blockquote>
    `;
      setReply(prev => ({
        ...prev,
        isOpen: true,
        mode,
        content: '',
        quotedHtml: quotedContent,
        draftId: null
      }));
    }

  function sanitizeHtml(html?: string) {
    if (!html) return ""
    // Remove script/style tags
    let out = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    // Strip on* attributes (onclick, onerror, etc.)
    out = out.replace(/ on[a-z]+=(\".*?\"|'.*?'|[^\s>]+)/gi, "")
    return out
  }

  // send the reply. if closeAfter === true, close editor after send
  const handleSendReply = async (closeAfter = true) => {
    if (!mail) return;

    try {
      if (reply.mode === 'forward') {
        // Forward: send as a new message (not a reply)
        // Extract recipient from reply content or prompt user
        const toMatch = reply.content.match(/^To:\s*(.+?)(?:\n|$)/i);
        const to = toMatch ? toMatch[1].trim() : '';
        
        if (!to) {
          alert('Please specify a recipient (add "To: email@example.com" at top or use proper recipient field)');
          return;
        }

        const bodyPayload: any = {
          messageId: mail.id,
          forwardBody: reply.content,
          forwardTo: to,
          mode: 'forward'
        };
        if (selectedGrantId) bodyPayload.grantId = selectedGrantId;

        const response = await fetch('/api/messages/forward', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(bodyPayload),
        });

        if (!response.ok) {
          let details = '';
          try {
            const json = await response.json();
            details = json?.error || json?.message || JSON.stringify(json);
          } catch (e) {
            details = await response.text().catch(() => '');
          }
          throw new Error(details || 'Failed to send forward');
        }

        if (closeAfter) {
          setReply({ isOpen: false, mode: 'reply', content: '', draftId: null, quotedHtml: '' });
        }
      } else {
        // Regular reply or reply-all
        // Send as query parameters instead of body
        const params = new URLSearchParams();
        params.set('messageId', mail.id);
        params.set('replyBody', reply.content);
        if (selectedGrantId) params.set('grantId', String(selectedGrantId));
        if (reply.draftId) params.set('draftId', String(reply.draftId));
        // IMPORTANT: Include threadId so Nylas can properly thread the reply
        if (mail.thread_id) params.set('threadId', String(mail.thread_id));

        console.log('📤 SENDING REPLY', {
          messageId: mail.id,
          threadId: mail.thread_id,
          subject: mail.subject?.substring(0, 50),
          replyBodyPreview: reply.content.substring(0, 100),
          grantId: selectedGrantId
        });

        const response = await fetch(`/api/messages/reply?${params.toString()}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          let details = '';
          try {
            const json = await response.json();
            details = json?.error || json?.message || JSON.stringify(json);
          } catch (e) {
            details = await response.text().catch(() => '');
          }
          throw new Error(details || 'Failed to send reply');
        }

        const responseData = await response.json();
        
        // If successful, add the sent reply to the thread display immediately
        if (responseData?.data) {
          const sentMessage = responseData.data;
          setThreadMessages(prev => [...prev, {
            id: sentMessage.id,
            from: sentMessage.from || [],
            to: sentMessage.to || [],
            body: sentMessage.body || '',
            date: sentMessage.date || Date.now() / 1000,
            subject: sentMessage.subject || '',
            isOwn: true // Mark as own message for styling
          }]);
        }

        if (closeAfter) {
          setReply({ isOpen: false, mode: 'reply', content: '', draftId: null, quotedHtml: '' });
        }
      }
    } catch (error) {
      console.error('Error sending reply/forward:', error);
      alert('Failed to send reply/forward. Please try again.');
    }
  }

  return (
    <div className="flex h-full flex-col bg-background shadow-lg">
      <div className="flex items-center p-2">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                disabled={!mail}
                onClick={() => mail?.id && handleFolderAction(mail.id, (optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('important') ? 'inbox' : 'important')}
              >
                {(optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('important') ? (
                  <ArchiveX className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                <span className="sr-only">
                  {(optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('important') ? 'Move to Inbox' : 'Mark as Important'}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {(optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('important') ? 'Move to Inbox' : 'Mark as Important'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                disabled={!mail}
                onClick={() => mail?.id && handleFolderAction(mail.id, (optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('star') ? 'inbox' : 'starred')}
              >
                <Star 
                  className={cn(
                    "h-4 w-4",
                    (optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('star') && "fill-yellow-400 text-yellow-400"
                  )}
                />
                <span className="sr-only">
                  {(optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('star') ? 'Remove star' : 'Star'}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {(optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('star') ? 'Remove star' : 'Star'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                disabled={!mail}
                onClick={() => mail?.id && handleFolderAction(mail.id, (optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('spam') ? 'inbox' : 'spam')}
              >
                {(optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('spam') ? (
                  <ArchiveX className="h-4 w-4" />
                ) : (
                  <ArchiveX className="h-4 w-4 rotate-45" />
                )}
                <span className="sr-only">
                  {(optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('spam') ? 'Not spam' : 'Mark as spam'}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {(optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('spam') ? 'Not spam' : 'Mark as spam'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                disabled={!mail}
                onClick={() => mail?.id && handleFolderAction(mail.id, (optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('trash') ? 'inbox' : 'trash')}
              >
                {(optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('trash') ? (
                  <ArchiveX className="h-4 w-4" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span className="sr-only">
                  {(optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('trash') ? 'Restore from trash' : 'Move to trash'}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {(optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('trash') ? 'Restore from trash' : 'Move to trash'}
            </TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="mx-1 h-6" />
          {mail && <SummaryIcon email={mail} />}


          
          <Tooltip>
            <Popover>
              <PopoverTrigger asChild>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" disabled={!mail}>
                    <Clock className="h-4 w-4" />
                    <span className="sr-only">Snooze</span>
                  </Button>
                </TooltipTrigger>
              </PopoverTrigger>
              <PopoverContent className="flex w-[535px] p-0">
                <div className="flex flex-col gap-2 border-r px-2 py-4">
                  <div className="px-4 text-sm font-medium">Snooze until</div>
                  <div className="grid min-w-[250px] gap-1">
                    <Button
                      variant="ghost"
                      className="justify-start font-normal"
                    >
                      Later today{" "}
                      <span className="ml-auto text-muted-foreground">
                        {format(addHours(today, 4), "E, h:m b")}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start font-normal"
                    >
                      Tomorrow
                      <span className="ml-auto text-muted-foreground">
                        {format(addDays(today, 1), "E, h:m b")}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start font-normal"
                    >
                      This weekend
                      <span className="ml-auto text-muted-foreground">
                        {format(nextSaturday(today), "E, h:m b")}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start font-normal"
                    >
                      Next week
                      <span className="ml-auto text-muted-foreground">
                        {format(addDays(today, 7), "E, h:m b")}
                      </span>
                    </Button>
                  </div>
                </div>
                <div className="p-2">
                  <Calendar />
                </div>
              </PopoverContent>
            </Popover>
            <TooltipContent>Snooze</TooltipContent>
          </Tooltip>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!mail} onClick={() => handleReply('reply')}>
                <Reply className="h-4 w-4" />
                <span className="sr-only">Reply</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reply</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!mail} onClick={() => handleReply('replyAll')}>
                <ReplyAll className="h-4 w-4" />
                <span className="sr-only">Reply all</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reply all</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!mail} onClick={() => handleReply('forward')}>
                <Forward className="h-4 w-4" />
                <span className="sr-only">Forward</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Forward</TooltipContent>
          </Tooltip>
        </div>
        <Separator orientation="vertical" className="mx-2 h-6" />
        
        {/* Labels Dropdown */}
        {customLabels.length > 0 && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-9 px-3">
                  <Tag className="h-4 w-4 mr-2" />
                  Labels
                  {appliedCustomLabels.size > 0 && (
                    <span className="ml-2 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                      {appliedCustomLabels.size}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {customLabels.map((label) => (
                  <DropdownMenuItem
                    key={label.id}
                    onClick={() => {
                      handleCustomLabelAction(label.id)
                    }}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center gap-2 w-full">
                      {appliedCustomLabels.has(label.id) && (
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      )}
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="flex-1">{label.name}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Separator orientation="vertical" className="mx-2 h-6" />
          </>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={!mail}>
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => mail?.id && updateReadStatus(mail.id, true)}>
                Mark as unread
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => {
                  const isStarred = (optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('star');
                  if (mail?.id) {
                    handleFolderAction(mail.id, isStarred ? 'inbox' : 'starred');
                  }
                }}
              >
                {(optimisticLabels || mail?.labels)?.map(String).join(' ').toLowerCase().includes('star') ? 'Remove star' : 'Star thread'}
              </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Separator />

      {mail ? (
        <ScrollArea className="h-full">
          {/* Scrollable area for email content and attachments */}
          <div className="flex-1">
            <div className="flex items-start p-4">
              <div className="flex items-start gap-4 text-sm">
                <Avatar>
                  <AvatarImage alt={mail.name} />
                  <AvatarFallback>
                    {mail.name
                      .split(" ")
                      .map((chunk) => chunk[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{mail.name}</div>
                    {/* Account badge for multi-account emails */}
                    {(mail as any).accountEmail && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        {(mail as any).accountEmail.split('@')[0]}
                      </span>
                    )}
                  </div>
                  <div className="line-clamp-1 text-xs">{mail.subject}</div>
                  <div className="line-clamp-1 text-xs">
                    <span className="font-medium">Reply-To:</span> {mail.email}
                  </div>
                </div>
              </div>
              {mail.date && (
                <div className="ml-auto text-xs text-muted-foreground">
                  {format(new Date(mail.date), "PPpp")}
                </div>
              )}
            </div>
            <Separator />

            <div className="flex-1 text-sm p-4">
              {mail.html ? (
                // render html safely after light sanitization
                <div
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: replaceInlineImages(sanitizeHtml(mail.html)) }}
                />
              ) : (
                <div className="whitespace-pre-wrap">{mail.text}</div>
              )}
            </div>

            {mail.attachments && mail.attachments.length > 0 && (
              <div className="p-4">
                <div className="text-sm font-medium">Attachments</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {mail.attachments.map((att) => (
                    <div
                      key={att.id || att.filename}
                      className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
                    >
                      <div className="h-6 w-6 overflow-hidden rounded">
                        {/* If inline and content_id available we indicate that — actual inline rendering requires attachment data */}
                        {att.is_inline ? (
                          <div className="h-6 w-6 bg-muted-foreground/10 flex items-center justify-center text-xs">
                            img
                          </div>
                        ) : (
                          <div className="h-6 w-6 bg-muted-foreground/10 flex items-center justify-center text-xs">
                            file
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">{att.filename}</span>
                        <span className="text-xs text-muted-foreground">
                          {att.is_inline ? "inline" : "attachment"} • {att.size ?? "-"} bytes
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadAttachment(att.id ?? "", mail.id ?? "")}
                      >
                        Download
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Thread messages/replies display - only show if there are multiple messages in the thread */}
            {threadMessages && threadMessages.length > 0 && (
              <div className="border-t p-4 bg-slate-50">
                <div className="text-sm font-medium mb-4 flex items-center gap-2">
                  <span>Replies</span>
                  <span className="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded">{threadMessages.length}</span>
                </div>
                <div className="space-y-4">
                  {threadMessages.map((msg, index) => (
                    <div key={msg.id} className={cn(
                      "rounded-lg border p-3 bg-white",
                      msg.isOwn ? "border-blue-200 bg-blue-50" : "border-slate-200"
                    )}>
                      <div className="flex items-start gap-3">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarImage alt={msg.from[0]?.name || msg.from[0]?.email} />
                          <AvatarFallback className="text-xs">
                            {msg.from[0]?.name?.split(" ").map((n) => n[0]).join("") || msg.from[0]?.email?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{msg.from[0]?.name || msg.from[0]?.email}</span>
                            <span className="text-xs text-muted-foreground">&lt;{msg.from[0]?.email}&gt;</span>
                            {msg.isOwn && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">You</span>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {format(new Date(msg.date * 1000), "PPpp")}
                          </div>
                          <div className="mt-2 text-sm">
                            <div
                              className="prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.body) }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prominent Reply/Forward buttons below content */}
            <div className="flex gap-2 p-4 border-t bg-background">
              <Button
                variant="default"
                size="sm"
                disabled={!mail}
                onClick={() => handleReply('reply')}
              >
                <Reply className="mr-2 h-4 w-4" /> Reply
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!mail}
                onClick={() => handleReply('replyAll')}
              >
                <ReplyAll className="mr-2 h-4 w-4" /> Reply All
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!mail}
                onClick={() => handleReply('forward')}
              >
                <Forward className="mr-2 h-4 w-4" /> Forward
              </Button>
            </div>

            {/* Reply editor (placed below reply buttons, above quoted highlight) */}
            {reply.isOpen && (
              <div className="border-t p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">
                    {reply.mode === 'forward' ? 'Forward' : reply.mode === 'replyAll' ? 'Reply All' : 'Reply'}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReply({ isOpen: false, mode: 'reply', content: '', draftId: null, quotedHtml: '' })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="min-h-[260px] border rounded-md overflow-hidden mb-2">
                  <ReactQuill
                    value={reply.content}
                    onChange={(content: string) => setReply(prev => ({ ...prev, content }))}
                    modules={{
                      toolbar: [
                        [{ 'font': [] }, { 'size': [] }],
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike', 'blockquote', 'code-block'],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        [{ 'indent': '-1' }, { 'indent': '+1' }],
                        [{ 'align': [] }],
                        ['link', 'image', 'video'],
                        ['clean']
                      ],
                      clipboard: { matchVisual: false }
                    }}
                    formats={[
                      'header', 'font', 'size',
                      'bold', 'italic', 'underline', 'strike', 'blockquote', 'code-block',
                      'color', 'background',
                      'list', 'link', 'image', 'video', 'align', 'indent'
                    ]}
                  />
                </div>

                {/* Controls: AI prompt popover (left) and Send + Cancel (right) */}
                <div className="flex justify-between items-center">
                  <div>
                    <AIReplyPopover 
                      mail={mail}
                      onReplyGenerated={(result: { subject?: string; body: string }) => setReply(prev => ({ ...prev, content: result.body }))}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button onClick={() => void handleSendReply(false)}>
                      <Send className="mr-2 h-4 w-4" />
                      Send
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setReply({ isOpen: false, mode: 'reply', content: '', draftId: null, quotedHtml: '' })}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </ScrollArea>
      ) : (
        <div className="p-8 text-center text-muted-foreground">
          No message selected
        </div>
      )}
    </div>
  )

  // Download attachment logic
  async function downloadAttachment(attachmentId: string, messageId: string) {
    try {
      // URL encode the attachment ID to handle special characters
      const encodedAttachmentId = encodeURIComponent(attachmentId);
      // Include grantId and messageId in query params
      let url = `/api/attachments/${encodedAttachmentId}?messageId=${messageId}`;
      if (selectedGrantId) {
        url += `&grantId=${encodeURIComponent(selectedGrantId)}`;
      }
      
      console.log('📥 DOWNLOADING ATTACHMENT', {
        attachmentId: attachmentId.substring(0, 50),
        messageId,
        grantId: selectedGrantId,
        url: url.substring(0, 100)
      });
      
      const response = await fetch(url, {
        credentials: 'include' // Include cookies for authentication
      });
      
      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const error = await response.json();
          errorMessage = `${error.error}: ${error.details}`;
          console.error("Full error details:", error);
        } else {
          errorMessage = await response.text();
        }
        throw new Error(errorMessage);
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      
      // Get filename from attachment ID or Content-Disposition
      let filename = 'attachment';
      try {
        const parts = attachmentId.split(':');
        if (parts.length > 1) {
          filename = atob(parts[1]); // Decode base64 filename
        } else {
          const contentDisposition = response.headers.get('content-disposition');
          if (contentDisposition) {
            const match = contentDisposition.match(/filename="([^"]+)"/);
            if (match) filename = match[1];
          }
        }
      } catch (e) {
        console.warn('Could not parse filename:', e);
      }
      
      // Create and trigger download
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      
    } catch (error) {
      console.error('Error downloading attachment:', error);
      alert(`Failed to download attachment: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Save (create/update) draft for the current reply. Returns draftId when saved.
  async function saveDraft() {
    if (!mail) return null
    try {
      const resp = await fetch('/api/messages/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: mail.id,
          draftId: reply.draftId ?? null,
          body: reply.content
        })
      })
      if (!resp.ok) {
        console.warn('Draft save failed', await resp.text())
        return null
      }
      const data = await resp.json()
      if (data?.draftId) {
        setReply(prev => ({ ...prev, draftId: data.draftId }))
        return data.draftId
      }
      return null
    } catch (e) {
      console.error('Error saving draft', e)
      return null
    }
  }

  // Autosave on content change with debounce
  useEffect(() => {
    if (!reply.isOpen) return
    // clear existing timer
    if (autosaveRef.current) {
      window.clearTimeout(autosaveRef.current)
    }
    // schedule a save in 1.2s
    autosaveRef.current = window.setTimeout(() => {
      void saveDraft()
    }, 1200)

    return () => {
      if (autosaveRef.current) window.clearTimeout(autosaveRef.current)
    }
  }, [reply.content, reply.isOpen])

  // Function to handle inline images by replacing cid: URLs with actual attachment URLs
  function replaceInlineImages(html: string): string {
    return html.replace(
      /src=["']cid:([^"']+)["']/g,
      (match, cid) => {
        const inlineAtt = mail?.attachments?.find(
          att => att.content_id === cid || att.filename === cid
        );
        if (inlineAtt?.id && mail?.id) {
          const encAtt = encodeURIComponent(inlineAtt.id)
          const encMsg = encodeURIComponent(mail.id)
          return `src="/api/attachments/${encAtt}?messageId=${encMsg}"`;
        }
        return match;
      }
    );
  }
}

// AI Reply Popover Component
function AIReplyPopover({ mail, onReplyGenerated }: { mail: Mail | null; onReplyGenerated: (result: { subject?: string; body: string }) => void }) {
  const [aiPrompt, setAiPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const { useToast } = require('@/hooks/use-toast')
  const { toast } = useToast()

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || !mail) {
      toast({ title: 'Error', description: 'Please enter a prompt', variant: 'destructive' })
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch('/api/ai/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          prompt: aiPrompt,
          emailContext: `From: ${mail.email}\nSubject: ${mail.subject}\n\n${mail.text || mail.html}`
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('AI reply API error:', { status: response.status, statusText: response.statusText, body: errorText })
        throw new Error(`Failed to generate reply: ${response.status} ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('No response stream')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let rawDeltaAccumulator = '' // Accumulate all delta content as raw string

      function findNested(obj: any, key: string): any {
        if (!obj || typeof obj !== 'object') return undefined
        if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key]
        for (const k of Object.keys(obj)) {
          try {
            const res = findNested(obj[k], key)
            if (res !== undefined) return res
          } catch (_) {}
        }
        return undefined
      }

      // Extract JSON object from raw text (handle code fences)
      function extractJsonFromText(text: string): any {
        if (!text) return null
        // Remove code fences
        const noFence = text.replace(/```(?:json)?\s*\n?/gi, '').trim()
        // Try to find complete JSON object
        const match = noFence.match(/\{[\s\S]*\}/)
        if (!match) return null
        try {
          return JSON.parse(match[0])
        } catch {
          return null
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk

        const lines = buffer.split('\n')
        buffer = lines[lines.length - 1]

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim()
          if (!line || !line.startsWith('data: ')) continue

          const payload = line.replace('data: ', '').trim()
          if (payload === '[DONE]') {
            // Stream ended - try to parse accumulated delta as JSON
            console.debug('Reply: Stream ended. Total accumulated text:', rawDeltaAccumulator.length)
            console.debug('Reply: First 300 chars:', rawDeltaAccumulator.slice(0, 300))

            try {
              const parsed = extractJsonFromText(rawDeltaAccumulator)
              if (parsed) {
                console.debug('Reply: Successfully extracted JSON:', JSON.stringify(parsed).slice(0, 300))

                // Look for nested response or direct properties
                const response = parsed?.response || parsed
                const mailContent = response?.mailContent || findNested(parsed, 'mailContent') || ''
                const subjectVal = response?.Subject || findNested(parsed, 'Subject') || ''

                console.debug('Reply: Extracted subject:', subjectVal.slice(0, 60))
                console.debug('Reply: Extracted mailContent:', mailContent.slice(0, 100))

                if (mailContent) {
                  const htmlContent = String(mailContent)
                    .trim()
                    .split(/\r?\n\s*\r?\n+/)
                    .map((p) => '<p>' + p.trim().replace(/\r?\n/g, '<br>') + '</p>')
                    .join('')

                  onReplyGenerated({ subject: subjectVal, body: htmlContent })
                  console.log('✅ AI reply: Successfully set body')
                  setAiPrompt('')
                  toast({ title: 'Reply Generated', description: 'AI has composed your reply' })
                  setIsGenerating(false)
                  return
                }
              }
            } catch (e) {
              console.error('Reply: Failed to parse accumulated delta as JSON:', e)
            }

            // If we couldn't parse JSON, show error
            toast({
              title: 'Error',
              description: 'Could not parse AI response. Please try again.',
              variant: 'destructive'
            })
            setIsGenerating(false)
            return
          }

          // Parse SSE line as JSON to extract delta content
          try {
            const obj = JSON.parse(payload)
            const deltaContent = obj?.choices?.[0]?.delta?.content
            if (deltaContent) {
              // Accumulate ALL delta content, including whitespace and brackets
              rawDeltaAccumulator += deltaContent
              console.debug(`Reply: Added delta: "${deltaContent.slice(0, 20)}"... (total: ${rawDeltaAccumulator.length})`)
            }
          } catch (e) {
            // Skip lines that aren't valid JSON
            console.debug('Reply: Skipped invalid JSON line')
          }
        }
      }

      // Stream ended without [DONE]
      console.warn('Reply: Stream ended without [DONE] signal')
      console.debug('Reply: Accumulated text:', rawDeltaAccumulator.slice(0, 300))

      // Try to parse what we have
      try {
        const parsed = extractJsonFromText(rawDeltaAccumulator)
        if (parsed) {
          const response = parsed?.response || parsed
          const mailContent = response?.mailContent || findNested(parsed, 'mailContent') || ''
          const subjectVal = response?.Subject || findNested(parsed, 'Subject') || ''

          if (mailContent) {
            const htmlContent = String(mailContent)
              .trim()
              .split(/\r?\n\s*\r?\n+/)
              .map((p) => '<p>' + p.trim().replace(/\r?\n/g, '<br>') + '</p>')
              .join('')

            onReplyGenerated({ subject: subjectVal, body: htmlContent })
            console.log('✅ AI reply: Successfully set body (fallback)')
            setAiPrompt('')
            toast({ title: 'Reply Generated', description: 'AI has composed your reply' })
            setIsGenerating(false)
            return
          }
        }
      } catch (e) {
        console.error('Reply: Fallback parse failed:', e)
      }

      // Complete failure - no JSON could be parsed
      console.error('Reply: Could not parse any JSON from AI response')
      console.debug('Reply: Accumulated delta (first 500 chars):', rawDeltaAccumulator.slice(0, 500))
      toast({
        title: 'Error',
        description: 'Could not parse AI response. Please try again.',
        variant: 'destructive'
      })
      setIsGenerating(false)
    } catch (error) {
      console.error('Error generating reply:', error)
      toast({ title: 'Error', description: 'Failed to generate reply', variant: 'destructive' })
      setIsGenerating(false)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" title="AI Reply">
          <Zap className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px]">
        <div className="flex flex-col gap-3">
          <Label className="text-sm font-medium">AI Reply Prompt</Label>
          <div className="text-xs text-muted-foreground">
            Describe how you want to reply to this email
          </div>
          <textarea
            className="w-full rounded border p-2 text-sm resize-none"
            rows={4}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            disabled={isGenerating}
            placeholder="E.g., Politely agree with their proposal and suggest next Tuesday for a meeting"
          />
          
          {/* Suggestion Prompts */}
          <div className="flex flex-col gap-2 pt-2 border-t">
            <div className="text-xs font-medium text-muted-foreground">Quick suggestions:</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAiPrompt("Reply to the email politely and professionally")}
                disabled={isGenerating}
                className="text-xs px-3 py-2 rounded border border-input bg-background hover:bg-accent disabled:opacity-50 text-left"
              >
                Reply politely
              </button>
              <button
                onClick={() => setAiPrompt("Thank them for the reminder")}
                disabled={isGenerating}
                className="text-xs px-3 py-2 rounded border border-input bg-background hover:bg-accent disabled:opacity-50 text-left"
              >
                Thanks reminder
              </button>
              <button
                onClick={() => setAiPrompt("Agree with their proposal and suggest meeting next week")}
                disabled={isGenerating}
                className="text-xs px-3 py-2 rounded border border-input bg-background hover:bg-accent disabled:opacity-50 text-left"
              >
                Agree & meet
              </button>
              <button
                onClick={() => setAiPrompt("Politely decline their request with a brief reason")}
                disabled={isGenerating}
                className="text-xs px-3 py-2 rounded border border-input bg-background hover:bg-accent disabled:opacity-50 text-left"
              >
                Polite decline
              </button>
              <button
                onClick={() => setAiPrompt("Acknowledge their message and ask for clarification")}
                disabled={isGenerating}
                className="text-xs px-3 py-2 rounded border border-input bg-background hover:bg-accent disabled:opacity-50 text-left"
              >
                Ask clarification
              </button>
              <button
                onClick={() => setAiPrompt("Express urgency and request immediate action")}
                disabled={isGenerating}
                className="text-xs px-3 py-2 rounded border border-input bg-background hover:bg-accent disabled:opacity-50 text-left"
              >
                Urgent action
              </button>
            </div>
          </div>

          <Button 
            size="sm"
            onClick={handleAiGenerate}
            disabled={isGenerating || !aiPrompt.trim()}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Clock className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Generate Reply
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}