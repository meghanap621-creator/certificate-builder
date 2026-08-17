import { NextResponse } from 'next/server';
import { JsonDb, User } from '@/lib/db';
import { hashPassword, signToken } from '@/lib/jwt';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Name, email, and password are required fields.' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await JsonDb.findOne<User>('users', { email: email.toLowerCase().trim() });
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email address already exists.' },
        { status: 409 }
      );
    }

    // Create user
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const newUser: User = {
      id: userId,
      email: email.toLowerCase().trim(),
      passwordHash,
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };

    await JsonDb.insert<User>('users', newUser);

    // Initialize blank SMTP Settings for the user
    await JsonDb.insert('settings', {
      userId,
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPass: '',
      smtpSecure: false,
      smtpFrom: name.trim(),
    });

    // Create JWT Token
    const token = signToken({ userId, email: newUser.email });

    // Set cookie
    const response = NextResponse.json({
      message: 'Signup successful!',
      user: { id: userId, email: newUser.email, name: newUser.name },
    });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('Signup error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
