'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';

const UploadContext = createContext(null);

export function UploadProvider({ children }) {
  const [uploadState, setUploadState] = useState({
    isUploading: false,
    progress: 0,
    stage: '', // 'uploading', 'validating', 'pending', 'queued', 'indexing'
    indexingStage: '', // Twelve Labs indexing status
    fileName: '',
    error: null,
    completedVideoId: null,
    // Detection tracking
    isDetecting: false,
    detectionVideoId: null,
    // Analysis tracking
    isAnalyzing: false,
    // Track completion of each step
    indexingComplete: false,
    detectionComplete: false,
    analysisComplete: false,
  });

  // Callbacks for when upload completes
  const onCompleteCallbacksRef = useRef(new Set());

  const startUpload = useCallback((fileName) => {
    setUploadState({
      isUploading: true,
      progress: 0,
      stage: 'uploading',
      indexingStage: '',
      fileName,
      error: null,
      completedVideoId: null,
      isDetecting: false,
      detectionVideoId: null,
      isAnalyzing: false,
      indexingComplete: false,
      detectionComplete: false,
      analysisComplete: false,
    });
  }, []);

  const updateProgress = useCallback((progress) => {
    setUploadState(prev => ({ ...prev, progress }));
  }, []);

  const setStage = useCallback((stage) => {
    setUploadState(prev => ({
      ...prev,
      stage,
      indexingStage: stage, // Track indexing stage separately
    }));
  }, []);

  const completeUpload = useCallback((videoId) => {
    setUploadState(prev => {
      const allComplete = prev.detectionComplete && prev.analysisComplete;
      return {
        ...prev,
        indexingComplete: true,
        indexingStage: 'ready',
        // Only clear isUploading if all steps complete
        isUploading: !allComplete,
        progress: 100,
        completedVideoId: videoId,
        stage: allComplete ? '' : prev.stage,
      };
    });

    // Call all registered callbacks
    onCompleteCallbacksRef.current.forEach(callback => {
      try {
        callback(videoId);
      } catch (e) {
        console.error('Upload complete callback error:', e);
      }
    });
  }, []);

  // Start detection tracking (called when Railway upload starts)
  const startDetection = useCallback((videoId) => {
    setUploadState(prev => ({
      ...prev,
      isDetecting: true,
      detectionVideoId: videoId,
      detectionComplete: false,
    }));
  }, []);

  // Complete detection tracking
  const completeDetection = useCallback(() => {
    setUploadState(prev => {
      const allComplete = prev.indexingComplete && prev.analysisComplete;
      return {
        ...prev,
        isDetecting: false,
        detectionVideoId: null,
        detectionComplete: true,
        isUploading: !allComplete,
        stage: allComplete ? '' : prev.stage,
      };
    });

    // Clear completed state after showing success (only if all complete)
    setTimeout(() => {
      setUploadState(prev => {
        if (prev.indexingComplete && prev.detectionComplete && prev.analysisComplete) {
          return {
            ...prev,
            completedVideoId: null,
            fileName: '',
            indexingComplete: false,
            detectionComplete: false,
            analysisComplete: false,
          };
        }
        return prev;
      });
    }, 5000);
  }, []);

  // Start analysis tracking
  const startAnalysis = useCallback((videoId) => {
    setUploadState(prev => {
      // Only track if this is the video being uploaded
      if (prev.completedVideoId !== videoId && prev.detectionVideoId !== videoId) {
        return prev;
      }
      return {
        ...prev,
        isAnalyzing: true,
        analysisComplete: false,
      };
    });
  }, []);

  // Complete analysis tracking
  const completeAnalysis = useCallback((videoId) => {
    setUploadState(prev => {
      // Only track if this is the video being uploaded
      if (prev.completedVideoId !== videoId && prev.detectionVideoId !== videoId) {
        return prev;
      }
      const allComplete = prev.indexingComplete && prev.detectionComplete;
      return {
        ...prev,
        isAnalyzing: false,
        analysisComplete: true,
        isUploading: !allComplete,
        stage: allComplete ? '' : prev.stage,
      };
    });

    // Clear completed state after showing success (only if all complete)
    setTimeout(() => {
      setUploadState(prev => {
        if (prev.indexingComplete && prev.detectionComplete && prev.analysisComplete) {
          return {
            ...prev,
            completedVideoId: null,
            fileName: '',
            indexingComplete: false,
            detectionComplete: false,
            analysisComplete: false,
          };
        }
        return prev;
      });
    }, 5000);
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

  const dismissComplete = useCallback(() => {
    setUploadState(prev => ({
      ...prev,
      completedVideoId: null,
      fileName: '',
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
      dismissComplete,
      onUploadComplete,
      startDetection,
      completeDetection,
      startAnalysis,
      completeAnalysis,
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
