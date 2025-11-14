"use client"

import React from 'react'
import { Mail } from '@/components/mail/mail'

export default function MailWrapper({ accounts, mails }: { accounts: any[]; mails: any[] }) {
  // Prepare accounts for Mail UI (do not inject a default here — AccountSwitcher handles it)
  const uiAccounts = accounts.map((a) => ({
    label: a.email.split('@')[0],
    email: a.email,
    grantId: a.grant_id,
    icon: (
      <div className="h-6 w-6 rounded-full bg-gray-300 flex items-center justify-center text-xs">{a.email[0]?.toUpperCase()}</div>
    ),
  }))

  // Always pass the mails prop through; Mail component will show an empty state when no account is selected
  const uiMails = mails.map((m) => ({
    id: m.id,
    name: m.from?.name || m.from?.email || 'Unknown',
    email: m.from?.email || '',
    subject: m.subject || '',
    text: m.snippet || '',
    date: m.date || new Date().toISOString(),
    read: (m.is_read as boolean) || false,
    labels: (m.custom_labels || []).map((l: any) => l.name) || [],
  }))

  return <Mail accounts={uiAccounts} mails={uiMails} defaultLayout={undefined} defaultCollapsed={false} navCollapsedSize={4} />
}
