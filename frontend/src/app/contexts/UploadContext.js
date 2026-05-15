'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

const UploadContext = createContext(null);

const initialUploadState = {
  isUploading: false,
  progress: 0,
  stage: '',
  fileName: '',
  error: null,
  completedVideoId: null,
  isDetecting: false,
  detectionComplete: false,
};

export function UploadProvider({ children }) {
  const [uploadState, setUploadState] = useState(initialUploadState);
  const onCompleteCallbacksRef = useRef(new Set());

  const notifyComplete = useCallback((videoId) => {
    onCompleteCallbacksRef.current.forEach((callback) => {
      try {
        callback(videoId);
      } catch (error) {
        console.error('Upload complete callback error:', error);
      }
    });
  }, []);

  const startUpload = useCallback((fileName) => {
    setUploadState({
      ...initialUploadState,
      isUploading: true,
      stage: 'uploading',
      fileName,
    });
  }, []);

  const updateProgress = useCallback((progress) => {
    setUploadState((prev) => ({ ...prev, progress }));
  }, []);

  const setStage = useCallback((stage) => {
    setUploadState((prev) => ({
      ...prev,
      stage,
      isDetecting: stage === 'detecting',
    }));
  }, []);

  const completeUpload = useCallback((videoId) => {
    setUploadState((prev) => ({
      ...prev,
      isUploading: false,
      isDetecting: false,
      detectionComplete: true,
      progress: 100,
      stage: 'complete',
      completedVideoId: videoId,
    }));

    notifyComplete(videoId);

    setTimeout(() => {
      setUploadState((prev) => (
        prev.completedVideoId === videoId
          ? { ...initialUploadState }
          : prev
      ));
    }, 5000);
  }, [notifyComplete]);

  const startDetection = useCallback(() => {
    setUploadState((prev) => ({
      ...prev,
      isDetecting: true,
      detectionComplete: false,
      stage: 'detecting',
    }));
  }, []);

  const completeDetection = useCallback(() => {
    setUploadState((prev) => ({
      ...prev,
      isDetecting: false,
      detectionComplete: true,
    }));
  }, []);

  const failUpload = useCallback((error) => {
    setUploadState((prev) => ({
      ...prev,
      isUploading: false,
      isDetecting: false,
      error,
      stage: '',
    }));
  }, []);

  const clearError = useCallback(() => {
    setUploadState((prev) => ({ ...prev, error: null }));
  }, []);

  const dismissComplete = useCallback(() => {
    setUploadState((prev) => ({
      ...prev,
      completedVideoId: null,
      fileName: '',
      stage: '',
    }));
  }, []);

  const onUploadComplete = useCallback((callback) => {
    onCompleteCallbacksRef.current.add(callback);
    return () => {
      onCompleteCallbacksRef.current.delete(callback);
    };
  }, []);

  return (
    <UploadContext.Provider
      value={{
        ...uploadState,
        startUpload,
        updateProgress,
        setStage,
        completeUpload,
        failUpload,
        clearError,
        dismissComplete,
        onUploadComplete,
        startDetection,
        completeDetection,
        startAnalysis: () => {},
        completeAnalysis: () => {},
      }}
    >
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
