import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
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
      return NextResponse.json(
        { error: 'Name must be a non-empty string.' },
        { status: 400 }
      );
    }

    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanName = String(name).trim();

    // --- Supabase Auth signup ---
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        // Store name in Auth user metadata — accessible without a profiles round-trip.
        data: { full_name: cleanName },
      },
    });

    if (signUpError) {
      const status =
        signUpError.message?.toLowerCase().includes('already registered') ? 409 : 400;
      return NextResponse.json({ error: signUpError.message }, { status });
    }

    const supabaseUser = data?.user;
    if (!supabaseUser) {
      return NextResponse.json(
        { error: 'Signup did not return a user. Please try again.' },
        { status: 500 }
      );
    }

    const userId = supabaseUser.id;

    // --- Upsert profile row (non-fatal if table is absent or RLS blocks it) ---
    try {
      await supabase
        .from('profiles')
        .upsert(
          {
            id: userId,
            email: cleanEmail,
            full_name: cleanName,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
    } catch {
      // profiles table may not exist yet — don't fail signup over it.
    }

    // --- Issue auth_token cookie so all existing routes keep working ---
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
