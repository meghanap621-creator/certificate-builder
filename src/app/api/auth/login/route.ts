import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { signToken } from '@/lib/jwt';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body ?? {};

    // --- Validation ---
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    // --- Supabase Auth ---
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: String(email).toLowerCase().trim(),
      password: String(password),
    });

    if (signInError || !data?.user) {
      // Always return the same generic message to avoid leaking whether the
      // email exists in the system.
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    const supabaseUser = data.user;
    const userId      = supabaseUser.id;
    const userEmail   = supabaseUser.email ?? String(email).toLowerCase().trim();

    // --- Resolve display name ---
    // Priority: profiles table → Supabase user_metadata → email prefix
    let displayName: string = userEmail;

    try {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();

      if (profileRow?.full_name) {
        displayName = profileRow.full_name;
      } else {
        // Fall back to the name stored in Supabase Auth user metadata (set at signup)
        const metaName =
          supabaseUser.user_metadata?.full_name ??
          supabaseUser.user_metadata?.name;
        if (metaName) displayName = metaName;
      }
    } catch {
      // profiles table may not exist — non-fatal, keep email as name.
    }

    // --- Issue auth_token cookie (same shape as before so all routes keep working) ---
    const token = signToken({ userId, email: userEmail });

    const response = NextResponse.json({
      message: 'Login successful!',
      user: { id: userId, email: userEmail, name: displayName },
    });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
