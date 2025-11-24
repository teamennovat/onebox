
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => request.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          // If the cookie is updated, update the response headers
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove: (name: string, options: CookieOptions) => {
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Refresh session if expired - required for Server Components
  await supabase.auth.refreshSession()
  
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const url = request.nextUrl.clone()

  // Redirect root to signin if not authenticated, otherwise to connect
  if (url.pathname === '/') {
    if (!session) {
      url.pathname = '/auth/signin'
      return NextResponse.redirect(url)
    } else {
      url.pathname = '/connect'
      return NextResponse.redirect(url)
    }
  }

  // Protect dashboard routes
  if (url.pathname.startsWith('/dashboard')) {
    if (!session) {
      url.pathname = '/auth/signin'
      return NextResponse.redirect(url)
    }
  }

  // Protect connect routes
  if (url.pathname.startsWith('/connect')) {
    if (!session) {
      url.pathname = '/auth/signin'
      return NextResponse.redirect(url)
    }
  }

  // Redirect logged-in users from signin to connect
  if (url.pathname === '/auth/signin') {
    if (session) {
      url.pathname = '/connect'
      return NextResponse.redirect(url)
    }
  }

  return response
}

// Only run this middleware for the root, dashboard, connect, and signin routes
export const config = {
  matcher: ['/', '/dashboard/:path*', '/connect/:path*', '/auth/signin'],
}