import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    console.error('Session check error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
