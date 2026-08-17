import { cookies } from 'next/headers';
import { verifyToken } from './jwt';
import { User } from './db';

/**
 * Retrieves the authenticated user from the auth_token JWT cookie.
 *
 * Previously this did a JsonDb lookup against data/users.json.
 * Users are now managed by Supabase Auth, so the JWT itself is the
 * source of truth — if the token is valid (correct signature + not expired),
 * the user is authenticated. We synthesise a User-shaped object from the
 * token payload so the rest of the application is unchanged.
 */
export async function getAuthUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload) return null;

    // Build a minimal User object from the JWT claims.
    // name is not stored in the token; callers that need the display name
    // should fetch it separately (e.g. from the profiles table).
    // All existing route handlers only use user.id and user.email.
    const user: User = {
      id: payload.userId,
      email: payload.email,
      name: payload.email, // safe fallback; display name not in JWT payload
      passwordHash: '',    // not stored in Supabase-based flow
      createdAt: '',
    };

    return user;
  } catch (err) {
    console.error('Error fetching authenticated user:', err);
    return null;
  }
}
