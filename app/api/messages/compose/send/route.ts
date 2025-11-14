import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { nylasConfig } from "@/lib/nylas"
import FormData from "form-data"

export async function POST(request: Request) {
  try {
    // Extract query params first (following the pattern from read/move routes)
    const url = new URL(request.url)
    const queryGrantId = url.searchParams.get('grantId')
    const queryCC = url.searchParams.get('cc')
    const queryBCC = url.searchParams.get('bcc')
    
    console.log('\n🔗 QUERY PARAMS RECEIVED (send route):')
    console.log(`  grantId: ${queryGrantId ? '✅ Present: ' + queryGrantId : '❌ Missing'}`)

    // grantId is REQUIRED from frontend
    if (!queryGrantId) {
      return NextResponse.json({ error: "Missing grantId from frontend (required query param)" }, { status: 400 })
    }
    
    const grantId = queryGrantId
    console.log('\n🔐 GRANT INFO (send route):')
    console.log(`  Grant ID: ${grantId}`)

    // Parse FormData request
    const formData = await request.formData()
    
    // Parse JSON fields from FormData, with query params as fallback for cc/bcc
    const to = formData.get("to") ? JSON.parse(formData.get("to") as string) : null
    let cc = formData.get("cc") ? JSON.parse(formData.get("cc") as string) : null
    let bcc = formData.get("bcc") ? JSON.parse(formData.get("bcc") as string) : null
    
    // Use query params if FormData doesn't have cc/bcc
    if (!cc && queryCC) {
      try {
        cc = JSON.parse(queryCC)
      } catch (e) {
        console.warn('Failed to parse cc from query param')
      }
    }
    if (!bcc && queryBCC) {
      try {
        bcc = JSON.parse(queryBCC)
      } catch (e) {
        console.warn('Failed to parse bcc from query param')
      }
    }
    
    const subject = formData.get("subject") as string
    const emailBody = formData.get("body") as string
    const send_at = formData.get("send_at") ? parseInt(formData.get("send_at") as string) : null
    const use_draft = formData.get("use_draft") === "true"
    const tracking_options = formData.get("tracking_options") ? JSON.parse(formData.get("tracking_options") as string) : null
    const forwardedAttachmentIds = formData.get("forwardedAttachmentIds")
      ? JSON.parse(formData.get("forwardedAttachmentIds") as string)
      : null
    const draftId = formData.get("draftId") as string | null

    // Validation: recipients must be arrays of objects
    const validateRecipients = (arr: any) => {
      if (!arr) return []
      if (!Array.isArray(arr)) return null
      for (const r of arr) {
        if (!r.email) return null
      }
      return arr
    }

    const toArr = validateRecipients(to)
    const ccArr = validateRecipients(cc)
    const bccArr = validateRecipients(bcc)

    if (!toArr) {
      return NextResponse.json({ error: "Invalid 'to' recipients. Must be an array of {email,name?} objects" }, { status: 400 })
    }

    if (cc && !ccArr) {
      return NextResponse.json({ error: "Invalid 'cc' recipients. Must be an array of {email,name?} objects" }, { status: 400 })
    }

    if (bcc && !bccArr) {
      return NextResponse.json({ error: "Invalid 'bcc' recipients. Must be an array of {email,name?} objects" }, { status: 400 })
    }

    // If send_at provided and not use_draft, enforce Nylas scheduling window (>=2 minutes and <=30 days)
    if (send_at && !use_draft) {
      const nowSec = Math.floor(Date.now() / 1000)
      const minSec = nowSec + 120 // 2 minutes
      const maxSec = nowSec + 30 * 24 * 60 * 60 // 30 days
      if (send_at < minSec || send_at > maxSec) {
        return NextResponse.json({ error: "send_at must be between 2 minutes and 30 days in the future for scheduled sends" }, { status: 400 })
      }
    }

    // Build payload
    const payload: any = {
      subject: subject || "(no subject)",
      body: emailBody || "",
      to: toArr,
    }

    if (ccArr && ccArr.length) payload.cc = ccArr
    if (bccArr && bccArr.length) payload.bcc = bccArr
    if (use_draft) payload.use_draft = true
    if (send_at) payload.send_at = send_at
    if (tracking_options) payload.tracking_options = tracking_options

    // Handle file attachments from FormData
    const fileAttachments: any[] = []
    const files = formData.getAll("attachments")
    
    if (files && files.length > 0) {
      for (const file of files) {
        if (file instanceof File) {
          const buffer = await file.arrayBuffer()
          const base64 = Buffer.from(buffer).toString('base64')
          fileAttachments.push({
            filename: file.name,
            content_type: file.type || 'application/octet-stream',
            content: base64
          })
        }
      }
    }

    // Handle forwarded attachments
    if (forwardedAttachmentIds && Array.isArray(forwardedAttachmentIds) && forwardedAttachmentIds.length > 0) {
      payload.forwarded_attachments = forwardedAttachmentIds
    }

    const endpoint = `${nylasConfig.apiUri}/v3/grants/${grantId}/messages/send`

    // Create multipart/form-data for Nylas (supports up to 25MB)
    const nylasFormData = new FormData()
    
    // Add message as JSON field
    const messageObj: any = {
      subject: payload.subject,
      body: payload.body,
      to: payload.to,
    }
    
    if (payload.cc && payload.cc.length > 0) {
      messageObj.cc = payload.cc
    }
    if (payload.bcc && payload.bcc.length > 0) {
      messageObj.bcc = payload.bcc
    }
    if (payload.use_draft) {
      messageObj.use_draft = payload.use_draft
    }
    if (payload.send_at) {
      messageObj.send_at = payload.send_at
    }
    if (payload.tracking_options) {
      messageObj.tracking_options = payload.tracking_options
    }

    const messageJson = JSON.stringify(messageObj)
    console.log('\n🚀 CREATING NYLAS FormData for send:')
    console.log('  Message JSON:', messageJson)
    
    nylasFormData.append("message", messageJson)

    console.log('  FormData fields:')
    console.log('    - message: (JSON string)')
    console.log('    - file attachments:', fileAttachments.length)
    console.log('    - forwarded attachments:', payload.forwarded_attachments?.length || 0)

    // Add file attachments to FormData
    if (fileAttachments && fileAttachments.length > 0) {
      for (let i = 0; i < fileAttachments.length; i++) {
        const att = fileAttachments[i]
        // Convert base64 back to binary for multipart
        const binaryString = Buffer.from(att.content, 'base64')
        nylasFormData.append(`attachment${i + 1}`, binaryString, att.filename)
        console.log(`    - attachment${i + 1}: ${att.filename} (${att.size} bytes)`)
      }
    }

    // Add forwarded attachments if present
    if (payload.forwarded_attachments && payload.forwarded_attachments.length > 0) {
      nylasFormData.append("forwarded_attachments", JSON.stringify(payload.forwarded_attachments))
      console.log(`    - forwarded_attachments: ${payload.forwarded_attachments.length} IDs`)
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
        ...nylasFormData.getHeaders(),
      },
      body: nylasFormData as any,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Error sending message:", {
        status: response.status,
        error: errorText,
        our_payload: messageObj
      })
      return NextResponse.json({ 
        error: "Failed to send message",
        debug: {
          nylas_error: errorText,
          our_payload: messageObj
        }
      }, { status: response.status })
    }

    const data = await response.json()
    console.log('✅ Message sent successfully:', {
      messageId: data.id || data.data?.id
    })
    return NextResponse.json({ messageId: data.id || data.data?.id })

  } catch (error) {
    console.error("Error in send route:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
