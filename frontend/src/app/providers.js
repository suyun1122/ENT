'use client';

import { UploadProvider } from './contexts/UploadContext';
import UploadIndicator from './components/UploadIndicator';

export function Providers({ children }) {
  return (
    <UploadProvider>
      {children}
      <UploadIndicator />
    </UploadProvider>
  );
}



