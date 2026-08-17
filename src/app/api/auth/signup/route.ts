import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { JsonDb } from '@/lib/db';
import { signToken } from '@/lib/jwt';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body ?? {};

    // --- Validation ---
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required fields.' },
        { status: 400 }
      );
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name must be a non-empty string.' }, { status: 400 });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanName  = String(name).trim();

    // --- Supabase Auth signup ---
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        // Store name in Supabase Auth user metadata so it's accessible without
        // an extra round-trip to the profiles table.
        data: { full_name: cleanName },
      },
    });

    if (signUpError) {
      // Surface Supabase errors clearly instead of swallowing them.
      const status =
        signUpError.message?.toLowerCase().includes('already registered') ? 409 : 400;
      return NextResponse.json({ error: signUpError.message }, { status });
    }

    const supabaseUser = data?.user;
    if (!supabaseUser) {
      // Supabase returned no error but also no user — unexpected.
      return NextResponse.json(
        { error: 'Signup did not return a user. Please try again.' },
        { status: 500 }
      );
    }

    const userId = supabaseUser.id; // Supabase UUID — used as canonical userId

    // --- Upsert profile row (stores name; non-fatal if table absent) ---
    try {
      await supabase.from('profiles').upsert(
        { id: userId, email: cleanEmail, full_name: cleanName, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );
    } catch {
      // profiles table may not exist yet; don't fail signup over it.
    }

    // --- Seed blank SMTP settings so Settings page works immediately ---
    try {
      const existing = await JsonDb.findOne('settings', { userId });
      if (!existing) {
        await JsonDb.insert('settings', {
          id: userId,
          userId,
          smtpHost: '',
          smtpPort: 587,
          smtpUser: '',
          smtpPass: '',
          smtpFromEmail: '',
          smtpFrom: cleanName,
        });
      }
    } catch {
      // Non-fatal — user can configure SMTP later.
    }

    // --- Issue the existing auth_token cookie so all other routes keep working ---
    // The token carries the same payload shape the rest of the app (auth-middleware,
    // /api/auth/me, etc.) already relies on — only the source of the userId changed.
    const token = signToken({ userId, email: cleanEmail });

    const response = NextResponse.json({
      message: 'Signup successful!',
      user: { id: userId, email: cleanEmail, name: cleanName },
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
    console.error('Signup error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
