import * as React from "react"
import dynamic from "next/dynamic"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Paperclip, Loader2, CalendarIcon, Clock, Wand2, Send } from "lucide-react"
import "react-quill-new/dist/quill.snow.css"
import "@/app/quill.css"
import { cn } from "@/lib/utils"

const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false })

interface Recipient {
  email: string
  name?: string
}

interface Attachment {
  filename: string
  content_type: string
  size: number
  content: string
}

interface Draft {
  id?: string
  to: Recipient[]
  cc?: Recipient[]
  bcc?: Recipient[]
  subject: string
  body: string
  productId?: string
  attachments?: Attachment[]
  send_at?: number
}

interface ComposeDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDraft?: Draft | any
  grantId?: string
  forwardEmail?: {
    subject: string
    body: string
    attachments: Array<{ filename: string; content_type: string; size: number; id: string }>
  } | null
}

// Helper function to normalize recipient objects to email strings
const formatRecipients = (recipients: any): string => {
  if (!recipients) return ""
  if (typeof recipients === 'string') return recipients
  if (!Array.isArray(recipients)) return ""
  
  return recipients
    .map((r: any) => {
      if (typeof r === 'string') return r
      if (r.email) return r.email
      return null
    })
    .filter(Boolean)
    .join(", ")
}

// Helper function to normalize recipient objects to Recipient array
const parseRecipientsArray = (input: any): Recipient[] => {
  if (!input) return []
  if (!Array.isArray(input)) return []
  
  return input
    .map((r: any) => {
      if (typeof r === 'string') {
        return { email: r, name: r }
      }
      if (r.email) {
        return { email: r.email, name: r.name || r.email }
      }
      return null
    })
    .filter(Boolean) as Recipient[]
}

