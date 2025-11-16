"use client"

import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Download, FileIcon, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface LabeledEmailDisplayProps {
  email: {
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
  onClose?: () => void
}

interface Attachment {
  id: string
  filename: string
  size: number
  contentType: string
}

export function LabeledEmailDisplay({ email, onClose }: LabeledEmailDisplayProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loadingAttachments, setLoadingAttachments] = useState(false)
  const [body, setBody] = useState<string>('')

  useEffect(() => {
    // Use body from mail_details if available, otherwise use text snippet
    const displayBody = email.mailDetails?.body || email.text || '(No message body)'
    setBody(displayBody)

    // Get attachments from mail_details (already stored in Supabase)
    if (email.mailDetails?.attachments && Array.isArray(email.mailDetails.attachments)) {
      const mappedAttachments = email.mailDetails.attachments.map((att: any) => ({
        id: att.id,
        filename: att.filename,
        size: att.size || 0,
        contentType: att.content_type || 'application/octet-stream',
      }))
      setAttachments(mappedAttachments)
    }
  }, [email])

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const handleDownloadAttachment = async (attachment: Attachment) => {
    try {
      const response = await fetch(
        `/api/attachments/download?grantId=${email.grantId}&messageId=${email.messageId}&attachmentId=${attachment.id}`
      )

      if (!response.ok) throw new Error('Download failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading attachment:', error)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 p-4 flex items-start justify-between">
        <div className="flex-1">
          <h2 className="text-xl font-semibold">{email.subject}</h2>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              {email.email.charAt(0).toUpperCase()}
            </div>
            <div className="text-sm">
              <p className="font-medium">{email.name}</p>
              <p className="text-gray-500 dark:text-gray-400">{email.email}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {formatDistanceToNow(new Date(email.date), { addSuffix: true })}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ✕
          </button>
        )}
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <div className="prose dark:prose-invert max-w-none">
            <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
              {body}
            </p>
          </div>
        </div>
      </ScrollArea>

      {/* Attachments */}
      {(attachments.length > 0 || loadingAttachments) && (
        <div className="border-t border-gray-200 dark:border-gray-800 p-4 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">
              Attachments ({attachments.length})
            </h3>
            {loadingAttachments && (
              <div className="w-4 h-4 animate-spin border-2 border-blue-500 border-t-transparent rounded-full" />
            )}
          </div>

          <div className="space-y-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {attachment.filename}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(attachment.size)}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDownloadAttachment(attachment)}
                  className="flex-shrink-0"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Labels */}
      {email.labels && email.labels.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-800 p-4 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center gap-2 flex-wrap">
            {email.labels.map((label) => (
              <span
                key={label}
                className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-2 py-1 rounded"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
