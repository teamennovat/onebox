"use client"

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

interface LabelWithCount {
  id: string
  name: string
  color: string
  count: number
}

interface LabeledEmail {
  id: string
  name: string
  email: string
  subject: string
  text: string
  date: string
  read: boolean
  labels: string[]
  messageId: string
  grantId: string
  mailDetails: any
}

export function LabelsSidebar({
  emailAccountId,
  grantId,
  onLabelSelectAction,
}: {
  emailAccountId?: string
  grantId?: string
  onLabelSelectAction?: (labelId: string, labelName: string, emails: LabeledEmail[]) => void
}) {
  const [labels, setLabels] = useState<LabelWithCount[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Debug: Verify Supabase is configured correctly
  useEffect(() => {
    console.log('🏷️ LabelsSidebar Supabase Configuration:', {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      keyPrefix: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20) + '...',
      grantId: grantId?.substring(0, 20) + '...',
      isAllAccounts: grantId === '__all_accounts__'
    })
  }, [grantId])

  useEffect(() => {
    if (!grantId) return

    // Use a ref to track if this effect has run to prevent double-calls
    let isMounted = true

    const fetchLabelsWithCounts = async () => {
      try {
        setLoading(true)

        // Check if this is all-accounts mode
        const isAllAccounts = grantId === '__all_accounts__'
        console.log(`🏷️ fetchLabelsWithCounts START:`, { grantId, isAllAccounts })

        if (isAllAccounts) {
          // All-accounts mode: get userId and call multi-account endpoint
          const supabaseTemp = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
          )
          const { data: { session }, error: sessionError } = await supabaseTemp.auth.getSession()
          if (sessionError || !session?.user?.id) {
            console.error(`🏷️ Failed to get session:`, sessionError)
            setLoading(false)
            return
          }

          console.log(`🏷️ All-accounts mode, calling labels-count endpoint with userId=${session.user.id.substring(0, 20)}...`)
          const labelsCountUrl = `/api/accounts/labels-count?userId=${encodeURIComponent(session.user.id)}`
          console.log(`🏷️ Request URL: ${labelsCountUrl}`)

          const response = await fetch(labelsCountUrl)
          if (!response.ok) {
            const text = await response.text().catch(() => 'Failed to read error response')
            console.error(`🏷️ HTTP error:`, { status: response.status, body: text.substring(0, 100) })
            setLoading(false)
            return
          }

          const data = await response.json()
          console.log(`🏷️ ✅ Got response: ${data.data?.length || 0} labels with counts`)
          console.log(`🏷️ Labels:`, data.data?.slice(0, 3).map((l: any) => ({ name: l.name, count: l.count })))

          if (isMounted) {
            setLabels(data.data?.filter((l: any) => l.count > 0) || [])
          }
        } else {
          // Single-account mode: use original logic
          console.log(`🏷️ Single-account mode, fetching from database...`)

          // Get all labels
          const { data: allLabels, error: labelsError } = await supabase
            .from('custom_labels')
            .select('id, name, color')
            .order('sort_order', { ascending: true })

          if (!isMounted) return
          if (labelsError) {
            console.error('Error fetching labels:', labelsError)
            return
          }

          // Fetch ALL message_custom_labels ONCE, then filter in memory
          const { data: allMessageLabels, error: msgError } = await supabase
            .from('message_custom_labels')
            .select('custom_label_id, applied_by')

          if (!isMounted) return
          if (msgError) {
            console.error('Error fetching message labels:', msgError)
            return
          }

          // Calculate counts in memory - ZERO additional API calls
          const labelsWithCounts = allLabels.map((label) => {
            const count = (allMessageLabels || []).filter((item: any) => {
              // Check if this message_custom_label matches this label
              if (item.custom_label_id !== label.id) return false

              // Check if grant_id matches applied_by
              // Match if: applied_by contains grantId OR applied_by is null
              const appliedBy = item.applied_by
              if (Array.isArray(appliedBy)) {
                return appliedBy.includes(grantId)
              } else if (appliedBy === null || appliedBy === undefined) {
                // Include emails with no applied_by (legacy or system-labeled)
                return true
              } else if (appliedBy && appliedBy === grantId) {
                return true
              }
              return false
            }).length

            return {
              ...label,
              count,
            }
          })

          if (isMounted) {
            console.log(`🏷️ ✅ Got ${labelsWithCounts.filter(l => l.count > 0).length} labels with counts`)
            setLabels(labelsWithCounts.filter((l) => l.count > 0))
          }
        }
      } catch (error) {
        console.error('Error fetching labels:', error)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchLabelsWithCounts()

    // Cleanup to prevent state updates after unmount
    return () => {
      isMounted = false
    }
  }, [grantId, supabase])

  const handleLabelClick = async (label: LabelWithCount, grantId?: string) => {
    const isSelected = selectedLabel === label.id
    
    if (!isSelected) {
      // Fetch emails for this label from backend API
      // This keeps Supabase credentials secure on the backend
      try {
        if (!grantId || !emailAccountId) {
          console.error('Missing grantId or emailAccountId')
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

        if (!success) {
          console.error('Error fetching labeled emails:', result.error)
          return
        }

        // Map data to LabeledEmail format
        const emails: LabeledEmail[] = (data || [])
          .map((item: any) => ({
            id: item.message_id,
            name: item.mail_details?.from?.[0]?.name || item.mail_details?.from?.[0]?.email || 'Unknown',
            email: item.mail_details?.from?.[0]?.email || '',
            subject: item.mail_details?.subject || '(No subject)',
            text: item.mail_details?.snippet || item.mail_details?.body?.substring(0, 100) || '',
            date: (() => {
              const dateValue = item.mail_details?.date;
              if (!dateValue) return new Date().toISOString();
              if (typeof dateValue === 'string') return dateValue;
              if (typeof dateValue === 'number') return new Date(dateValue * 1000).toISOString();
              return new Date().toISOString();
            })(),
            read: !item.mail_details?.unread,
            labels: [label.name],
            messageId: item.message_id,
            grantId: item.mail_details?.grant_id,
            mailDetails: item.mail_details,
          }))

        setSelectedLabel(label.id)
        
        if (onLabelSelectAction) {
          onLabelSelectAction(label.id, label.name, emails)
        }
      } catch (error) {
        console.error('Error in handleLabelClick:', error)
      }
    } else {
      setSelectedLabel(null)
    }
  }

  return (
    <div className="mb-4">
      <div className="px-3 py-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Labels</h3>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        ) : labels.length === 0 ? (
          <p className="text-xs text-gray-400">No labels yet</p>
        ) : (
          <ScrollArea className="h-auto">
            <div className="space-y-1">
              {labels.map((label) => (
                <button
                  key={label.id}
                  onClick={() => handleLabelClick(label, grantId)}
                  className={`w-full flex items-center justify-between px-2 py-2 text-sm rounded-md transition-colors ${
                    selectedLabel === label.id
                      ? 'bg-blue-100 dark:bg-blue-900'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="text-sm font-medium">{label.name}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {label.count}
                  </Badge>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
