"use client"

import { Tabs, TabsContent } from "@/components/ui/tabs"
import { MailList } from "./mail-list"
import { MailListSkeleton } from "./mail-list-skeleton"
import { NoAccountMessage } from "./no-account-message"
import { type Mail } from "./use-mail"

interface MailListSectionProps {
  activeTab: string
  loading: boolean
  currentGrantId?: string
  mailboxType: string
  fetchedMails: Mail[]
  fetchedNextCursor: string | null
  fetchedHasMore: boolean
  setFetchedMails: React.Dispatch<React.SetStateAction<Mail[]>>
  onFolderChange?: (opts?: { from?: string | null; to?: string | null }) => Promise<void> | void
  onRefreshFolder?: () => Promise<void>
  onPaginate?: (pageToken: string) => Promise<void>
  onDraftClick?: (draft: Mail) => void
  dateFilterFrom: number | null
  dateFilterTo: number | null
  filters?: any
  onDateFilterChange?: (from: number | null, to: number | null) => void
}

export function MailListSection({
  activeTab,
  loading,
  currentGrantId,
  mailboxType,
  fetchedMails,
  fetchedNextCursor,
  fetchedHasMore,
  setFetchedMails,
  onFolderChange,
  onRefreshFolder,
  onPaginate,
  onDraftClick,
  dateFilterFrom,
  dateFilterTo,
  filters,
  onDateFilterChange,
}: MailListSectionProps) {
  return (
    <Tabs defaultValue={activeTab}>
      <TabsContent value="all" className="m-0">
        {!currentGrantId ? (
          <NoAccountMessage />
        ) : loading ? (
          <MailListSkeleton />
        ) : (
          <MailList
            items={fetchedMails}
            selectedGrantId={currentGrantId}
            mailboxType={mailboxType}
            isUnreadTab={activeTab === "unread"}
            dateFilterFrom={dateFilterFrom}
            dateFilterTo={dateFilterTo}
            filters={filters}
            onDateFilterChange={onDateFilterChange}
            setItems={setFetchedMails}
            onFolderChange={onFolderChange}
            onRefresh={onRefreshFolder}
            initialNextCursor={fetchedNextCursor}
            initialHasMore={fetchedHasMore}
            onDraftClick={onDraftClick}
            onPaginate={onPaginate}
          />
        )}
      </TabsContent>
      <TabsContent value="unread" className="m-0">
        {!currentGrantId ? (
          <NoAccountMessage />
        ) : loading ? (
          <MailListSkeleton />
        ) : (
          <MailList
            items={fetchedMails}
            selectedGrantId={currentGrantId}
            mailboxType={mailboxType}
            isUnreadTab={activeTab === "unread"}
            dateFilterFrom={dateFilterFrom}
            dateFilterTo={dateFilterTo}
            filters={filters}
            onDateFilterChange={onDateFilterChange}
            setItems={setFetchedMails}
            onFolderChange={onFolderChange}
            onRefresh={onRefreshFolder}
            initialNextCursor={fetchedNextCursor}
            initialHasMore={fetchedHasMore}
            onDraftClick={onDraftClick}
            onPaginate={onPaginate}
          />
        )}
      </TabsContent>
    </Tabs>
  )
}
