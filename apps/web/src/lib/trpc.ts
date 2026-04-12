import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../api/src/router';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/trpc`,
      headers: () => {
        // Carry over the admin secret if available (for server-side or privileged client calls)
        return {
          'x-admin-secret': process.env.ADMIN_API_SECRET || '',
        };
      },
    }),
  ],
});
