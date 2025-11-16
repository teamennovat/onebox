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
  onMailSelect,
}: {
  mails: LabeledEmail[]
  isLoading?: boolean
  selectedMailId?: string
  onMailSelect?: (mail: LabeledEmail) => void
}) {
  const [, setMail] = useMail()
  const sortedMails = useMemo(() => {
    return [...mails].sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
  }, [mails])

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-gray-200 rounded animate-pulse" />
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

  const handleMailClick = (labeledMail: LabeledEmail) => {
    // Convert labeled email to Mail format for display
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
    
    // Update global mail state
    setMail({ selected: labeledMail.id })
    
    // Callback to parent
    onMailSelect?.(labeledMail)
  }

  return (
    <div className="space-y-1">
      {sortedMails.map((mail) => {
        const mailItem: Mail = {
          id: mail.id,
          name: mail.name,
          email: mail.email,
          subject: mail.subject,
          text: mail.text,
          html: mail.mailDetails?.html || undefined,
          body: mail.mailDetails?.body || mail.text,
          date: mail.date,
          read: mail.read,
          labels: mail.labels,
          thread_id: mail.mailDetails?.thread_id,
          grant_id: mail.grantId,
          from: mail.mailDetails?.from,
          to: mail.mailDetails?.to,
          cc: mail.mailDetails?.cc,
          bcc: mail.mailDetails?.bcc,
          reply_to: mail.mailDetails?.reply_to,
          attachments: mail.mailDetails?.attachments,
        }

        return (
          <div
            key={mail.id}
            onClick={() => handleMailClick(mail)}
            className="cursor-pointer"
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
