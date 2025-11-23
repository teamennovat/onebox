"use client"

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { buttonVariants } from '@/components/ui/button'
import { Tag } from 'lucide-react'

interface CustomLabel {
  id: string
  name: string
  color: string
  sort_order: number
}

interface LabelWithCount extends CustomLabel {
  count: number
}

interface CustomLabelsProps {
  emailAccountId?: string
  grantId?: string
  onLabelSelect?: (labelId: string, labelName: string, emails: any[], labelColor: string) => void
  isCollapsed?: boolean
  isLoadingLabel?: boolean
  refreshTrigger?: number
  activeMailbox?: string
  onMailboxTypeChange?: (type: string) => void
}

export function CustomLabels({ 
  emailAccountId, 
  grantId, 
  onLabelSelect, 
  isCollapsed = false,
  isLoadingLabel = false,
  refreshTrigger = 0,
  activeMailbox,
  onMailboxTypeChange
}: CustomLabelsProps) {
  const [labels, setLabels] = useState<LabelWithCount[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    console.log('🏷️ CustomLabels: useEffect triggered with:', { grantId, emailAccountId, isAllAccounts: grantId === '__all_accounts__', refreshTrigger })

    let isMounted = true

    const fetchLabelsWithCounts = async () => {
      try {
        console.log('🏷️ CustomLabels: fetchLabelsWithCounts() START')
        setLoading(true)

        // For all-accounts mode, use the all-labels endpoint
        if (grantId === '__all_accounts__') {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          
          if (sessionError || !session?.user?.id) {
            console.error('❌ Failed to get auth session')
            setLoading(false)
            return
          }

          // Call the all-labels API endpoint
          const response = await fetch(`/api/accounts/all-labels?userId=${encodeURIComponent(session.user.id)}`)
          if (!response.ok) {
            console.error('❌ Error fetching all labels:', response.status)
            setLoading(false)
            return
          }

          const result = await response.json()
          const allLabels = result.data || []

          if (!isMounted) return

          console.log('✅ Fetched all labels:', allLabels?.length)
          console.log('📊 All labels with counts:', allLabels.map((l: any) => ({ name: l.name, count: l.count })))

          setLabels(allLabels || [])
          setLoading(false)
          return
        }

        // For single account mode, fetch from Supabase directly
        const { data: allLabels, error: labelsError } = await supabase
          .from('custom_labels')
          .select('id, name, color, sort_order')
          .order('sort_order', { ascending: true })

        if (!isMounted) return
        if (labelsError) {
          console.error('❌ Error fetching labels:', labelsError)
          return
        }

        console.log('✅ Fetched custom_labels:', allLabels?.length)

        // If no grantId provided, just show labels with 0 count
        if (!grantId || !emailAccountId) {
          console.log('⚠️ No grantId or emailAccountId, showing labels with 0 count')
          const labelsWithZeroCount = (allLabels || []).map(label => ({ ...label, count: 0 }))
          if (isMounted) {
            setLabels(labelsWithZeroCount)
          }
          setLoading(false)
          return
        }

        // For single account mode, fetch message counts from backend API
        const labelsWithCounts = await Promise.all(
          (allLabels || []).map(async (label: any) => {
            try {
              // Use the API endpoint to get message count for this label and account
              const response = await fetch(
                `/api/labels/${label.id}/emails?grantId=${encodeURIComponent(grantId)}&emailAccountId=${encodeURIComponent(emailAccountId)}`,
                { method: 'GET', credentials: 'include' }
              )

              const result = await response.json()
              const emails = result.data || []

              // For single account, just return the total count of messages with this label
              const count = emails.length

              console.log(`📊 Label "${label.name}": ${count} messages`)
              return { ...label, count }
            } catch (err) {
              console.error(`❌ Error fetching count for label ${label.id}:`, err)
              return { ...label, count: 0 }
            }
          })
        )

        console.log('📊 labelsWithCounts:', labelsWithCounts)

        if (isMounted) {
          setLabels(labelsWithCounts)
        }
      } catch (error) {
        console.error('❌ Error in fetchLabelsWithCounts:', error)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchLabelsWithCounts()

    return () => {
      isMounted = false
    }
  }, [grantId, emailAccountId, supabase, refreshTrigger])

  const handleLabelClick = async (label: LabelWithCount) => {
    try {
      // If no grantId, just update selection without fetching
      if (!grantId || !emailAccountId) {
        setSelectedLabelId(label.id)
        if (onMailboxTypeChange) {
          onMailboxTypeChange(`label:${label.id}`)
        }
        if (onLabelSelect) {
          onLabelSelect(label.id, label.name, [], label.color)
        }
        return
      }

      const response = await fetch(
        `/api/labels/${label.id}/emails?grantId=${encodeURIComponent(grantId)}&emailAccountId=${encodeURIComponent(emailAccountId)}`,
        {
          method: 'GET',
          credentials: 'include',
        }
      )

      const result = await response.json()
      const { data, success } = result
      const error = !success ? { message: result.error || 'Unknown error' } : null

      if (error) {
        console.error('❌ Error fetching labeled emails:', error)
        return
      }

      if (!data || data.length === 0) {
        console.warn('⚠️ No emails found for this label and grant_id combination', { labelId: label.id, grantId })
        setSelectedLabelId(label.id)
        if (onLabelSelect) {
          onLabelSelect(label.id, label.name, [], label.color)
        }
        if (onMailboxTypeChange) {
          onMailboxTypeChange(`label:${label.id}`)
        }
        return
      }

      console.log('✅ Fetched emails:', data.length, 'emails')

      // Transform to match email UI format
      const emails = (data || []).map((item: any) => ({
        id: item.message_id,
        name: item.mail_details?.from?.[0]?.name || item.mail_details?.from?.[0]?.email || 'Unknown',
        email: item.mail_details?.from?.[0]?.email || '',
        subject: item.mail_details?.subject || '(No subject)',
        text: item.mail_details?.html || item.mail_details?.body || item.mail_details?.snippet || '',
        html: item.mail_details?.html || item.mail_details?.body || undefined,
        thread_id: item.mail_details?.thread_id || undefined,
        reply_to_message_id: item.mail_details?.reply_to_message_id || undefined,
        attachments: item.mail_details?.attachments || [],
        date: (() => {
          const dateValue = item.mail_details?.date;
          if (!dateValue) return new Date().toISOString();
          // If it's already an ISO string, return it
          if (typeof dateValue === 'string') return dateValue;
          // If it's a Unix timestamp (number), convert to ISO
          if (typeof dateValue === 'number') return new Date(dateValue * 1000).toISOString();
          return new Date().toISOString();
        })(),
        read: !item.mail_details?.unread,
        labels: [label.name],
        messageId: item.message_id,
        grant_id: item.mail_details?.grant_id || grantId,
        labelId: label.id,
        emailAccountId: emailAccountId,
        mailDetails: item.mail_details,
      }))

      setSelectedLabelId(label.id)
      if (onLabelSelect) {
        onLabelSelect(label.id, label.name, emails, label.color)
      }
      if (onMailboxTypeChange) {
        onMailboxTypeChange(`label:${label.id}`)
      }
    } catch (error) {
      console.error('❌ Error in handleLabelClick:', error)
    }
  }

  // Generate light background color from label color
  const getLabelBgColor = (color: string, isSelected: boolean) => {
    if (!isSelected) return 'transparent'
    // Convert hex to RGB and apply opacity
    try {
      const hex = color.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, 0.2)`
    } catch (e) {
      return 'transparent'
    }
  }

  // Generate text color from label color
  const getLabelTextColor = (color: string, isSelected: boolean) => {
    if (!isSelected) return 'inherit'
    return color
  }

  if (labels.length === 0) {
    return null
  }

  return (
    <div className="group flex flex-col gap-4 py-2 data-[collapsed=true]:py-2">
      <div className="px-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Labels</h3>
        <nav className="grid gap-1 px-0 group-[[data-collapsed=true]]:justify-center group-[[data-collapsed=true]]:px-2">
          {labels.map((label) =>
            isCollapsed ? (
              // Collapsed state: icon only with tooltip
              <Tooltip key={label.id} delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "icon" }),
                      "h-9 w-9",
                      selectedLabelId === label.id && "bg-primary/20"
                    )}
                    onClick={() => handleLabelClick(label)}
                    title={label.name}
                  >
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="sr-only">{label.name}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="flex items-center gap-4">
                  {label.name}
                  <span className="ml-auto text-muted-foreground">
                    {label.count}
                  </span>
                </TooltipContent>
              </Tooltip>
            ) : (
              // Expanded state: icon + text + count (matching nav.tsx folder design)
              <button
                key={label.id}
                type="button"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "justify-start px-2 py-2",
                  selectedLabelId === label.id && "bg-primary/20"
                )}
                style={{
                  backgroundColor: selectedLabelId === label.id ? getLabelBgColor(label.color, true) : undefined,
                }}
                onClick={() => handleLabelClick(label)}
              >
                <div
                  className="w-3 h-3 rounded-full mr-2 flex-shrink-0"
                  style={{ backgroundColor: label.color }}
                />
                <span
                  className="truncate flex-1 text-left text-sm font-medium"
                  style={{
                    color: selectedLabelId === label.id ? getLabelTextColor(label.color, true) : undefined,
                  }}
                >
                  {label.name}
                </span>
                <span
                  className={cn(
                    "ml-auto text-xs font-medium",
                    selectedLabelId === label.id ? "font-semibold" : ""
                  )}
                  style={{
                    color: selectedLabelId === label.id ? getLabelTextColor(label.color, true) : "text-muted-foreground",
                  }}
                >
                  {label.count}
                </span>
              </button>
            )
          )}
        </nav>
      </div>
    </div>
  )
}


