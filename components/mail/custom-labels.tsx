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
  onLabelSelect?: (labelId: string, labelName: string, emails: any[], labelColor: string, totalCount?: number) => void
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

        // For all-accounts mode, use the NEW all-labels endpoint
        if (grantId === '__all_accounts__') {
          console.log(`🏷️  All-accounts mode detected, fetching shared labels...`)
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          
          if (sessionError || !session?.user?.id) {
            console.error('❌ Failed to get auth session:', sessionError)
            console.error('   Session data:', session?.user?.id ? 'exists' : 'null')
            setLoading(false)
            return
          }

          console.log(`🏷️  Session obtained, userId: ${session.user.id}`)
          
          // Call the NEW labels-count API endpoint
          const labelsUrl = `/api/accounts/labels-count?userId=${encodeURIComponent(session.user.id)}`
          console.log(`🏷️  Calling: ${labelsUrl}`)
          
          const response = await fetch(labelsUrl)
          
          console.log(`🏷️  Response status: ${response.status} ${response.statusText}`)
          
          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Failed to read error')
            console.error('❌ Error fetching labels count:', { 
              status: response.status, 
              error: errorText.substring(0, 200) 
            })
            setLoading(false)
            return
          }

          const result = await response.json()
          const allLabels = result.data || []

          if (!isMounted) {
            console.log(`🏷️  Component unmounted, skipping state update`)
            return
          }

          console.log(`✅ Labels response received:`, { 
            count: allLabels?.length,
            firstLabel: allLabels?.[0] ? { id: allLabels[0].id, name: allLabels[0].name, count: allLabels[0].count } : 'none'
          })
          console.log(`🏷️  ════════════════════════════════════════════════════════`)
          console.log(`🏷️  [SIDEBAR] Rendering ${allLabels?.length} labels`)
          console.log(`🏷️  Labels Summary:`, allLabels.slice(0, 8).map((l: any) => `${l.name}(${l.count})`).join(' | '))
          console.log(`🏷️  First 5 labels:`, allLabels.slice(0, 5).map((l: any) => ({ 
            name: l.name, 
            count: l.count,
            color: l.color
          })))

          setLabels(allLabels || [])
          setLoading(false)
          console.log(`✅ Labels state updated with ${allLabels?.length} labels`)
          console.log(`🏷️  ════════════════════════════════════════════════════════`)
          return
        }

        // For single account mode, fetch from Supabase directly
        console.log(`🏷️  Single-account mode: grantId=${grantId}, emailAccountId=${emailAccountId}`)
        
        const { data: allLabels, error: labelsError } = await supabase
          .from('custom_labels')
          .select('id, name, color, sort_order')
          .order('sort_order', { ascending: true })

        if (!isMounted) {
          console.log(`🏷️  Component unmounted during Supabase query`)
          return
        }
        
        if (labelsError) {
          console.error('❌ Error fetching custom_labels from Supabase:', labelsError)
          return
        }

        console.log(`✅ Fetched ${allLabels?.length} custom_labels from Supabase`)
        console.log('📊 DEBUG: Labels from DB:', allLabels?.slice(0, 3).map((l: any) => ({ 
          id: l.id,
          name: l.name,
          color: l.color
        })))

        // If no grantId provided, just show labels with 0 count
        if (!grantId || !emailAccountId) {
          console.log('⚠️  No grantId or emailAccountId, showing labels with 0 count')
          const labelsWithZeroCount = (allLabels || []).map(label => ({ ...label, count: 0 }))
          if (isMounted) {
            setLabels(labelsWithZeroCount)
            console.log(`✅ Set ${labelsWithZeroCount.length} labels with zero count`)
          }
          setLoading(false)
          return
        }

        // For single account mode, fetch message counts from backend API
        console.log(`🔄 Fetching message counts for ${allLabels?.length} labels...`)
        
        const labelsWithCounts = await Promise.all(
          (allLabels || []).map(async (label: any) => {
            try {
              const countUrl = `/api/labels/${label.id}/emails?grantId=${encodeURIComponent(grantId)}&emailAccountId=${encodeURIComponent(emailAccountId)}`
              
              const response = await fetch(countUrl, { 
                method: 'GET', 
                credentials: 'include' 
              })

              if (!response.ok) {
                console.warn(`⚠️  Count endpoint returned ${response.status} for label "${label.name}"`)
                return { ...label, count: 0 }
              }

              const result = await response.json()
              const emails = result.data || []
              const count = emails.length

              console.log(`✅ Label "${label.name}": ${count} messages`)
              return { ...label, count }
            } catch (err) {
              console.error(`❌ Error fetching count for label "${label.id}":`, err)
              return { ...label, count: 0 }
            }
          })
        )

        console.log(`✅ Received counts for all labels:`, labelsWithCounts.slice(0, 3).map((l: any) => ({
          name: l.name,
          count: l.count
        })))
        console.log(`🏷️  ════════════════════════════════════════════════════════`)
        console.log(`🏷️  [SIDEBAR] Rendering ${labelsWithCounts.length} labels`)
        console.log(`🏷️  Labels Summary:`, labelsWithCounts.map((l: any) => `${l.name}(${l.count})`).join(' | '))

        if (isMounted) {
          setLabels(labelsWithCounts)
          console.log(`✅ Labels state updated with ${labelsWithCounts.length} items`)
          console.log(`🏷️  ════════════════════════════════════════════════════════`)
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
      if (!grantId || (!emailAccountId && grantId !== '__all_accounts__')) {
        setSelectedLabelId(label.id)
        if (onMailboxTypeChange) {
          onMailboxTypeChange(`label:${label.id}`)
        }
        if (onLabelSelect) {
          onLabelSelect(label.id, label.name, [], label.color)
        }
        return
      }

      // Build URL based on mode
      let url: string
      if (grantId === '__all_accounts__') {
        console.log('🏷️ All-accounts label click: fetching emails for', label.name)
        url = `/api/labels/${label.id}/emails?grantId=${encodeURIComponent(grantId)}&page=1`
      } else {
        url = `/api/labels/${label.id}/emails?grantId=${encodeURIComponent(grantId)}&emailAccountId=${encodeURIComponent(emailAccountId || '')}&page=1`
      }

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      })

      const result = await response.json()
      const { data, success } = result
      const error = !success ? { message: result.error || 'Unknown error' } : null

      if (error) {
        console.error('❌ Error fetching labeled emails:', error)
        return
      }

      if (!data || data.length === 0) {
        console.warn('⚠️ No emails found for this label', { labelId: label.id, grantId, isAllAccounts: grantId === '__all_accounts__' })
        setSelectedLabelId(label.id)
        if (onLabelSelect) {
          onLabelSelect(label.id, label.name, [], label.color, 0)
        }
        if (onMailboxTypeChange) {
          onMailboxTypeChange(`label:${label.id}`)
        }
        return
      }

      console.log('✅ Fetched emails:', data.length, 'emails from', grantId === '__all_accounts__' ? 'all accounts' : 'single account')

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
        emailAccountId: item.email_account_id || emailAccountId,
        mailDetails: item.mail_details,
      }))

      setSelectedLabelId(label.id)
      if (onLabelSelect) {
        const totalCount = result.totalCount || data.length
        onLabelSelect(label.id, label.name, emails, label.color, totalCount)
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


