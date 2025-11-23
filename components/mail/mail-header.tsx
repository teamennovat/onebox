"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getLabelBadgeStyle, getLabelBadgeDarkStyle } from "@/lib/color-utils"

interface MailHeaderProps {
  activeTab: string
  onTabChange: (value: string) => void
  labelName?: string | null
  labelColor?: string | null
}

export function MailHeader({ activeTab, onTabChange, labelName, labelColor }: MailHeaderProps) {
  // Get badge styles based on label color
  const lightStyle = getLabelBadgeStyle(labelColor || undefined)
  const darkStyle = getLabelBadgeDarkStyle(labelColor || undefined)

  return (
    <Tabs value={activeTab} onValueChange={onTabChange}>
      <div className="flex items-center px-4 py-2">
        <h1 className="text-xl font-bold">
          Inbox
          {labelName && (
            <span
              className="ml-2 inline-block px-2 py-1 text-sm font-medium rounded-full"
              style={{
                backgroundColor: lightStyle.backgroundColor,
                color: lightStyle.color,
              }}
            >
              {labelName}
            </span>
          )}
        </h1>
        <TabsList className="ml-auto">
          <TabsTrigger
            value="all"
            className="text-zinc-600 dark:text-zinc-200"
          >
            All mail
          </TabsTrigger>
          <TabsTrigger
            value="unread"
            className="text-zinc-600 dark:text-zinc-200"
          >
            Unread
          </TabsTrigger>
        </TabsList>
      </div>
    </Tabs>
  )
}
