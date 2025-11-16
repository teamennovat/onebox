"use client"

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

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
  onLabelSelect?: (labelId: string, labelName: string, emails: any[]) => void
}

export function CustomLabels({ emailAccountId, onLabelSelect }: CustomLabelsProps) {
  const [labels, setLabels] = useState<LabelWithCount[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    if (!emailAccountId) return

    const fetchLabelsWithCounts = async () => {
      try {
        setLoading(true)

        // Fetch all custom labels ordered by sort_order
        const { data: allLabels, error: labelsError } = await supabase
          .from('custom_labels')
          .select('id, name, color, sort_order')
          .order('sort_order', { ascending: true })

        if (labelsError) {
          console.error('Error fetching labels:', labelsError)
          return
        }

        // Get count for each label
        const labelsWithCounts = await Promise.all(
          allLabels.map(async (label) => {
            const { count, error: countError } = await supabase
              .from('message_custom_labels')
              .select('*', { count: 'exact', head: true })
              .eq('email_account_id', emailAccountId)
              .eq('custom_label_id', label.id)

            return {
              ...label,
              count: countError ? 0 : count || 0,
            }
          })
        )

        setLabels(labelsWithCounts)
      } catch (error) {
        console.error('Error fetching labels:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchLabelsWithCounts()
  }, [emailAccountId, supabase])

  const handleLabelClick = async (label: LabelWithCount) => {
    if (selectedLabelId === label.id) {
      setSelectedLabelId(null)
      return
    }

    try {
      // Fetch emails for this label from Supabase
      const { data, error } = await supabase
        .from('message_custom_labels')
        .select(
          `
          id,
          message_id,
          applied_at,
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

      // Transform to match email UI format
      const emails = (data || []).map((item: any) => ({
        id: item.message_id,
        name: item.mail_details?.from?.[0]?.name || item.mail_details?.from?.[0]?.email || 'Unknown',
        email: item.mail_details?.from?.[0]?.email || '',
        subject: item.mail_details?.subject || '(No subject)',
        text: item.mail_details?.snippet || '',
        date: new Date(item.mail_details?.date ? item.mail_details.date * 1000 : Date.now()).toISOString(),
        read: !item.mail_details?.unread,
        labels: [item.custom_labels.name],
        messageId: item.message_id,
        grantId: item.mail_details?.grant_id,
        mailDetails: item.mail_details,
      }))

      setSelectedLabelId(label.id)

      if (onLabelSelect) {
        onLabelSelect(label.id, label.name, emails)
      }
    } catch (error) {
      console.error('Error in handleLabelClick:', error)
    }
  }

  return (
    <div className="px-3 py-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Labels</h3>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      ) : labels.length === 0 ? (
        <p className="text-xs text-gray-400">No labels</p>
      ) : (
        <ScrollArea className="h-auto">
          <div className="space-y-1">
            {labels.map((label) => (
              <button
                key={label.id}
                onClick={() => handleLabelClick(label)}
                className={cn(
                  "w-full flex items-center justify-between px-2 py-2 text-sm rounded-md transition-colors",
                  selectedLabelId === label.id
                    ? 'bg-blue-100 dark:bg-blue-900'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="text-sm font-medium truncate">{label.name}</span>
                </div>
                {label.count > 0 && (
                  <Badge variant="secondary" className="text-xs flex-shrink-0">
                    {label.count}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
