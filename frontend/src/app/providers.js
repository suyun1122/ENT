'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Cache for 1 hour (surgical analysis doesn't change)
        staleTime: 60 * 60 * 1000, // 1 hour
        // Keep in cache for 24 hours
        gcTime: 24 * 60 * 60 * 1000, // 24 hours (formerly cacheTime)
        // Retry failed requests once
        retry: 1,
        // Don't refetch on window focus for this app
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}



