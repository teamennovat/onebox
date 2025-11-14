"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Pencil, LucideIcon, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ComposeDrawer } from "./compose-drawer"
import { FoldersSkeleton } from "./folders-skeleton"

interface NavProps {
  isCollapsed: boolean
  links: {
    title: string
    label?: string
    icon: LucideIcon
    variant: "default" | "ghost"
    folderId?: string
  }[]
  onMailboxTypeChange?: (type: string) => void
  activeMailbox?: string
  loading?: boolean
  grantId?: string
  forwardEmail?: { subject: string; body: string; attachments: Array<{ filename: string; content_type: string; size: number; id: string }> } | null
  onForwardEmailChange?: (email: { subject: string; body: string; attachments: Array<{ filename: string; content_type: string; size: number; id: string }> } | null) => void
  isComposeOpen?: boolean
  onComposeOpenChange?: (open: boolean) => void
  draftToEdit?: any | null
  onDraftEdit?: (draft: any | null) => void
}

export function Nav({ links, isCollapsed, onMailboxTypeChange, activeMailbox: externalActive, loading, grantId, forwardEmail, onForwardEmailChange, isComposeOpen: parentIsComposeOpen, onComposeOpenChange, draftToEdit: parentDraftToEdit, onDraftEdit }: NavProps) {
  const [isComposeOpen, setIsComposeOpen] = React.useState(false)
  const [activeMailbox, setActiveMailbox] = React.useState<string>(links[0]?.title || '')
  const router = useRouter()
  
  // Use parent state if provided, otherwise use local state
  const actualIsComposeOpen = parentIsComposeOpen !== undefined ? parentIsComposeOpen : isComposeOpen
  const setActualIsComposeOpen = onComposeOpenChange || setIsComposeOpen
  const actualDraftToEdit = parentDraftToEdit !== undefined ? parentDraftToEdit : null

  // Sync local active mailbox state when parent passes a new activeMailbox
  React.useEffect(() => {
    if (!externalActive) return
    const normalized = String(externalActive).toUpperCase()
    // Try to find a link that matches by folderId or title
    const match = links.find((l) => {
      if (l.folderId && String(l.folderId).toUpperCase() === normalized) return true
      if (String(l.title).toUpperCase() === normalized) return true
      return false
    })
    if (match) setActiveMailbox(match.title)
    else setActiveMailbox(String(externalActive))
  }, [externalActive, links])

  // When forwardEmail is set by parent, open compose drawer
  React.useEffect(() => {
    if (forwardEmail) {
      setIsComposeOpen(true)
    }
  }, [forwardEmail])
  
  // Default labels with zero counts (shown when no account selected)
  const defaultLabels = React.useMemo(() => [
    { title: 'To Respond', count: 0 },
    { title: 'Need Action', count: 0 },
    { title: 'FYI', count: 0 },
    { title: 'Resolved', count: 0 },
    { title: 'Newsletter', count: 0 },
    { title: 'Schedules', count: 0 },
    { title: 'Purchases', count: 0 },
    { title: 'Promotion', count: 0 },
    { title: 'Notification', count: 0 }
  ], [])

  return (
    <>
      <div
        data-collapsed={isCollapsed}
        className="group flex flex-col gap-4 py-2 data-[collapsed=true]:py-2"
      >
        <nav className="grid gap-1 px-2 group-[[data-collapsed=true]]:justify-center group-[[data-collapsed=true]]:px-2">
          {/* Compose Button */}
          {isCollapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setIsComposeOpen(true)}
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "icon" }),
                    "h-9 w-9 mb-2",
                    "dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-white"
                  )}
                >
                  <Pencil className="h-4 w-4" />
                  <span className="sr-only">Compose</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Compose new email
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={() => setIsComposeOpen(true)}
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "dark:bg-muted dark:text-white dark:hover:bg-muted dark:hover:text-white",
                "justify-start w-full mb-2"
              )}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Compose
            </button>
          )}

          {/* Regular Navigation Links */}
          {loading ? (
            <FoldersSkeleton />
          ) : (
            <>
              {links.map((link, index) => 
            isCollapsed ? (
              <Tooltip key={index} delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      buttonVariants({ variant: link.variant, size: "icon" }),
                      "h-9 w-9",
                      (activeMailbox?.toUpperCase() === (link.folderId || link.title)?.toUpperCase()) &&
                        (String(link.title).toLowerCase() === "inbox" ? "bg-accent text-primary" : "bg-primary-50 text-primary-700"),
                      link.variant === "default" &&
                        "dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-white"
                    )}
                    onClick={() => {
                      setActiveMailbox(link.title)
                      if (onMailboxTypeChange) onMailboxTypeChange(link.folderId ?? link.title)
                    }}
                  >
                    <link.icon className="h-4 w-4" />
                    <span className="sr-only">{link.title}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="flex items-center gap-4">
                  {link.title}
                  {link.label && (
                    <span className="ml-auto text-muted-foreground">
                      {link.label}
                    </span>
                  )}
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                key={index}
                type="button"
                  className={cn(
                  buttonVariants({ variant: link.variant, size: "sm" }),
                  "justify-start",
                  (activeMailbox?.toUpperCase() === (link.folderId || link.title)?.toUpperCase()) &&
                    (String(link.title).toLowerCase() === "inbox" ? "bg-accent text-primary" : "bg-primary-50"),
                  link.variant === "default" &&
                    "dark:bg-muted dark:text-white dark:hover:bg-muted dark:hover:text-white"
                )}
                onClick={() => {
                  setActiveMailbox(link.title)
                  if (onMailboxTypeChange) onMailboxTypeChange(link.folderId ?? link.title)
                }}
              >
                <link.icon className="mr-2 h-4 w-4" />
                {link.title}
                {link.label && (
                  <span
                    className={cn(
                      "ml-auto",
                      String(link.title).toLowerCase() === 'inbox' ? "text-primary font-medium" : "",
                      (activeMailbox?.toUpperCase() === (link.folderId || link.title)?.toUpperCase()) && "text-primary-700"
                    )}
                  >
                    {link.label}
                  </span>
                )}
              </button>
            ))}
            </>
          )}
        </nav>

        {/* Connect New Account Button - Fixed at bottom */}
        <div className="mt-auto border-t p-2">
          {isCollapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => router.push('/connect')}
                  className={cn(
                    buttonVariants({ variant: "default", size: "icon" }),
                    "h-9 w-9"
                  )}
                  title="Connect new account"
                >
                  <Plus className="h-4 w-4" />
                  <span className="sr-only">Connect New Account</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Connect New Account
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={() => router.push('/connect')}
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "w-full justify-start"
              )}
            >
              <Plus className="mr-2 h-4 w-4" />
              Connect Account
            </button>
          )}
        </div>
      </div>

      <ComposeDrawer 
        open={actualIsComposeOpen}
        onOpenChange={(open) => {
          setActualIsComposeOpen(open)
          // Clear forward and draft data when drawer closes
          if (!open) {
            if (onForwardEmailChange) {
              onForwardEmailChange(null)
            }
            if (onDraftEdit) {
              onDraftEdit(null)
            }
          }
        }}
        grantId={grantId}
        forwardEmail={forwardEmail}
        defaultDraft={actualDraftToEdit}
      />
    </>
  )
}