'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';

const UploadContext = createContext(null);

export function UploadProvider({ children }) {
  const [uploadState, setUploadState] = useState({
    isUploading: false,
    progress: 0,
    stage: '', // 'uploading', 'validating', 'pending', 'queued', 'indexing'
    fileName: '',
    error: null,
    completedVideoId: null,
  });

  // Callbacks for when upload completes
  const onCompleteCallbacksRef = useRef(new Set());

  const startUpload = useCallback((fileName) => {
    setUploadState({
      isUploading: true,
      progress: 0,
      stage: 'uploading',
      fileName,
      error: null,
      completedVideoId: null,
    });
  }, []);

  const updateProgress = useCallback((progress) => {
    setUploadState(prev => ({ ...prev, progress }));
  }, []);

  const setStage = useCallback((stage) => {
    setUploadState(prev => ({ ...prev, stage }));
  }, []);

  const completeUpload = useCallback((videoId) => {
    setUploadState(prev => ({
      ...prev,
      isUploading: false,
      progress: 100,
      stage: '',
      completedVideoId: videoId,
    }));

    // Call all registered callbacks
    onCompleteCallbacksRef.current.forEach(callback => {
      try {
        callback(videoId);
      } catch (e) {
        console.error('Upload complete callback error:', e);
      }
    });

    // Clear completed state after 3 seconds
    setTimeout(() => {
      setUploadState(prev => ({
        ...prev,
        completedVideoId: null,
        fileName: '',
      }));
    }, 3000);
  }, []);

  // Subscribe to upload completion events
  const onUploadComplete = useCallback((callback) => {
    onCompleteCallbacksRef.current.add(callback);
    // Return unsubscribe function
    return () => {
      onCompleteCallbacksRef.current.delete(callback);
    };
  }, []);

  const failUpload = useCallback((error) => {
    setUploadState(prev => ({
      ...prev,
      isUploading: false,
      error: error,
      stage: '',
    }));
  }, []);

  const clearError = useCallback(() => {
    setUploadState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);

  return (
    <UploadContext.Provider value={{
      ...uploadState,
      startUpload,
      updateProgress,
      setStage,
      completeUpload,
      failUpload,
      clearError,
      onUploadComplete,
    }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
}
