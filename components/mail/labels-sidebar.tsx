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
  onLabelSelect,
}: {
  emailAccountId?: string
  grantId?: string
  onLabelSelect?: (labelId: string, labelName: string, emails: LabeledEmail[]) => void
}) {
  const [labels, setLabels] = useState<LabelWithCount[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    if (!emailAccountId) return

    const fetchLabelsWithCounts = async () => {
      try {
        setLoading(true)

        // Get all labels
        const { data: allLabels, error: labelsError } = await supabase
          .from('custom_labels')
          .select('id, name, color')
          .order('sort_order', { ascending: true })

        if (labelsError) {
          console.error('Error fetching labels:', labelsError)
          return
        }

        // Get count for each label, filtering by applied_by if grantId provided
        const labelsWithCounts = await Promise.all(
          allLabels.map(async (label) => {
            let query = supabase
              .from('message_custom_labels')
              .select('applied_by', { count: 'exact', head: true })
              .eq('email_account_id', emailAccountId)
              .eq('custom_label_id', label.id)

            const { count, data, error: countError } = await query

            // If grantId is provided, filter by applied_by matching the grant_id
            let filteredCount = 0
            if (grantId && data && !countError) {
              filteredCount = data.filter((item: any) => {
                const appliedBy = item.applied_by
                if (Array.isArray(appliedBy)) {
                  return appliedBy.includes(grantId)
                } else if (typeof appliedBy === 'string') {
                  return appliedBy === grantId
                }
                return false
              }).length
            } else {
              filteredCount = countError ? 0 : count || 0
            }

            return {
              ...label,
              count: filteredCount,
            }
          })
        )

        setLabels(labelsWithCounts.filter((l) => l.count > 0))
      } catch (error) {
        console.error('Error fetching labels:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchLabelsWithCounts()
  }, [emailAccountId, grantId, supabase])

  const handleLabelClick = async (label: LabelWithCount, grantId?: string) => {
    const isSelected = selectedLabel === label.id
    
    if (!isSelected) {
      // Fetch emails for this label from Supabase
      try {
        const { data, error } = await supabase
          .from('message_custom_labels')
          .select(
            `
            id,
            message_id,
            applied_at,
            applied_by,
            mail_details,
            custom_labels!inner(id, name, color)
          `
          )
          .eq('custom_label_id', label.id)
          .eq('email_account_id', emailAccountId)
          .order('applied_at', { ascending: false })

        if (error) {
          console.error('Error fetching labeled emails:', error)
          return
        }

        // Filter emails based on applied_by matching the current grant_id
        // applied_by can be a single UUID or an array of UUIDs for multi-recipient emails
        const emails: LabeledEmail[] = (data || [])
          .filter((item: any) => {
            // If grantId is provided, check if it matches applied_by
            if (grantId) {
              const appliedBy = item.applied_by
              // Handle both single UUID and array of UUIDs
              if (Array.isArray(appliedBy)) {
                return appliedBy.includes(grantId)
              } else if (typeof appliedBy === 'string') {
                return appliedBy === grantId
              }
              return false
            }
            // If no grantId, include all emails
            return true
          })
          .map((item: any) => ({
            id: item.message_id,
            name: item.mail_details?.from?.[0]?.name || item.mail_details?.from?.[0]?.email || 'Unknown',
            email: item.mail_details?.from?.[0]?.email || '',
            subject: item.mail_details?.subject || '(No subject)',
            text: item.mail_details?.snippet || item.mail_details?.body?.substring(0, 100) || '',
            date: new Date(item.mail_details?.date ? item.mail_details.date * 1000 : Date.now()).toISOString(),
            read: !item.mail_details?.unread,
            labels: [item.custom_labels.name],
            messageId: item.message_id,
            grantId: item.mail_details?.grant_id,
            mailDetails: item.mail_details,
          }))

        setSelectedLabel(label.id)
        
        if (onLabelSelect) {
          onLabelSelect(label.id, label.name, emails)
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
