import { NextRequest, NextResponse } from 'next/server'

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const MODEL = 'deepseek-chat'

/**
 * Strip HTML tags and entities from text
 */
function stripHtmlTags(html: string): string {
  if (!html) return ''
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, '')
  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
  // Clean up multiple spaces
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

/**
 * Generate email summary using DeepSeek AI
 * Sends full email content (subject, body, attachment names) in plain text
 */
export async function POST(request: NextRequest) {
  try {
    const { subject, body, from, to, attachments } = await request.json()

    if (!subject || !body) {
      return NextResponse.json(
        { error: 'Subject and body are required' },
        { status: 400 }
      )
    }

    if (!DEEPSEEK_API_KEY) {
      console.error('DEEPSEEK_API_KEY not configured')
      return NextResponse.json(
        { error: 'DEEPSEEK_API_KEY not configured' },
        { status: 500 }
      )
    }

    const SYSTEM_PROMPT = `You are OneBox AI, an elite email-summarization assistant. You create concise, accurate summaries that capture the essential meaning of any email thread.

ABSOLUTE RULES – NO EXCEPTIONS

1. JSON FORMAT ALWAYS
Every response must be valid JSON using this exact structure:
{
  "summary": "[concise summary]"
}
No text before or after the JSON. No commentary.

2. LENGTH REQUIREMENTS
Your summary must be:
• 2–4 sentences total
• 30–90 words unless the user requests otherwise
• Extremely concise, strictly factual, and free of filler

3. CONTENT RULES
Always include:
• The sender's main point or request
• Key decisions, deadlines, dates, numbers, or commitments
• Any required next steps
• Important context from earlier in the thread (only what matters)

Never include:
• Irrelevant details
• Full rephrasing of the entire email
• Personal greetings, sign-offs, or polite filler
• Emojis

4. CLARITY & ACCURACY
• Use neutral, professional language
• Maintain original intent with zero distortion
• Resolve pronouns (e.g., "he" → "John" if clear)
• No hallucinations — summarize only what is explicitly stated

5. STRUCTURE & TONE
• One short paragraph unless clarity requires two
• Active voice
• No quotes unless required for accuracy

QUALITY CHECKLIST (internal)
✓ Valid JSON only  
✓ 30–90 words  
✓ 2–4 sentences  
✓ Accurately reflects the email's intent  
✓ Includes key actions, deadlines, and commitments  
✓ No filler, no commentary, no chit-chat  

Your mission: Produce the cleanest, most accurate email summaries possible.`

    // Prepare email content - strip HTML and include metadata
    const plainTextBody = stripHtmlTags(body)
    const plainTextSubject = stripHtmlTags(subject)

    // Build attachment list (names only, no content)
    const attachmentNames =
      attachments && attachments.length > 0
        ? `\n\nAttachments: ${attachments.map((a: any) => a.filename || a.name).join(', ')}`
        : ''

    // Build recipient list
    const toList = to && to.length > 0 ? to.map((t: any) => t.email).join(', ') : ''

    // Build complete email content for AI
    const fullEmailContent = `FROM: ${from?.email || 'unknown'}
TO: ${toList}
SUBJECT: ${plainTextSubject}

${plainTextBody}${attachmentNames}`

    console.log('🤖 Calling DeepSeek AI for email summary...')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 256,
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: fullEmailContent },
        ],
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    console.log(`🔄 AI API response status: ${response.status}`)

    if (!response.ok) {
      const errorData = await response.text()
      console.error(`❌ AI API error: ${response.status}`, errorData)
      return NextResponse.json(
        { error: 'Failed to generate summary' },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log(`📥 AI response:`, JSON.stringify(data, null, 2))

    const aiResponse = data.choices?.[0]?.message?.content

    if (!aiResponse) {
      console.error('❌ No response from AI')
      return NextResponse.json(
        { error: 'No response from AI' },
        { status: 500 }
      )
    }

    console.log(`📝 AI raw response: ${aiResponse}`)

    // Clean up markdown code blocks if present
    let cleanedResponse = aiResponse.trim()
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '')
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\n?/, '').replace(/\n?```$/, '')
    }

    console.log(`🧹 Cleaned response: ${cleanedResponse}`)

    // Parse JSON response from AI
    const parsed = JSON.parse(cleanedResponse)
    const summary = parsed.summary

    if (!summary) {
      console.error('❌ No summary in AI response')
      return NextResponse.json(
        { error: 'Invalid response format' },
        { status: 500 }
      )
    }

    console.log(`✅ Summary generated: ${summary}`)
    return NextResponse.json({ summary }, { status: 200 })
  } catch (error) {
    console.error('❌ Summary generation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
