import { createClient } from '@supabase/supabase-js';
import { createNoStoreFetch } from './no-store-fetch';

// Service role client — ADMIN ONLY
// Never import this in client components or dashboard routes
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        fetch: createNoStoreFetch(),
      },
    },
  );
}
