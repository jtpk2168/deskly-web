import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
    // 1. Define public routes that don't need auth
    const publicRoutes = ['/login', '/signup', '/forgot-password', '/update-password', '/auth/callback', '/'];

    // Check if the current path is a public route
    if (publicRoutes.some(route => request.nextUrl.pathname.startsWith(route))) {
        return NextResponse.next();
    }

    // Only protect /admin routes
    if (!request.nextUrl.pathname.startsWith('/admin')) {
        return NextResponse.next();
    }

    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    )
                },
            },
        }
    );

    const {
        data: { user },
    } = await supabase.auth.getUser();

    // 1. Check if user is logged in
    if (!user) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 2. Check if user has 'admin' role
    const role = user.app_metadata?.role;

    if (role !== 'admin') {
        // Redirect non-admins to home page or show 403
        return NextResponse.redirect(new URL('/', request.url));
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths starting with /admin
         */
        '/admin/:path*',
    ],
};
