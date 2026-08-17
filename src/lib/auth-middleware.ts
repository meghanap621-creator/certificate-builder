import { cookies } from 'next/headers';
import { verifyToken } from './jwt';
import { JsonDb, User } from './db';

export async function getAuthUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload) return null;

    return await JsonDb.findOne<User>('users', { id: payload.userId });
  } catch (err) {
    console.error('Error fetching authenticated user:', err);
    return null;
  }
}
