import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Creates a Supabase client for use in route handlers
 */
export async function createRouteHandlerClient() {
  const cookieStore: any = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: cookieStore as any,
    }
  )
}

/**
 * Gets the current session, if any
 */
export async function getSession() {
  const supabase = await createRouteHandlerClient()
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  } catch (error) {
    console.error('Error:', error)
    return null
  }
}

/**
 * Gets the current user, if any
 */
export async function getUser() {
  const session = await getSession()
  return session?.user ?? null
}