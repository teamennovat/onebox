"use client"

import { useState, useEffect } from 'react'
import { LabelsSidebar } from './labels-sidebar'
import { LabeledMailList, type LabeledEmail } from './labeled-mail-list'
import { LabeledEmailDisplay } from './labeled-email-display'

interface LabeledEmailsViewProps {
  emailAccountId: string
  grantId: string
}

export function LabeledEmailsView({ emailAccountId, grantId }: LabeledEmailsViewProps) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  const [labelName, setLabelName] = useState<string>('')
  const [labeledEmails, setLabeledEmails] = useState<LabeledEmail[]>([])
  const [selectedEmail, setSelectedEmail] = useState<LabeledEmail | null>(null)
  const [isLoadingEmails, setIsLoadingEmails] = useState(false)

  const handleLabelSelect = async (
    labelId: string,
    labelName: string,
    emails: LabeledEmail[]
  ) => {
    setSelectedLabel(labelId)
    setLabelName(labelName)
    setLabeledEmails(emails)
    setSelectedEmail(null)
  }

  const handleClearSelection = () => {
    setSelectedLabel(null)
    setLabelName('')
    setLabeledEmails([])
    setSelectedEmail(null)
  }

  // If an email is selected, show the email detail view
  if (selectedEmail) {
    return (
      <div className="flex flex-col h-full">
        <button
          onClick={() => setSelectedEmail(null)}
          className="p-2 text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          ← Back to {labelName} ({labeledEmails.length})
        </button>
        <LabeledEmailDisplay email={selectedEmail} onClose={() => setSelectedEmail(null)} />
      </div>
    )
  }

  // If a label is selected, show the labeled emails list
  if (selectedLabel) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {labelName} <span className="text-sm text-gray-500">({labeledEmails.length})</span>
          </h2>
          <button
            onClick={handleClearSelection}
            className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Clear
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <LabeledMailList
            mails={labeledEmails}
            isLoading={isLoadingEmails}
            onMailSelect={(mail) => setSelectedEmail(mail)}
          />
        </div>
      </div>
    )
  }

  // Default view: labels sidebar
  return (
    <div className="p-4">
      <LabelsSidebar
        emailAccountId={emailAccountId}
        grantId={grantId}
        onLabelSelect={handleLabelSelect}
      />
    </div>
  )
}
