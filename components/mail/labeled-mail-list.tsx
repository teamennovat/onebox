"use client"

import { useMemo } from 'react'
import { MailListItem } from './mail-list-item'
import { Mail, useMail } from './use-mail'

export interface LabeledEmail {
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

export function LabeledMailList({
  mails,
  isLoading,
  selectedMailId,
  onMailSelectAction,
  onLabelChangeAction,
}: {
  mails: LabeledEmail[]
  isLoading?: boolean
  selectedMailId?: string
  onMailSelectAction?: (mail: LabeledEmail) => void
  onLabelChangeAction?: (messageId: string, oldLabelId: string, newLabelId: string) => void
}) {
  const [mail, setMail] = useMail()
  
  const sortedMails = useMemo(() => {
    return [...mails].sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
  }, [mails])

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (mails.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500">
        <p>No emails in this label</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-800">
      {sortedMails.map((labeledMail) => {
        // Convert labeled email to Mail format for MailListItem
        const mailItem: Mail = {
          id: labeledMail.id,
          name: labeledMail.name,
          email: labeledMail.email,
          subject: labeledMail.subject,
          text: labeledMail.text,
          html: labeledMail.mailDetails?.html || undefined,
          body: labeledMail.mailDetails?.body || labeledMail.text,
          date: labeledMail.date,
          read: labeledMail.read,
          labels: labeledMail.labels,
          thread_id: labeledMail.mailDetails?.thread_id,
          grant_id: labeledMail.grantId,
          from: labeledMail.mailDetails?.from,
          to: labeledMail.mailDetails?.to,
          cc: labeledMail.mailDetails?.cc,
          bcc: labeledMail.mailDetails?.bcc,
          reply_to: labeledMail.mailDetails?.reply_to,
          attachments: labeledMail.mailDetails?.attachments,
        }

        return (
          <div
            key={labeledMail.id}
            onClick={() => {
              // Update global mail state
              setMail({ selected: labeledMail.id })
              // Callback to parent to show detail view
              onMailSelectAction?.(labeledMail)
            }}
            className="cursor-pointer hover:bg-accent/5 transition-colors"
          >
            <MailListItem
              item={mailItem}
            />
          </div>
        )
      })}
    </div>
  )
}
