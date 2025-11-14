import { NextResponse } from "next/server"
import { nylasConfig } from "@/lib/nylas"

export async function POST(request: Request) {
  try {
    // Extract query params (grantId is required, cc/bcc are optional)
    const url = new URL(request.url)
    const grantId = url.searchParams.get('grantId')
    const queryCC = url.searchParams.get('cc')
    const queryBCC = url.searchParams.get('bcc')
    
    console.log('\n🔗 COMPOSE ROUTE - PARAMETERS:')
    console.log(`  grantId: ${grantId ? '✅ ' + grantId : '❌ Missing'}`)
    console.log(`  cc param: ${queryCC ? '✅ Present' : '❌ Missing'}`)
    console.log(`  bcc param: ${queryBCC ? '✅ Present' : '❌ Missing'}`)

    // grantId is REQUIRED
    if (!grantId) {
      return NextResponse.json({ error: "Missing grantId from frontend" }, { status: 400 })
    }

    // Parse incoming FormData
    const formData = await request.formData()
    
    console.log('\n📥 RECEIVED FormData:')
    const entries = Array.from(formData.entries())
    console.log(`  Total fields: ${entries.length}`)
    
    for (const [key, value] of entries) {
      if (value instanceof File) {
        console.log(`  ${key}: [File] ${value.name} (${value.size} bytes)`)
      } else {
        const strVal = String(value)
        console.log(`  ${key}: ${strVal.length > 100 ? strVal.slice(0, 100) + '...' : strVal}`)
      }
    }

    // Get the message field and parse it
    const messageRaw = formData.get("message")
    if (!messageRaw) {
      return NextResponse.json({ error: "Missing 'message' field in FormData" }, { status: 400 })
    }

    let messageObj = JSON.parse(String(messageRaw))
    console.log('\n📋 PARSED MESSAGE OBJECT:')
    console.log(`  subject: ${messageObj.subject}`)
    console.log(`  to: ${JSON.stringify(messageObj.to)}`)
    console.log(`  cc: ${JSON.stringify(messageObj.cc || [])}`)
    console.log(`  bcc: ${JSON.stringify(messageObj.bcc || [])}`)
    console.log(`  body: ${String(messageObj.body).substring(0, 50)}...`)

    // Merge cc/bcc from query params if provided
    if (queryCC) {
      try {
        const ccArray = JSON.parse(queryCC)
        messageObj.cc = ccArray
        console.log(`\n✅ CC from query params: ${JSON.stringify(ccArray)}`)
      } catch (e) {
        console.warn('⚠️ Could not parse cc from query params')
      }
    }

    if (queryBCC) {
      try {
        const bccArray = JSON.parse(queryBCC)
        messageObj.bcc = bccArray
        console.log(`✅ BCC from query params: ${JSON.stringify(bccArray)}`)
      } catch (e) {
        console.warn('⚠️ Could not parse bcc from query params')
      }
    }

    // Create a NEW FormData to send to Nylas
    // This ensures we have the correct structure according to Nylas v3 spec
    const nylasFormData = new FormData()

    // Add the message field (now with merged cc/bcc)
    // This must be a stringified JSON object containing all non-file fields
    const finalMessageJson = JSON.stringify(messageObj)
    console.log('\n📝 FINAL MESSAGE TO SEND:')
    console.log(finalMessageJson)
    
    nylasFormData.append('message', finalMessageJson)

    // Add all file attachments from the original FormData
    // Per Nylas spec: each file should be a separate form field named with its filename
    console.log('\n📎 PROCESSING ATTACHMENTS:')
    
    // Collect all files to attach
    const attachmentsToAdd: Array<{ file: File; fieldName: string }> = []
    
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        // Skip if it's the 'message' field
        if (key !== 'message') {
          // Use the filename as the form field name (Nylas requirement)
          attachmentsToAdd.push({
            file: value,
            fieldName: value.name // Use actual filename as field name
          })
          console.log(`  - Found file: ${value.name} (${value.size} bytes, ${value.type})`)
        }
      }
    }

    // Add each attachment to the FormData
    for (const attachment of attachmentsToAdd) {
      console.log(`  - Adding attachment field: ${attachment.fieldName}`)
      nylasFormData.append(attachment.fieldName, attachment.file, attachment.fieldName)
    }

    // Send to Nylas
    const endpoint = `${nylasConfig.apiUri}/v3/grants/${encodeURIComponent(grantId)}/drafts`
    
    console.log('\n🌐 SENDING TO NYLAS:')
    console.log(`  Endpoint: ${endpoint}`)
    console.log(`  Method: POST`)
    console.log(`  Content-Type: multipart/form-data (let fetch set boundary)`)
    console.log(`  Authorization: Bearer [SET]`)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`
        // NOTE: Do NOT set Content-Type - let fetch handle it with boundary
      },
      body: nylasFormData as any
    })

    console.log('\n✅ NYLAS RESPONSE:', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type')
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ NYLAS ERROR:', {
        status: response.status,
        body: errorText
      })
      return NextResponse.json({ 
        error: 'Failed to save draft', 
        details: errorText,
        debug: {
          our_message: messageObj,
          nylas_response: errorText,
          attachmentCount: attachmentsToAdd.length
        }
      }, { status: response.status })
    }

    const result = await response.json()
    const draftId = result.data?.id || result.id
    
    console.log('\n✅ DRAFT SAVED:')
    console.log(`  ID: ${draftId}`)
    console.log(`  Attachments: ${attachmentsToAdd.length}`)
    
    return NextResponse.json({ draftId })

  } catch (error) {
    console.error('❌ ERROR IN COMPOSE ROUTE:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}