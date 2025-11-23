"use client"

import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Download, FileIcon, Mail, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { createBrowserClient } from '@supabase/ssr'

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
  emailAccountId?: string
  currentLabelId?: string
  onLabelChange?: (newLabelId: string, newLabelName: string) => void
  onClose?: () => void
}

interface CustomLabel {
  id: string
  name: string
  color: string
}

const LABEL_MAP: Record<string, CustomLabel> = {
  'e86be808-a059-4eb9-9753-2b3908f804d5': { id: 'e86be808-a059-4eb9-9753-2b3908f804d5', name: 'To Respond', color: '#ef4444' },
  'ddb9aa73-ed78-4eb2-9660-30bc326066c0': { id: 'ddb9aa73-ed78-4eb2-9660-30bc326066c0', name: 'Need Action', color: '#f97316' },
  'cf71293b-58bc-4136-8427-3ab2e1662f4f': { id: 'cf71293b-58bc-4136-8427-3ab2e1662f4f', name: 'FYI', color: '#3b82f6' },
  '3a863d85-e959-4fe1-904c-1dc4872cbf14': { id: '3a863d85-e959-4fe1-904c-1dc4872cbf14', name: 'Resolved', color: '#10b981' },
  'be6ffdb8-9a6f-4ec3-8ad0-7e71ad79c854': { id: 'be6ffdb8-9a6f-4ec3-8ad0-7e71ad79c854', name: 'Newsletter', color: '#8b5cf6' },
  '972b1c38-dcb2-4b7d-8db9-806473fcb6af': { id: '972b1c38-dcb2-4b7d-8db9-806473fcb6af', name: 'Schedules', color: '#06b6d4' },
  'a6537970-7c3b-41ac-b56d-5787c9429ccc': { id: 'a6537970-7c3b-41ac-b56d-5787c9429ccc', name: 'Promotion', color: '#ec4899' },
  '044d6fb8-43bd-4042-9006-dc1b064ac744': { id: '044d6fb8-43bd-4042-9006-dc1b064ac744', name: 'Notification', color: '#6366f1' },
  '31d79b25-3357-49bb-bad0-b1881590678e': { id: '31d79b25-3357-49bb-bad0-b1881590678e', name: 'Purchases', color: '#14b8a6' },
}

interface Attachment {
  id: string
  filename: string
  size: number
  contentType: string
}

export function LabeledEmailDisplay({ 
  email, 
  emailAccountId,
  currentLabelId,
  onLabelChange,
  onClose 
}: LabeledEmailDisplayProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loadingAttachments, setLoadingAttachments] = useState(false)
  const [body, setBody] = useState<string>('')
  const [showLabelDropdown, setShowLabelDropdown] = useState(false)
  const [isChangingLabel, setIsChangingLabel] = useState(false)
  const [allLabels, setAllLabels] = useState<CustomLabel[]>([])

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

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

    // Initialize all labels
    setAllLabels(Object.values(LABEL_MAP))
  }, [email])

  const handleChangeLabelClick = async (newLabelId: string) => {
    if (!currentLabelId || !emailAccountId || !email.messageId) {
      console.error('Missing required fields for label change')
      return
    }

    if (newLabelId === currentLabelId) {
      setShowLabelDropdown(false)
      return
    }

    setIsChangingLabel(true)

    try {
      const response = await fetch(
        `/api/messages/${encodeURIComponent(email.messageId)}/label-change`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            oldLabelId: currentLabelId,
            newLabelId: newLabelId,
            emailAccountId: emailAccountId,
            grantId: email.grantId,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        console.error('Error changing label:', result.error)
        return
      }

      // Update UI immediately
      const newLabel = LABEL_MAP[newLabelId]
      if (newLabel && onLabelChange) {
        onLabelChange(newLabelId, newLabel.name)
      }

      setShowLabelDropdown(false)
    } catch (error) {
      console.error('Error in handleChangeLabelClick:', error)
    } finally {
      setIsChangingLabel(false)
    }
  }

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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              {email.labels.map((label) => (
                <span
                  key={label}
                  className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-2 py-1 rounded"
                >
                  {label}
                </span>
              ))}
            </div>
            
            {/* Label Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowLabelDropdown(!showLabelDropdown)}
                disabled={isChangingLabel}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Change
                <ChevronDown className="w-3 h-3" />
              </button>

              {showLabelDropdown && (
                <div className="absolute right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50 max-h-64 overflow-y-auto">
                  {allLabels.map((label) => (
                    <button
                      key={label.id}
                      onClick={() => handleChangeLabelClick(label.id)}
                      disabled={isChangingLabel || label.id === currentLabelId}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors",
                        label.id === currentLabelId
                          ? "bg-blue-50 dark:bg-blue-900 font-semibold"
                          : "hover:bg-gray-100 dark:hover:bg-gray-700",
                        isChangingLabel && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: label.color }}
                      />
                      <span>{label.name}</span>
                      {label.id === currentLabelId && (
                        <span className="ml-auto text-xs">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
