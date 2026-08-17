import { createClient } from '@supabase/supabase-js';

/**
 * Browser-safe Supabase client using the public anon key.
 *
 * Environment variables (set in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL      – your project's REST API base URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY – public anon key (safe to expose to browsers)
 *
 * The service_role key is intentionally NOT used here.
 * Never import the service_role key in client-side or shared code.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    'Missing environment variable: NEXT_PUBLIC_SUPABASE_URL\n' +
    'Add it to your .env.local file.'
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    'Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY\n' +
    'Add it to your .env.local file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
