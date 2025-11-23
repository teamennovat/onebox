"use client"

import { useState, useEffect } from 'react'
import { LabelsSidebar } from './labels-sidebar'

interface LabeledEmailsViewProps {
  emailAccountId: string
  grantId: string
  initialLabelId?: string
  initialLabelName?: string
  initialEmails?: any[]
  onLabelSelect?: (labelId: string, labelName: string, emails: any[]) => void
  onClose?: () => void
}

export function LabeledEmailsView({ 
  emailAccountId, 
  grantId, 
  initialLabelId, 
  initialLabelName, 
  initialEmails,
  onLabelSelect,
  onClose
}: LabeledEmailsViewProps) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(initialLabelId || null)

  const handleLabelSelect = async (
    labelId: string,
    labelName: string,
    emails: any[]
  ) => {
    setSelectedLabel(labelId)
    onLabelSelect?.(labelId, labelName, emails)
  }

  const handleClearSelection = () => {
    setSelectedLabel(null)
    onClose?.()
  }

  // Only show sidebar - don't duplicate email list/detail panels
  return (
    <div className="p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Labels</h3>
        {selectedLabel && (
          <button
            onClick={handleClearSelection}
            className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Back
          </button>
        )}
      </div>
      <LabelsSidebar
        emailAccountId={emailAccountId}
        grantId={grantId}
        onLabelSelectAction={handleLabelSelect}
      />
    </div>
  )
}
