"use client"

import * as React from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetClose } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Calendar as CalendarIcon, X } from "lucide-react"
import { format } from "date-fns"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

export type EmailFilters = {
  any_email?: string                  // Search across to/from/cc/bcc fields
  to?: string                 // Filter by recipient (To field)
  from?: string               // Filter by sender (From field)
  cc?: string                 // Filter by CC
  bcc?: string                // Filter by BCC
  in?: string                 // Filter by folder/label
  unread?: boolean            // Filter unread messages
  has_attachment?: boolean    // Filter messages with attachments
  received_after?: number | null      // Filter by date range (Unix timestamp)
  received_before?: number | null     // Filter by date range (Unix timestamp)
  search_query_native?: string        // Advanced search: searches subject, body, and all email fields
}

interface FilterSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: EmailFilters
  setFilters: (next: EmailFilters) => void
}

export function FilterSheet({ open, onOpenChange, filters, setFilters }: FilterSheetProps) {
  const [draft, setDraft] = React.useState<EmailFilters>(filters || {})

  React.useEffect(() => {
    setDraft(filters || {})
  }, [filters, open])

  function apply() {
    console.log('🚀 APPLYING FILTERS:', {
      any_email: draft.any_email,
      to: draft.to,
      from: draft.from,
      cc: draft.cc,
      bcc: draft.bcc,
      unread: draft.unread,
      has_attachment: draft.has_attachment,
      received_after: draft.received_after,
      received_before: draft.received_before,
      search_query_native: draft.search_query_native
    })
    setFilters(draft)
    onOpenChange(false)
  }

  function clear() {
    console.log('🗑️ CLEARING ALL FILTERS')
    setDraft({})
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="w-full sm:w-[420px] flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <SheetHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle>Email Filters</SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>

        {/* Content - Scrollable */}
        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-5 p-4 pr-8">
            {/* Any Email - searches to/from/cc/bcc */}
            <div className="space-y-2">
              <Label htmlFor="filter-any-email" className="text-sm font-medium">Any Email Address</Label>
              <Input 
                id="filter-any-email"
                value={draft.any_email || ""} 
                onChange={(e) => setDraft({ ...draft, any_email: e.target.value })} 
                placeholder="Search across to/from/cc/bcc..."
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">Searches in To, From, CC, BCC fields</p>
            </div>

            {/* Divider */}
            <Separator className="my-2" />

            {/* From and To */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recipients</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="filter-from" className="text-sm font-medium">From</Label>
                  <Input 
                    id="filter-from"
                    value={draft.from || ""} 
                    onChange={(e) => setDraft({ ...draft, from: e.target.value })} 
                    placeholder="Sender email..."
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filter-to" className="text-sm font-medium">To</Label>
                  <Input 
                    id="filter-to"
                    value={draft.to || ""} 
                    onChange={(e) => setDraft({ ...draft, to: e.target.value })} 
                    placeholder="Recipient email..."
                    className="w-full"
                  />
                </div>
              </div>

              {/* CC and BCC */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="filter-cc" className="text-sm font-medium">CC</Label>
                  <Input 
                    id="filter-cc"
                    value={draft.cc || ""} 
                    onChange={(e) => setDraft({ ...draft, cc: e.target.value })} 
                    placeholder="CC email..."
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filter-bcc" className="text-sm font-medium">BCC</Label>
                  <Input 
                    id="filter-bcc"
                    value={draft.bcc || ""} 
                    onChange={(e) => setDraft({ ...draft, bcc: e.target.value })} 
                    placeholder="BCC email..."
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Divider */}
            <Separator className="my-2" />

            {/* Message Properties */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Message Properties</h3>
              <div className="flex items-center justify-between p-3 rounded-md border border-input/50 hover:border-input transition-colors">
                <Label htmlFor="filter-attachment" className="text-sm font-medium cursor-pointer">Has Attachment</Label>
                <Switch 
                  id="filter-attachment"
                  checked={Boolean(draft.has_attachment)} 
                  onCheckedChange={(v) => setDraft({ ...draft, has_attachment: Boolean(v) })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-md border border-input/50 hover:border-input transition-colors">
                <Label htmlFor="filter-unread" className="text-sm font-medium cursor-pointer">Unread</Label>
                <Switch 
                  id="filter-unread"
                  checked={Boolean(draft.unread)} 
                  onCheckedChange={(v) => setDraft({ ...draft, unread: Boolean(v) })}
                />
              </div>
            </div>

            {/* Divider */}
            <Separator className="my-2" />

            {/* Date Range */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date Range</h3>
              <div className="grid grid-cols-2 gap-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start text-left font-normal h-9"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {draft.received_after ? format(new Date(draft.received_after * 1000), 'MMM dd') : 'From'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={draft.received_after ? new Date(draft.received_after * 1000) : undefined}
                      onSelect={(date) => {
                        if (date) {
                          const ts = Math.floor(date.getTime() / 1000)
                          setDraft({ ...draft, received_after: ts })
                        }
                      }}
                      disabled={(date) => date > new Date()}
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start text-left font-normal h-9"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {draft.received_before ? format(new Date(draft.received_before * 1000), 'MMM dd') : 'To'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={draft.received_before ? new Date(draft.received_before * 1000) : undefined}
                      onSelect={(date) => {
                        if (date) {
                          date.setHours(23, 59, 59, 999)
                          const ts = Math.floor(date.getTime() / 1000)
                          setDraft({ ...draft, received_before: ts })
                        }
                      }}
                      disabled={(date) => date > new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Divider */}
            <Separator className="my-2" />

            {/* Advanced Search */}
            <div className="space-y-2">
              <Label htmlFor="filter-search" className="text-sm font-medium">Advanced Search</Label>
              <Input 
                id="filter-search"
                value={draft.search_query_native || ""} 
                onChange={(e) => setDraft({ ...draft, search_query_native: e.target.value })} 
                placeholder='subject:urgent from:alice@...'
                className="w-full text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">Email syntax: <span className="font-mono">subject:word from:email to:email is:unread</span></p>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <SheetFooter className="border-t pt-4">
          <Button 
            type="button"
            variant="ghost" 
            onClick={clear}
            className="flex-1"
          >
            Clear All
          </Button>
          <Button 
            type="button"
            onClick={apply}
            className="flex-1"
          >
            Apply Filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
