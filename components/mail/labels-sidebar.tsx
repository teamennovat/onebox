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

export function LabelsSidebar({
  emailAccountId,
  grantId,
  onLabelSelect,
}: {
  emailAccountId?: string
  grantId?: string
  onLabelSelect?: (labelId: string, labelName: string) => void
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

        setLabels(labelsWithCounts.filter((l) => l.count > 0))
      } catch (error) {
        console.error('Error fetching labels:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchLabelsWithCounts()
  }, [emailAccountId, supabase])

  const handleLabelClick = (label: LabelWithCount) => {
    const isSelected = selectedLabel === label.id
    setSelectedLabel(isSelected ? null : label.id)

    if (!isSelected && onLabelSelect) {
      onLabelSelect(label.id, label.name)
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
                  onClick={() => handleLabelClick(label)}
                  className={`w-full flex items-center justify-between px-2 py-2 text-sm rounded-md transition-colors ${
                    selectedLabel === label.id
                      ? 'bg-gray-200 dark:bg-gray-700'
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