export function ComposeDrawer({ open, onOpenChange, defaultDraft, grantId, forwardEmail }: ComposeDrawerProps) {
  // Memoize normalizeDraft to avoid infinite loops
  const normalizedDraft = React.useMemo(() => {
    if (!defaultDraft) return undefined
    
    console.log('🔍 NORMALIZING DRAFT - RAW INPUT:', {
      hasDefaultDraft: !!defaultDraft,
      keys: defaultDraft ? Object.keys(defaultDraft) : [],
      object: defaultDraft?.object,
      to: defaultDraft?.to,
      cc: defaultDraft?.cc,
      bcc: defaultDraft?.bcc,
      toType: typeof defaultDraft?.to,
      ccType: typeof defaultDraft?.cc,
      bccType: typeof defaultDraft?.bcc
    })
    
    // Handle Nylas draft format (from /api/messages/draft endpoint)
    // Nylas drafts have: id, subject, body, to, cc, bcc, attachments, etc.
    if (defaultDraft.object === 'draft' || (defaultDraft.subject && defaultDraft.body && defaultDraft.to)) {
      const toRecipients = parseRecipientsArray(defaultDraft.to)
      const ccRecipients = parseRecipientsArray(defaultDraft.cc)
      const bccRecipients = parseRecipientsArray(defaultDraft.bcc)
      
      console.log('📝 NORMALIZING NYLAS DRAFT:', {
        id: defaultDraft.id,
        toCount: toRecipients.length,
        ccCount: ccRecipients.length,
        bccCount: bccRecipients.length,
        toDetails: toRecipients.map(r => r.email),
        ccDetails: ccRecipients.map(r => r.email),
        bccDetails: bccRecipients.map(r => r.email)
      })
      
      return {
        id: defaultDraft.id,
        to: toRecipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject: defaultDraft.subject,
        body: defaultDraft.body || '',
        attachments: defaultDraft.attachments || [],
        send_at: defaultDraft.send_at
      }
    }
    
    // If it's already in Draft format (from new compose), return as-is
    if (defaultDraft.to && (Array.isArray(defaultDraft.to) || typeof defaultDraft.to === 'string')) {
      return defaultDraft as Draft
    }
    
    // If it's a Mail object from the message list, convert it
    if (defaultDraft.subject !== undefined && (defaultDraft.html !== undefined || defaultDraft.text !== undefined)) {
      return {
        id: defaultDraft.id,
        to: defaultDraft.to || [],
        cc: defaultDraft.cc || [],
        bcc: defaultDraft.bcc || [],
        subject: defaultDraft.subject,
        body: defaultDraft.html || defaultDraft.body || defaultDraft.text || '',
        attachments: defaultDraft.attachments || [],
        send_at: defaultDraft.send_at
      }
    }
    
    return defaultDraft
  }, [defaultDraft?.id, defaultDraft?.subject, defaultDraft?.body, defaultDraft?.html, defaultDraft?.text, defaultDraft?.object, defaultDraft?.to, defaultDraft?.cc, defaultDraft?.bcc])
  
  const [isSaving, setIsSaving] = React.useState(false)
  const [draftId, setDraftId] = React.useState<string | null>(null)
  const [sendAt, setSendAt] = React.useState<Date | undefined>()
  const [selectedTime, setSelectedTime] = React.useState<string>("12:00")
  const [attachments, setAttachments] = React.useState<File[]>([])
  const [forwardedAttachmentIds, setForwardedAttachmentIds] = React.useState<string[]>([])
  const [aiPrompt, setAiPrompt] = React.useState("")
  const [selectedProduct, setSelectedProduct] = React.useState<string>("")
  const [effectiveGrantId, setEffectiveGrantId] = React.useState<string | undefined>(grantId)
  const { toast } = useToast()
  
  // Sync effectiveGrantId: prefer prop, fallback to localStorage
  React.useEffect(() => {
    if (grantId) {
      setEffectiveGrantId(grantId)
      // Update localStorage when prop changes
      if (typeof window !== 'undefined') {
        localStorage.setItem('lastGrantId', grantId)
      }
    } else if (typeof window !== 'undefined') {
      // No prop provided, try localStorage
      const stored = localStorage.getItem('lastGrantId')
      if (stored) {
        setEffectiveGrantId(stored)
      }
    }
  }, [grantId, open])
  
  const [formData, setFormData] = React.useState<{
    to: string;
    cc: string;
    bcc: string;
    subject: string;
    body: string;
  }>(() => ({
    to: formatRecipients(normalizedDraft?.to) || "",
    cc: formatRecipients(normalizedDraft?.cc) || "",
    bcc: formatRecipients(normalizedDraft?.bcc) || "",
    subject: forwardEmail?.subject ? `Fwd: ${forwardEmail.subject}` : (normalizedDraft?.subject ?? ""),
    body: forwardEmail?.body ?? (normalizedDraft?.body ?? "")
  }))

  const quillModules = {
    toolbar: [
      [{ font: [] }],
      [{ header: [1, 2, 3, 4, 5, 6, false] }],
      ["bold", "italic", "underline", "strike"],
      ["blockquote", "code-block"],
      [{ list: "ordered" }, { list: "bullet" }],
      [{ script: "sub" }, { script: "super" }],
      [{ indent: "-1" }, { indent: "+1" }],
      [{ direction: "rtl" }],
      [{ size: ["small", false, "large", "huge"] }],
      [{ color: [] }, { background: [] }],
      ["link", "image", "video", "formula"],
      [{ align: [] }],
      ["clean"],
    ],
    clipboard: {
      matchVisual: false,
    },
  }
  const quillFormats = [
    "font",
    "header",
    "bold",
    "italic",
    "underline",
    "strike",
    "blockquote",
    "code-block",
    "list",
    "script",
    "indent",
    "direction",
    "size",
    "color",
    "background",
    "link",
    "image",
    "video",
    "formula",
    "align",
  ]

  // Initialize forwarded attachment IDs when forwardEmail changes
  React.useEffect(() => {
    if (!open) return
    
    if (forwardEmail?.attachments) {
      setForwardedAttachmentIds(forwardEmail.attachments.map(att => att.id))
    } else if (!forwardEmail && normalizedDraft?.attachments) {
      setForwardedAttachmentIds(normalizedDraft.attachments.map((att: any) => att.id || ''))
    } else {
      setForwardedAttachmentIds([])
    }
  }, [forwardEmail?.attachments, normalizedDraft?.id, open])

  // Initialize draft metadata (ID, send_at, attachments) when opening a draft
  React.useEffect(() => {
    if (!open || !normalizedDraft) {
      setDraftId(null)
      setSendAt(undefined)
      setAttachments([])
      return
    }

    // Set draft ID if this is an existing draft
    if (normalizedDraft.id) {
      setDraftId(normalizedDraft.id)
      console.log('✅ Draft ID loaded:', normalizedDraft.id)
    }

    // Set send_at if it exists
    if (normalizedDraft.send_at) {
      const sendAtDate = new Date(normalizedDraft.send_at * 1000)
      setSendAt(sendAtDate)
      // Extract time for the time picker
      const hours = String(sendAtDate.getHours()).padStart(2, '0')
      const minutes = String(sendAtDate.getMinutes()).padStart(2, '0')
      setSelectedTime(`${hours}:${minutes}`)
      console.log('✅ Send at loaded:', sendAtDate)
    }

    // Load attachments from draft
    // Note: Nylas attachments come with id/filename/size but not the File object
    // We'll store these as forwardedAttachmentIds instead
    if (normalizedDraft.attachments && normalizedDraft.attachments.length > 0) {
      console.log('✅ Attachments loaded:', {
        count: normalizedDraft.attachments.length,
        attachments: normalizedDraft.attachments.map((a: any) => ({
          filename: a.filename,
          size: a.size,
          id: a.id
        }))
      })
    }
  }, [normalizedDraft?.id, open])

  // Update form data when forwardEmail changes
  React.useEffect(() => {
    if (!open) return
    
    if (forwardEmail) {
      setFormData(prev => ({
        ...prev,
        subject: `Fwd: ${forwardEmail.subject}`,
        body: forwardEmail.body
      }))
    }
  }, [forwardEmail, open])
  
  // Update form data and draft ID when normalizedDraft changes
  React.useEffect(() => {
    if (!open) return
    
    if (normalizedDraft && !forwardEmail) {
      setDraftId(normalizedDraft.id ?? null)
      
      const toStr = formatRecipients(normalizedDraft.to)
      const ccStr = formatRecipients(normalizedDraft.cc)
      const bccStr = formatRecipients(normalizedDraft.bcc)
      
      console.log('📋 LOADING DRAFT DATA:', {
        id: normalizedDraft.id,
        subject: normalizedDraft.subject?.slice(0, 50),
        toCount: Array.isArray(normalizedDraft.to) ? normalizedDraft.to.length : 0,
        ccCount: Array.isArray(normalizedDraft.cc) ? normalizedDraft.cc.length : 0,
        bccCount: Array.isArray(normalizedDraft.bcc) ? normalizedDraft.bcc.length : 0,
        toRecipients: normalizedDraft.to,
        ccRecipients: normalizedDraft.cc,
        bccRecipients: normalizedDraft.bcc,
        toStr,
        ccStr,
        bccStr
      })
      
      setFormData({
        to: toStr,
        cc: ccStr,
        bcc: bccStr,
        subject: normalizedDraft.subject ?? "",
        body: normalizedDraft.body ?? ""
      })
    }
  }, [normalizedDraft?.id, normalizedDraft?.subject, normalizedDraft?.to, normalizedDraft?.cc, normalizedDraft?.bcc, forwardEmail, open])
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files)
      setAttachments(prev => [...prev, ...newFiles])
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleSchedule = (date?: Date) => {
    setSendAt(date)
    if (date) {
      const scheduledDate = new Date(date)
      const [hours, minutes] = selectedTime.split(":")
      scheduledDate.setHours(parseInt(hours), parseInt(minutes))
      
      toast({
        title: "Email scheduled",
        description: `Email will be sent on ${format(scheduledDate, "PPPp")}`
      })
    }
  }

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast({
        title: "Error",
        description: "Please enter a prompt for AI email generation",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/ai/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      });

      if (!response.ok) {
        const errorText = await response.text()
        console.error('AI compose API error:', { status: response.status, statusText: response.statusText, body: errorText })
        throw new Error(`Failed to generate email: ${response.status} ${response.statusText}`)
      }
      if (!response.body) throw new Error("No response stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let rawDeltaAccumulator = ""; // Accumulate all delta content as raw string

      function findNested(obj: any, key: string): any {
        if (!obj || typeof obj !== "object") return undefined;
        if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
        for (const k of Object.keys(obj)) {
          try {
            const res = findNested(obj[k], key);
            if (res !== undefined) return res;
          } catch (_) {}
        }
        return undefined;
      }

      // Extract JSON object from raw text (handle code fences)
      function extractJsonFromText(text: string): any {
        if (!text) return null;
        // Remove code fences
        const noFence = text.replace(/```(?:json)?\s*\n?/gi, '').trim();
        // Try to find complete JSON object
        const match = noFence.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
          return JSON.parse(match[0]);
        } catch {
          return null;
        }
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split("\n");
        buffer = lines[lines.length - 1];

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line || !line.startsWith("data: ")) continue;

          const payload = line.replace("data: ", "").trim();
          if (payload === "[DONE]") {
            // Stream ended - try to parse accumulated delta as JSON
            console.debug("Stream ended. Total accumulated text:", rawDeltaAccumulator.length);
            console.debug("First 300 chars:", rawDeltaAccumulator.slice(0, 300));

            try {
              const parsed = extractJsonFromText(rawDeltaAccumulator);
              if (parsed) {
                console.debug("Successfully extracted JSON:", JSON.stringify(parsed).slice(0, 300));

                // Look for nested response or direct properties
                const response = parsed?.response || parsed;
                const subject = response?.Subject || findNested(parsed, "Subject") || "";
                const mailContent = response?.mailContent || findNested(parsed, "mailContent") || "";

                console.debug("Extracted subject:", subject.slice(0, 60));
                console.debug("Extracted mailContent:", mailContent.slice(0, 100));

                if (subject || mailContent) {
                  const htmlContent = String(mailContent)
                    .trim()
                    .split(/\r?\n\s*\r?\n+/)
                    .map((p) => "<p>" + p.trim().replace(/\r?\n/g, "<br>") + "</p>")
                    .join("");

                  setFormData((prev) => ({ ...prev, subject, body: htmlContent }));
                  console.log("✅ AI compose: Successfully set subject and body");
                  setAiPrompt("");
                  toast({ title: "Email Generated", description: "AI has successfully composed your email" });
                  setIsSaving(false);
                  return;
                }
              }
            } catch (e) {
              console.error("Failed to parse accumulated delta as JSON:", e);
            }

            // If we couldn't parse JSON but have content, show error
            toast({
              title: "Error",
              description: "Could not parse AI response. Please try again.",
              variant: "destructive"
            });
            setIsSaving(false);
            return;
          }

          // Parse SSE line as JSON to extract delta content
          try {
            const obj = JSON.parse(payload);
            const deltaContent = obj?.choices?.[0]?.delta?.content;
            if (deltaContent) {
              // Accumulate ALL delta content, including whitespace and brackets
              rawDeltaAccumulator += deltaContent;
              console.debug(`Added delta: "${deltaContent.slice(0, 20)}"... (total: ${rawDeltaAccumulator.length})`);
            }
          } catch (e) {
            // Skip lines that aren't valid JSON
            console.debug("Skipped invalid JSON line");
          }
        }
      }

      // Stream ended without [DONE]
      console.warn("Stream ended without [DONE] signal");
      console.debug("Accumulated text:", rawDeltaAccumulator.slice(0, 300));

      // Try to parse what we have
      try {
        const parsed = extractJsonFromText(rawDeltaAccumulator);
        if (parsed) {
          const response = parsed?.response || parsed;
          const subject = response?.Subject || findNested(parsed, "Subject") || "";
          const mailContent = response?.mailContent || findNested(parsed, "mailContent") || "";
          
          if (subject || mailContent) {
            const htmlContent = String(mailContent)
              .trim()
              .split(/\r?\n\s*\r?\n+/)
              .map((p) => "<p>" + p.trim().replace(/\r?\n/g, "<br>") + "</p>")
              .join("");

            setFormData((prev) => ({ ...prev, subject, body: htmlContent }));
            console.log("✅ AI compose: Successfully set subject and body (fallback)");
            setAiPrompt("");
            toast({ title: "Email Generated", description: "AI has successfully composed your email" });
            setIsSaving(false);
            return;
          }
        }
      } catch (e) {
        console.error("Fallback parse failed:", e);
      }

      // Complete failure - no JSON could be parsed
      console.error("Could not parse any JSON from AI response");
      console.debug("Accumulated delta (first 500 chars):", rawDeltaAccumulator.slice(0, 500));
      toast({
        title: "Error",
        description: "Could not parse AI response. Please try again.",
        variant: "destructive"
      });
      setIsSaving(false);
    } catch (error) {
      console.error("Error generating email:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate email",
        variant: "destructive"
      });
      setIsSaving(false);
    }
  }

  const prepareAttachments = async () => {
    // Return the raw files - they'll be sent via FormData, not base64 JSON
    return attachments.map((file) => ({
      file: file,
      filename: file.name,
      content_type: file.type,
      size: file.size
    }))
  }

  const saveDraft = async () => {
    try {
      setIsSaving(true)
      
      console.log('📝 SAVE DRAFT INITIATED')
      console.log(`  grantId from props: ${grantId || 'UNDEFINED'}`)
      console.log(`  effectiveGrantId: ${effectiveGrantId || 'UNDEFINED'}`)
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const parseRecipients = (emails: string) => {
        if (!emails || !emails.trim()) return []
        return emails.split(",").map((email: string) => {
          const trimmed = email.trim()
          return {
            email: trimmed,
            name: trimmed
          }
        }).filter(r => r.email && r.email.length > 0 && emailRegex.test(r.email))
      }

      const toRecipients = parseRecipients(formData.to)
      if (toRecipients.length === 0) {
        toast({
          title: "Error",
          description: "Please add at least one valid recipient in the 'To' field",
          variant: "destructive"
        })
        setIsSaving(false)
        return
      }

      const attachmentData = await prepareAttachments()

      // Parse cc and bcc for query params
      const ccRecipients = parseRecipients(formData.cc)
      const bccRecipients = parseRecipients(formData.bcc)

      // Use FormData for file attachments to avoid JSON size limits
      const formDataToSend = new FormData()

      // Create the message object (all non-file fields)
      // Backend expects a 'message' field containing stringified JSON
      const messageObj: any = {
        subject: formData.subject || "(no subject)",
        body: formData.body || "",
        to: toRecipients
      }
      
      // Only include cc/bcc if there are recipients (backend will merge from query params if provided)
      if (ccRecipients && ccRecipients.length > 0) {
        messageObj.cc = ccRecipients
      }
      if (bccRecipients && bccRecipients.length > 0) {
        messageObj.bcc = bccRecipients
      }

      // Add message as a single JSON stringified field
      formDataToSend.append("message", JSON.stringify(messageObj))

      // Add file attachments (each file as separate field with its filename)
      if (attachmentData && attachmentData.length > 0) {
        attachmentData.forEach((att, index) => {
          formDataToSend.append(att.filename, att.file, att.filename)
        })
      }

      console.log('📋 SAVING DRAFT:', {
        toCount: toRecipients.length,
        ccCount: ccRecipients?.length || 0,
        bccCount: bccRecipients?.length || 0,
        subject: formData.subject?.slice(0, 50),
        bodyLength: formData.body?.length,
        attachmentCount: attachmentData?.length || 0,
        hasSendAt: !!sendAt,
        draftId: draftId,
        grantId: grantId
      })

      // Log the exact FormData being sent
      console.log('📦 EXACT PAYLOAD BEING SENT:')
      for (const [key, value] of formDataToSend.entries()) {
        if (value instanceof File) {
          console.log(`  ${key}: [File] ${value.name} (${value.size} bytes, ${value.type})`)
        } else {
          console.log(`  ${key}:`, value)
        }
      }

      // Build query params (grantId is REQUIRED)
      const queryParams = new URLSearchParams()
      if (!effectiveGrantId) {
        toast({
          title: "Error",
          description: "No account selected. Please select an email account first.",
          variant: "destructive"
        })
        setIsSaving(false)
        return
      }
      queryParams.append('grantId', effectiveGrantId)
      if (ccRecipients.length > 0) queryParams.append('cc', JSON.stringify(ccRecipients))
      if (bccRecipients.length > 0) queryParams.append('bcc', JSON.stringify(bccRecipients))
      const queryString = queryParams.toString()
      const endpoint = `/api/messages/compose${queryString ? '?' + queryString : ''}`
      
      console.log('🔑 GRANT ID CHECK:')
      console.log(`  effectiveGrantId: ${effectiveGrantId}`)
      console.log(`  Endpoint: ${endpoint}`)

      const res = await fetch(endpoint, {
        method: "POST",
        body: formDataToSend
      })

      if (!res.ok) {
        const errorText = await res.text()
        let debugInfo = ''
        try {
          const errorJson = JSON.parse(errorText)
          console.error('❌ DRAFT SAVE ERROR (Backend Response):', errorJson)
          if (errorJson.debug) {
            console.error('🔍 DEBUG INFO:', errorJson.debug)
            debugInfo = JSON.stringify(errorJson.debug, null, 2)
          }
        } catch (e) {
          console.error('❌ DRAFT SAVE ERROR (Raw):', {
            status: res.status,
            statusText: res.statusText,
            response: errorText
          })
        }
        throw new Error(`Failed to save draft: ${res.status} - ${debugInfo || errorText}`)
      }
      
      const data = await res.json()
      setDraftId(data.draftId)

      console.log('✅ DRAFT SAVED successfully:', {
        draftId: data.draftId,
        timestamp: new Date().toISOString()
      })

      toast({
        title: "Draft saved",
        description: "Your message has been saved as a draft"
      })

    } catch (error) {
      console.error("Error saving draft:", error)
      toast({
        title: "Error saving draft",
        description: error instanceof Error ? error.message : "There was a problem saving your draft",
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Auto-save draft when form data changes (debounced)
  React.useEffect(() => {
    if (!open || !draftId || !effectiveGrantId) return
    
    const timer = setTimeout(() => {
      updateDraft()
    }, 2000) // Auto-save after 2 seconds of inactivity
    
    return () => clearTimeout(timer)
  }, [formData, draftId, effectiveGrantId, open])

  const updateDraft = async () => {
    try {
      if (!draftId || !effectiveGrantId) {
        console.log('⏭️ Skipping auto-save: missing draftId or grantId')
        return
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const parseRecipients = (emails: string) => {
        if (!emails || !emails.trim()) return []
        return emails.split(",").map((email: string) => {
          const trimmed = email.trim()
          return {
            email: trimmed,
            name: trimmed
          }
        }).filter(r => r.email && r.email.length > 0 && emailRegex.test(r.email))
      }

      const toRecipients = parseRecipients(formData.to)
      const ccRecipients = parseRecipients(formData.cc)
      const bccRecipients = parseRecipients(formData.bcc)

      // If no 'to' recipients, don't auto-save
      if (toRecipients.length === 0) {
        console.log('⏭️ Skipping auto-save: no "to" recipients')
        return
      }

      console.log('💾 AUTO-SAVING DRAFT:', {
        draftId,
        subject: formData.subject?.slice(0, 50),
        toCount: toRecipients.length,
        ccCount: ccRecipients.length,
        bccCount: bccRecipients.length,
        bodyLength: formData.body?.length
      })

      // Prepare payload - simple JSON for updates without new attachments
      const payload: any = {
        subject: formData.subject || "(no subject)",
        body: formData.body || "",
        to: toRecipients
      }

      if (ccRecipients.length > 0) {
        payload.cc = ccRecipients
      }
      if (bccRecipients.length > 0) {
        payload.bcc = bccRecipients
      }

      const response = await fetch(
        `/api/messages/draft?grantId=${encodeURIComponent(effectiveGrantId)}&draftId=${encodeURIComponent(draftId)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ AUTO-SAVE FAILED:', {
          status: response.status,
          error: errorText
        })
        return
      }

      console.log('✅ DRAFT AUTO-SAVED')
    } catch (error) {
      console.error('Error auto-saving draft:', error)
      // Silently fail on auto-save, don't show toast
    }
  }

  const handleSendMessage = async () => {
    try {
      setIsSaving(true)
      
      const attachmentData = await prepareAttachments()
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const parseRecipients = (emails: string) => {
        if (!emails || !emails.trim()) return []
        return emails.split(",").map((email: string) => {
          const trimmed = email.trim()
          return {
            email: trimmed,
            name: trimmed
          }
        }).filter(r => r.email && r.email.length > 0 && emailRegex.test(r.email))
      }

      const to = parseRecipients(formData.to)
      if (to.length === 0) {
        toast({
          title: "Error",
          description: "Please add at least one valid recipient in the 'To' field",
          variant: "destructive"
        })
        setIsSaving(false)
        return
      }

      const cc = parseRecipients(formData.cc)
      const bcc = parseRecipients(formData.bcc)

      if (!effectiveGrantId) {
        toast({
          title: "Error",
          description: "No account selected. Please select an email account first.",
          variant: "destructive"
        })
        setIsSaving(false)
        return
      }

      console.log('📤 SENDING MESSAGE:', {
        draftId: draftId || 'NEW',
        toCount: to.length,
        ccCount: cc.length,
        bccCount: bcc.length,
        subject: formData.subject?.slice(0, 50),
        scheduled: !!sendAt,
        attachmentCount: attachmentData?.length || 0,
        effectiveGrantId: effectiveGrantId
      })

      let endpoint: string
      let requestBody: any
      let sendMethod = "POST"

      if (draftId) {
        // If we have a draftId, FIRST update the draft with recipients (if changed), then send
        console.log('📝 UPDATING DRAFT WITH LATEST RECIPIENTS BEFORE SENDING:', {
          to: to.length,
          cc: cc.length,
          bcc: bcc.length
        })

        // Step 1: Update the draft with new recipients and content (if not already done by auto-save)
        const updatePayload = {
          to: to,
          cc: cc.length > 0 ? cc : undefined,
          bcc: bcc.length > 0 ? bcc : undefined,
          subject: formData.subject || "(no subject)",
          body: formData.body || ""
        }

        const updateResponse = await fetch(
          `/api/messages/draft?grantId=${encodeURIComponent(effectiveGrantId)}&draftId=${encodeURIComponent(draftId)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
          }
        )

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text()
          console.error('❌ FAILED TO UPDATE DRAFT BEFORE SENDING:', errorText)
          throw new Error("Failed to update draft before sending")
        }

        console.log('✅ DRAFT UPDATED WITH RECIPIENTS')

        // Step 2: Send the draft using PATCH /api/messages/draft
        endpoint = `/api/messages/draft?grantId=${encodeURIComponent(effectiveGrantId)}&draftId=${encodeURIComponent(draftId)}`
        sendMethod = "PATCH"
        requestBody = {} // PATCH endpoint doesn't need body, just grantId + draftId

      } else {
        // Sending a NEW message (not from draft) - use compose/send endpoint
        const formDataToSend = new FormData()
        formDataToSend.append("to", JSON.stringify(to))
        formDataToSend.append("subject", formData.subject || "(no subject)")
        formDataToSend.append("body", formData.body || "")
        formDataToSend.append("tracking_options", JSON.stringify({
          opens: true,
          links: true,
          thread_replies: true
        }))

        if (cc.length > 0) {
          formDataToSend.append("cc", JSON.stringify(cc))
        }
        if (bcc.length > 0) {
          formDataToSend.append("bcc", JSON.stringify(bcc))
        }

        if (forwardedAttachmentIds && forwardedAttachmentIds.length > 0) {
          formDataToSend.append("forwardedAttachmentIds", JSON.stringify(forwardedAttachmentIds))
        }

        if (sendAt) {
          formDataToSend.append("send_at", String(Math.floor(sendAt.getTime() / 1000)))
          formDataToSend.append("use_draft", "true")
        }

        // Add file attachments
        if (attachmentData && attachmentData.length > 0) {
          attachmentData.forEach((att) => {
            formDataToSend.append(`attachments`, att.file, att.filename)
          })
        }

        endpoint = `/api/messages/compose/send?grantId=${encodeURIComponent(effectiveGrantId)}`
        sendMethod = "POST"
        requestBody = formDataToSend
      }

      const res = await fetch(endpoint, {
        method: sendMethod,
        ...(sendMethod === 'POST' ? { body: requestBody } : { body: JSON.stringify(requestBody) })
      })

      if (!res.ok) {
        const errorText = await res.text()
        console.error('❌ SEND FAILED:', errorText)
        
        // For new messages, save as draft if send fails
        if (!draftId) {
          await saveDraft()
          throw new Error("Failed to send message. Saved as draft instead.")
        } else {
          throw new Error("Failed to send draft: " + errorText)
        }
      }

      // Clear form and attachments on successful send
      setFormData({
        to: "",
        cc: "",
        bcc: "",
        subject: "",
        body: ""
      })
      setAttachments([])
      setForwardedAttachmentIds([])
      setSendAt(undefined)
      setSelectedTime("12:00")
      setDraftId(null)

      toast({
        title: "Message sent",
        description: "Your email has been sent successfully"
      })

      onOpenChange(false) // Close drawer after sending
      
    } catch (error) {
      console.error("Error sending message:", error)
      toast({
        title: "Error sending message",
        description: (error as any)?.message || "There was a problem sending your email",
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  const formInner = (
    <>
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto px-4">
          <div className="space-y-4 py-4">

          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              placeholder="recipient@example.com"
              value={formData.to}
              onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cc">CC</Label>
            <Input
              id="cc"
              placeholder="cc@example.com"
              value={formData.cc}
              onChange={(e) => setFormData(prev => ({ ...prev, cc: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bcc">BCC</Label>
            <Input
              id="bcc"
              placeholder="bcc@example.com"
              value={formData.bcc}
              onChange={(e) => setFormData(prev => ({ ...prev, bcc: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Email subject"
              value={formData.subject}
              onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <div className="min-h-[200px] border">
              <ReactQuill
                id="body"
                theme="snow"
                value={formData.body}
                onChange={(value) => setFormData(prev => ({ ...prev, body: value }))}
                placeholder="Type your message here"
                modules={quillModules}
                formats={quillFormats}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Attachments</Label>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {/* Display draft attachments (from existing draft) */}
                {normalizedDraft?.attachments?.map((att: any) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 p-2 border bg-gray-50"
                  >
                    <span className="text-sm truncate max-w-[200px]">
                      {att.filename}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({(att.size / 1024).toFixed(2)} KB)
                    </span>
                    <span className="text-xs text-muted-foreground">
                      (draft)
                    </span>
                  </div>
                ))}
                {/* Display forwarded attachments */}
                {forwardEmail?.attachments?.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 p-2 border bg-blue-50"
                  >
                    <span className="text-sm truncate max-w-[200px]">
                      {att.filename}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      (forwarded)
                    </span>
                  </div>
                ))}
                {/* Display newly added attachments */}
                {attachments.map((file, index) => (
                  <div
                    key={`new-${index}`}
                    className="flex items-center gap-2 p-2 border"
                  >
                    <span className="text-sm truncate max-w-[200px]">
                      {file.name}
                    </span>
                    <button
                      onClick={() => removeAttachment(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                  multiple
                />
                <Button
                  variant="outline"
                  onClick={() => document.getElementById("file-upload")?.click()}
                  type="button"
                >
                  <Paperclip className="w-4 h-4 mr-2" />
                  Add Attachments
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t p-4 bg-background">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={saveDraft} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Draft"
                )}
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {sendAt ? format(sendAt, "PPP") : "Schedule"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4" align="start">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex items-center gap-2 flex-1">
                        <Clock className="h-5 w-5" />
                        <Input
                          type="time"
                          value={selectedTime}
                          onChange={(e) => setSelectedTime(e.target.value)}
                          className="text-lg"
                        />
                      </div>
                    </div>
                    <Calendar
                      mode="single"
                      selected={sendAt}
                      onSelect={handleSchedule}
                      disabled={(date) => date < new Date()}
                      className="rounded-md border shadow-sm"
                    />
                  </div>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <Wand2 className="mr-2 h-4 w-4" />
                    AI Assist
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-4" align="start">
                  <div className="space-y-4">
                    <Label className="text-sm font-medium">Email Prompt</Label>
                    <div className="text-xs text-muted-foreground mb-2">
                      Describe the email you want to compose (tone, purpose, recipient, key points)
                    </div>
                    <Input
                      placeholder="E.g., Write a professional email to my manager requesting a 2-week extension on the project report due to unexpected scope changes..."
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      disabled={isSaving}
                      className="text-sm"
                    />
                    <Button 
                      onClick={handleAiGenerate} 
                      className="w-full"
                      disabled={isSaving || !aiPrompt.trim()}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Wand2 className="mr-2 h-4 w-4" />
                          Generate & Insert
                        </>
                      )}
                    </Button>
                    {isSaving && (
                      <div className="text-xs text-muted-foreground animate-pulse">
                        AI is composing your email...
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            
            <Button onClick={handleSendMessage} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile: use Drawer (visible on small screens). Desktop: use Sheet (md+). */}
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={cn(
          "md:hidden fixed inset-x-0 bottom-0 h-[85vh] border bg-background",
        )}>
          <DrawerHeader>
            <DrawerTitle>Compose Email</DrawerTitle>
          </DrawerHeader>

          {formInner}
        </DrawerContent>
      </Drawer>

      {/* Desktop sheet (md and up) */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className={cn("hidden md:block inset-y-0 right-0 h-full w-[75%] max-w-[1200px] border bg-background") }>
          <SheetHeader>
            <SheetTitle>Compose Email</SheetTitle>
          </SheetHeader>

          {formInner}
        </SheetContent>
      </Sheet>

      <Toaster />
    </>
  )
}