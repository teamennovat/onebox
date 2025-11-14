import { NextRequest, NextResponse } from 'next/server'
import { nylas } from '@/lib/nylas'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const {
      email,
      password,
      imapHost,
      imapPort,
      imapSecurity,
      smtpHost,
      smtpPort,
      smtpSecurity,
      userId
    } = await request.json()

    // Connect to IMAP account using Nylas API
    const response = await fetch(`${process.env.NYLAS_API_URI}/v3/connect/imap`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_NYLAS_CLIENT_ID,
        email,
        password,
        imap_host: imapHost,
        imap_port: parseInt(imapPort),
        imap_security: imapSecurity.toLowerCase(),
        smtp_host: smtpHost,
        smtp_port: parseInt(smtpPort),
        smtp_security: smtpSecurity.toLowerCase(),
        scopes: [
          'email.read_only',
          'email.send',
          'email.modify',
          'calendar.read_only',
          'calendar.modify',
          'contacts.read_only',
          'contacts.modify'
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to connect IMAP account')
    }

    const data = await response.json()
    const { grant_id: grantId } = data

    // Store the account in Supabase
    const { data: account, error: accountError } = await supabase
      .from('email_accounts')
      .insert({
        user_id: userId,
        grant_id: grantId,
        email: email,
        provider: 'imap',
        grant_status: 'valid',
        is_primary: false,
        settings: {
          imap_host: imapHost,
          imap_port: imapPort,
          imap_security: imapSecurity,
          smtp_host: smtpHost,
          smtp_port: smtpPort,
          smtp_security: smtpSecurity
        }
      })
      .select()
      .single()

    if (accountError) throw accountError

    // Check if this is the first account
    const { data: existingAccounts } = await supabase
      .from('email_accounts')
      .select('id')
      .eq('user_id', userId)

    if (existingAccounts?.length === 1) {
      await supabase
        .from('email_accounts')
        .update({ is_primary: true })
        .eq('id', account.id)
    }

    return NextResponse.json({ 
      success: true,
      account: account
    })
  } catch (error) {
    console.error('IMAP configuration error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to configure IMAP account',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}