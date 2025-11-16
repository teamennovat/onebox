'use client'

import { useState, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'

interface SummaryListIconProps {
  email: any
  onSummaryGenerated?: (summary: string) => void
}

export function SummaryListIcon({ email, onSummaryGenerated }: SummaryListIconProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state when email changes
  useEffect(() => {
    setSummary(null)
    setError(null)
    setIsOpen(false)
  }, [email.id])

  const generateSummary = async () => {
    if (summary) return // Already generated

    setIsLoading(true)
    setError(null)

    try {
      // Get complete email data from Mail interface
      const subject = email.subject || ''
      const body = email.body || email.html || email.text || ''
      const from = email.from
      const to = email.to
      const attachments = email.attachments

      const response = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject,
          body,
          from,
          to,
          attachments,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate summary')
      }

      const data = await response.json()
      setSummary(data.summary)
      onSummaryGenerated?.(data.summary)
    } catch (err) {
      console.error('Summary generation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate summary')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open && !summary && !error) {
      generateSummary()
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent marking email as read
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center justify-center p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors h-8 w-8"
          title="Generate AI summary"
          onClick={handleClick}
        >
          <Sparkles className="w-4 h-4 text-gray-900 dark:text-gray-300" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" onClick={handleClick}>
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Email Summary</h4>

          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {summary && !isLoading && (
            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {summary}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
