import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createRouteHandlerClient() {
  const cookieStore: any = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
      },
      // pass the cookie store directly and cast to any to satisfy types
      cookies: cookieStore as any,
    }
  )
}

export async function validateSession() {
  const supabase = await createRouteHandlerClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}