import * as React from "react"
import { formatDistanceToNow } from "date-fns"
import { Archive, ArchiveX, Star, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Mail } from "./use-mail"
import { useMail } from "./use-mail"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface MailListItemProps {
  item: Mail
  selectedGrantId?: string | null
  mailboxType?: string
  isUnreadTab?: boolean
  onFolderChange?: (opts?: { from?: string | null; to?: string | null }) => Promise<void> | void
  setItems?: React.Dispatch<React.SetStateAction<Mail[]>>
}

export function MailListItem({ 
  item, 
  selectedGrantId, 
  mailboxType,
  isUnreadTab,
  onFolderChange,
  setItems 
}: MailListItemProps) {
  const [mail, setMail] = useMail()

  const handleFolderAction = async (messageId: string, destination: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    // Always hide from current view when moving to a different folder
    if (destination !== mailboxType && destination !== String(mailboxType).toLowerCase()) {
      setItems?.(prev => prev.filter(m => m.id !== messageId));
    } else {
      setItems?.(prev => prev.map(m => m.id === messageId ? { ...m, labels: destination === 'inbox' ? [] : [destination] } : m));
    }
    
    // Update folders count immediately
    onFolderChange?.({ from: mailboxType?.toLowerCase(), to: destination });

    // Then send API request
    const params = new URLSearchParams();
    if (selectedGrantId) params.set('grantId', selectedGrantId);
    params.set('messageId', messageId);
    params.set('destination', destination);
    
    fetch(`/api/messages/${messageId}/move?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination, grantId: selectedGrantId }),
    }).catch(error => {
      console.error('Failed to move message:', error);
      // Revert optimistic update on error
      setItems?.(prev => [...prev]);
      onFolderChange?.();
    });
  }

  const actionContainerRef = React.useRef<HTMLDivElement>(null)

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent group relative",
        mail.selected === item.id && "bg-muted"
      )}
      onClick={(e) => {
        // Don't trigger mail select if clicking on action buttons
        if (actionContainerRef.current?.contains(e.target as Node)) return

        // Mark as read and select the email
        if (isUnreadTab || item.read === false) {
          const params = new URLSearchParams()
          if (selectedGrantId) params.set('grantId', String(selectedGrantId))
          params.set('unread', 'false')
          const url = `/api/messages/${item.id}/read?${params.toString()}`
          
          // Optimistic update
          if (setItems) {
            setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, read: true } : m)))
          }

          // Fire and forget API call
          fetch(url, {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          }).catch(e => console.error('Mark read failed:', e))
        }

        setMail({
          ...mail,
          selected: item.id,
        })
      }}
    >
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 mr-2 shrink-0"
          title={item.labels?.map(String).join(' ').toLowerCase().includes('star') ? 'Unstar' : 'Star'}
          onClick={(e) => {
            e.stopPropagation();
            handleFolderAction(item.id, item.labels?.map(String).join(' ').toLowerCase().includes('star') ? 'inbox' : 'starred')
          }}
        >
          <Star className={cn("h-4 w-4", item.labels?.map(String).join(' ').toLowerCase().includes('star') && "fill-yellow-400 text-yellow-400")} />
        </Button>

        <div className="relative">
          <Popover>
            <PopoverTrigger asChild>
              <span className="font-medium cursor-pointer hover:underline">{item.name}</span>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={`https://avatar.vercel.sh/${item.email}.png`} />
                  <AvatarFallback>
                    {item.name.split(" ").map((n) => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-base">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{item.email}</p>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          {!item.read && (
            <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-600 rounded-full" />
          )}
        </div>

        <div className="ml-auto text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(item.date), { addSuffix: true })}
        </div>
      </div>

      {/* Action Icons (visible on hover) */}
      <div 
        ref={actionContainerRef}
        className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={item.labels?.map(String).join(' ').toLowerCase().includes('important') ? 'Remove from Important' : 'Mark as Important'}
          onClick={(e) => handleFolderAction(item.id, item.labels?.map(String).join(' ').toLowerCase().includes('important') ? 'inbox' : 'important', e)}
        >
          {(item.labels || []).map(String).join(' ').toLowerCase().includes('important') ? 
            <ArchiveX className="h-4 w-4" /> : 
            <Archive className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={item.labels?.map(String).join(' ').toLowerCase().includes('spam') ? 'Not Spam' : 'Mark as Spam'}
          onClick={(e) => handleFolderAction(item.id, item.labels?.map(String).join(' ').toLowerCase().includes('spam') ? 'inbox' : 'spam', e)}
        >
          {(item.labels || []).map(String).join(' ').toLowerCase().includes('spam') ?
            <ArchiveX className="h-4 w-4" /> : 
            <ArchiveX className="h-4 w-4 rotate-45" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={item.labels?.map(String).join(' ').toLowerCase().includes('trash') ? 'Restore from Trash' : 'Move to Trash'}
          onClick={(e) => handleFolderAction(item.id, item.labels?.map(String).join(' ').toLowerCase().includes('trash') ? 'inbox' : 'trash', e)}
        >
          {(item.labels || []).map(String).join(' ').toLowerCase().includes('trash') ? 
            <ArchiveX className="h-4 w-4" /> :
            <Trash2 className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="font-semibold line-clamp-1">{item.subject}</h3>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {String(item.text).length > 250 
            ? `${String(item.text).substring(0, 250)}...` 
            : String(item.text)}
        </p>
      </div>
    </div>
  )
}