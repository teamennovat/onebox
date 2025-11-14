"use client"

import { atom, useAtom } from "jotai"

export type Mail = {
  id: string
  name: string
  email: string
  subject: string
  text: string
  /** raw html body when available */
  html?: string
  thread_id?: string // thread ID for grouping related messages
  reply_to_message_id?: string // ID of message being replied to
  /** To recipients */
  to?: Array<{ email: string; name?: string }> | any[]
  /** CC recipients */
  cc?: Array<{ email: string; name?: string }> | any[]
  /** BCC recipients */
  bcc?: Array<{ email: string; name?: string }> | any[]
  /** From field */
  from?: Array<{ email: string; name?: string }> | any[]
  /** Reply-to field */
  reply_to?: Array<{ email: string; name?: string }> | any[]
  /** Draft ID for draft messages */
  body?: string
  /** Object type (message, draft) */
  object?: string
  /** Send at timestamp */
  send_at?: number
  /** Grant ID for the account */
  grant_id?: string
  attachments?: {
    id?: string
    filename?: string
    content_type?: string
    content_id?: string
    is_inline?: boolean
    size?: number
  }[]
  date: string
  read: boolean
  labels: string[]
  // Optional runtime flags used by the UI (not persisted)
  isMoving?: boolean
  movedTo?: string
}

type Config = { selected: Mail["id"] | null }

const configAtom = atom<Config>({ selected: null })

export function useMail() {
  return useAtom(configAtom)
}

export default useMail
