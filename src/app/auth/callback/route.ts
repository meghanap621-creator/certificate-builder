import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  request: Request
) {
  const requestUrl =
    new URL(request.url);

  const code =
    requestUrl.searchParams.get(
      'code'
    );

  const error =
    requestUrl.searchParams.get(
      'error'
    );

  const errorDescription =
    requestUrl.searchParams.get(
      'error_description'
    );

  /*
   * Google/Supabase authentication failed.
   */
  if (error) {
    console.error(
      'Google OAuth error:',
      {
        error,
        errorDescription,
      }
    );

    return NextResponse.redirect(
      new URL(
        `/login?error=google_auth_failed`,
        requestUrl.origin
      )
    );
  }

  /*
   * PKCE must return a code.
   */
  if (!code) {
    console.error(
      'Google OAuth callback: authorization code is missing.'
    );

    return NextResponse.redirect(
      new URL(
        '/login?error=google_auth_failed',
        requestUrl.origin
      )
    );
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (
    !supabaseUrl ||
    !supabaseAnonKey
  ) {
    console.error(
      'Google OAuth callback: Supabase environment variables are missing.'
    );

    return NextResponse.redirect(
      new URL(
        '/login?error=server_configuration_error',
        requestUrl.origin
      )
    );
  }

  /*
   * Create a server-side Supabase client.
   *
   * IMPORTANT:
   * This uses the public anon key.
   * Never use SUPABASE_SERVICE_ROLE_KEY here.
   */
  const supabase =
    createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          flowType: 'pkce',
          autoRefreshToken: true,
          persistSession: false,
        },
      }
    );

  /*
   * Exchange Google's authorization code
   * for a Supabase session.
   */
  const {
    data,
    error: exchangeError,
  } =
    await supabase.auth.exchangeCodeForSession(
      code
    );

  if (
    exchangeError ||
    !data.session ||
    !data.user
  ) {
    console.error(
      'Google OAuth code exchange failed:',
      exchangeError
    );

    return NextResponse.redirect(
      new URL(
        '/login?error=google_auth_failed',
        requestUrl.origin
      )
    );
  }

  /*
   * At this point Google authentication
   * was successful.
   *
   * The next step is to connect this Supabase
   * user to Certificate Builder's existing
   * authentication/session system.
   */

  console.log(
    'Google authentication successful:',
    {
      userId:
        data.user.id,

      email:
        data.user.email,

      provider:
        data.user.app_metadata
          ?.provider,
    }
  );

  /*
   * IMPORTANT:
   *
   * We temporarily store the Supabase access
   * and refresh tokens in an HTTP-only cookie.
   *
   * The existing /api/auth/me endpoint will
   * be updated next to understand this session.
   */
  const response =
    NextResponse.redirect(
      new URL(
        '/dashboard',
        requestUrl.origin
      )
    );

  response.cookies.set(
    'sb-access-token',
    data.session.access_token,
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        'production',
      sameSite: 'lax',
      path: '/',
      maxAge:
        data.session.expires_in ||
        3600,
    }
  );

  response.cookies.set(
    'sb-refresh-token',
    data.session.refresh_token,
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        'production',
      sameSite: 'lax',
      path: '/',
      maxAge:
        60 * 60 * 24 * 30,
    }
  );

  return response;
}