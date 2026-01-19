"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  WrenchScrewdriverIcon,
  PencilIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import ClickableVideo from "./ClickableVideo";
import ClipChat from "./ClipChat";
import { ToolFilterPanel } from "./ToolDetectionOverlay";
import ToolUsageTimeline from "./ToolUsageTimeline";
import ToolUsageStatistics from "./ToolUsageStatistics";
import { jsPDF } from "jspdf";

// Optional default geolocation (configure via NEXT_PUBLIC_DEFAULT_LAT/LON)
const DEFAULT_LAT = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT || "");
const DEFAULT_LON = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LON || "");
const HAS_DEFAULT_GEO =
  Number.isFinite(DEFAULT_LAT) && Number.isFinite(DEFAULT_LON);
const DEFAULT_GEOLOCATION = HAS_DEFAULT_GEO
    ? { coords: { latitude: DEFAULT_LAT, longitude: DEFAULT_LON } }
    : null;

export default function ClipBento({ clipData, videoId, initialAnalysisData }) {
  const [operatingNote, setOperatingNote] = useState(null);
  const [chapters, setChapters] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [chaptersError, setChaptersError] = useState(null);
  const [isEditingSOAP, setIsEditingSOAP] = useState({
    Subjective: false,
    Objective: false,
    Assessment: false,
    Plan: false,
  });
  const [editedSOAP, setEditedSOAP] = useState({
    Subjective: "",
    Objective: "",
    Assessment: "",
    Plan: "",
  });

  // Tool Detection State
  const [toolDetectionData, setToolDetectionData] = useState(null);
  const [isLoadingToolDetection, setIsLoadingToolDetection] = useState(false);
  const [toolDetectionError, setToolDetectionError] = useState(null);
  const [showToolDetection, setShowToolDetection] = useState(true);
  const [enabledTools, setEnabledTools] = useState(null); // null means all enabled
  const [toolDetectionProgress, setToolDetectionProgress] = useState(0);
  const [toolDetectionStage, setToolDetectionStage] = useState('initializing');
  const [activeTab, setActiveTab] = useState('tool'); // 'tool', 'timeline', 'soap'

  // Ref to control polling lifecycle
  const pollingRef = React.useRef({ active: false, timeoutId: null });

  // Ref to track if detection is loaded or started (avoids duplicate requests)
  const detectionLoadedRef = React.useRef(false);
  const detectionStartedRef = React.useRef(false);

  // Auto-load tool detection when videoId is available
  useEffect(() => {
    // Reset state for new videoId
    detectionLoadedRef.current = false;
    detectionStartedRef.current = false;

    // Stop any existing polling before starting new one
    pollingRef.current.active = false;
    if (pollingRef.current.timeoutId) {
      clearTimeout(pollingRef.current.timeoutId);
      pollingRef.current.timeoutId = null;
    }

    const loadToolDetection = async () => {
      if (!videoId) return;

      // Skip if we already have detection data loaded or started
      if (detectionLoadedRef.current || detectionStartedRef.current) {
        console.log('[Tool Detection] Already loaded or started, skipping');
        return;
      }

      // Mark as started immediately to prevent duplicate requests
      detectionStartedRef.current = true;

      setIsLoadingToolDetection(true);
      setToolDetectionError(null);
      setToolDetectionProgress(0);
      setToolDetectionStage('initializing');

      try {
        // 1. First, try to load from static files (pre-deployed detections)
        console.log('[Tool Detection] Checking static file...');
        const staticResponse = await fetch(`/detections/${videoId}.json`);

        if (staticResponse.ok) {
          console.log('[Tool Detection] Loaded from static file');
          const staticData = await staticResponse.json();
          detectionLoadedRef.current = true;
          setToolDetectionData(staticData);
          setToolDetectionProgress(100);
          setToolDetectionStage('completed');
          setIsLoadingToolDetection(false);
          return;
        }

        // 2. Static file not found, check API (Blob storage or processing)
        console.log('[Tool Detection] Static file not found, checking API...');
        const response = await fetch(`/api/detect-tools/${videoId}`);
        const data = await response.json();

        if (data.status === "completed") {
          console.log('[Tool Detection] Loaded from API/Blob');
          detectionLoadedRef.current = true;
          setToolDetectionData(data.data);
          setToolDetectionProgress(100);
          setToolDetectionStage('completed');
          setIsLoadingToolDetection(false);
        } else if (data.status === "not_found") {
          console.log('[Tool Detection] No results found, checking if we can start processing...');
          setIsLoadingToolDetection(true);

          // Try to get blob URL from mapping first (saved during upload)
          let videoUrl = null;
          try {
            const mappingResponse = await fetch(`/api/video-urls/${videoId}`);
            const mappingData = await mappingResponse.json();
            if (mappingData.status === 'found' && mappingData.blobUrl) {
              console.log('[Tool Detection] Found blob URL from mapping:', mappingData.blobUrl);
              videoUrl = mappingData.blobUrl;
            }
          } catch (e) {
            console.log('[Tool Detection] Could not fetch blob URL mapping:', e.message);
          }

          // No fallback to HLS URL - it doesn't work for tool detection
          // Tool detection will be started by UploadVideo.js when indexing completes
          if (!videoUrl) {
            console.log('[Tool Detection] No blob URL mapping found - waiting for upload process to trigger detection');
            // Start polling to check when detection becomes available
            // (triggered by UploadVideo.js after indexing completes)
            setIsLoadingToolDetection(true);
            setToolDetectionStage('waiting for upload');
            startPolling(videoId);
            return;
          }

          if (videoUrl) {
            // Start processing in background with video URL
            const startResponse = await fetch(`/api/detect-tools/${videoId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ blobUrl: videoUrl }),
            });
            const startData = await startResponse.json();
            console.log("[Tool Detection] Processing started:", startData);

            // Handle different responses
            if (startData.status === "started" || startData.status === "processing") {
              // Processing started or already in progress - poll for results
              startPolling(videoId);
            } else if (startData.status === "completed") {
              // Already completed - fetch the results
              console.log("[Tool Detection] Already completed, fetching results...");
              const resultsResponse = await fetch(`/api/detect-tools/${videoId}`);
              const resultsData = await resultsResponse.json();
              if (resultsData.status === "completed" && resultsData.data) {
                detectionLoadedRef.current = true;
                setToolDetectionData(resultsData.data);
                setToolDetectionProgress(100);
                setToolDetectionStage('completed');
              }
              setIsLoadingToolDetection(false);
            } else {
              console.log("[Tool Detection] Could not start processing:", startData.message);
              setToolDetectionError(startData.message || "Could not start tool detection");
              setIsLoadingToolDetection(false);
              detectionStartedRef.current = false; // Allow retry on error
            }
          } else {
            console.log("[Tool Detection] No video URL available for processing");
            setToolDetectionError("Video URL not available for tool detection");
            setIsLoadingToolDetection(false);
            detectionStartedRef.current = false; // Allow retry on error
          }
        } else if (data.status === "processing") {
          console.log("[Tool Detection] Already processing, polling...");
          setIsLoadingToolDetection(true);

          // Show initial progress based on elapsed time
          if (data.elapsedSeconds !== undefined) {
            const elapsedSeconds = data.elapsedSeconds;
            const estimatedProgress = Math.min(90, Math.round((elapsedSeconds / 120) * 90));
            setToolDetectionProgress(estimatedProgress);

            let stage;
            if (elapsedSeconds >= 120) {
              stage = 'finalizing (taking longer than expected, please wait...)';
            } else if (elapsedSeconds < 10) {
              stage = 'downloading video';
            } else if (elapsedSeconds < 20) {
              stage = 'loading AI model';
            } else if (elapsedSeconds < 100) {
              stage = 'analyzing frames';
            } else {
              stage = 'saving results';
            }
            setToolDetectionStage(stage);
          }

          startPolling(videoId);
        }
      } catch (error) {
        console.error("[Tool Detection] Error loading:", error);
        setToolDetectionError(error.message);
        setIsLoadingToolDetection(false);
        detectionStartedRef.current = false; // Allow retry on error
      }
    };

    loadToolDetection();

    // Cleanup: stop polling when component unmounts or videoId changes
    return () => {
      console.log('[Tool Detection] Cleaning up polling...');
      pollingRef.current.active = false;
      if (pollingRef.current.timeoutId) {
        clearTimeout(pollingRef.current.timeoutId);
        pollingRef.current.timeoutId = null;
      }
    };
  }, [videoId]);

  // Start polling for tool detection results
  const startPolling = (videoId) => {
    const maxAttempts = 60; // 5 minutes (5s interval)
    let attempts = 0;

    // Mark polling as active
    pollingRef.current.active = true;
    console.log(`[Tool Detection] Starting polling for ${videoId}`);

    const poll = async () => {
      // Check if polling was cancelled
      if (!pollingRef.current.active) {
        console.log('[Tool Detection] Polling cancelled');
        return;
      }

      try {
        const response = await fetch(`/api/detect-tools/${videoId}`);
        const data = await response.json();

        // Log full API response for debugging
        console.log('[Tool Detection] API response:', data);

        // Check again after fetch (component might have unmounted)
        if (!pollingRef.current.active) {
          console.log('[Tool Detection] Polling cancelled after fetch');
          return;
        }

        if (data.status === "completed") {
          console.log("[Tool Detection] Processing complete!");
          pollingRef.current.active = false;
          detectionLoadedRef.current = true;
          setToolDetectionData(data.data);
          setToolDetectionProgress(100);
          setToolDetectionStage('completed');
          setIsLoadingToolDetection(false);
          return;
        } else if (data.status === "error") {
          console.error("[Tool Detection] Processing error:", data.error);
          pollingRef.current.active = false;
          setToolDetectionError(data.error);
          setIsLoadingToolDetection(false);
          return;
        } else if (data.status === "not_found") {
          // Not started yet - waiting for upload process to trigger detection
          console.log(`[Tool Detection] Not found - waiting for upload to trigger detection`);
          setToolDetectionProgress(0);
          setToolDetectionStage('waiting for video upload to complete');
        } else if (data.status === "processing") {
          // Use elapsed time based progress estimation
          const elapsedSeconds = data.elapsedSeconds || (attempts * 5);
          // Estimate: ~2 minutes (120s) for typical video processing
          const estimatedProgress = Math.min(90, Math.round((elapsedSeconds / 120) * 90));

          let stage;
          if (elapsedSeconds >= 120) {
            stage = 'finalizing (taking longer than expected, please wait...)';
          } else if (elapsedSeconds < 10) {
            stage = 'downloading video';
          } else if (elapsedSeconds < 20) {
            stage = 'loading AI model';
          } else if (elapsedSeconds < 100) {
            stage = 'analyzing frames';
          } else {
            stage = 'saving results';
          }

          console.log(`[Tool Detection] Elapsed: ${elapsedSeconds}s, estimated progress: ${estimatedProgress}%`);
          setToolDetectionProgress(estimatedProgress);
          setToolDetectionStage(stage);
        }

        attempts++;
        if (attempts < maxAttempts && pollingRef.current.active) {
          pollingRef.current.timeoutId = setTimeout(poll, 5000); // Poll every 5 seconds
        } else if (attempts >= maxAttempts) {
          pollingRef.current.active = false;
          setToolDetectionError("Processing timeout - please try again later");
          setIsLoadingToolDetection(false);
        }
      } catch (error) {
        console.error("[Tool Detection] Poll error:", error);
        pollingRef.current.active = false;
        setToolDetectionError(error.message);
        setIsLoadingToolDetection(false);
      }
    };

    poll();
  };

  const handleToggleTool = (toolName) => {
    setEnabledTools((prev) => {
      if (prev === null) {
        // First toggle: disable this tool
        const allTools = Object.values(toolDetectionData?.classes || {});
        return allTools.filter((t) => t !== toolName);
      } else {
        if (prev.includes(toolName)) {
          // Remove tool from enabled list
          const newList = prev.filter((t) => t !== toolName);
          return newList.length === 0 ? null : newList;
        } else {
          // Add tool to enabled list
          return [...prev, toolName];
        }
      }
    });
  };

  // Surgical analysis state
  const [surgicalAnalysisData, setSurgicalAnalysisData] = useState(null);
  const [isLoadingSurgicalAnalysis, setIsLoadingSurgicalAnalysis] = useState(false);
  const [surgicalAnalysisError, setSurgicalAnalysisError] = useState(null);
  const [surgicalAnalysisProgress, setSurgicalAnalysisProgress] = useState(0);
  const [surgicalAnalysisStage, setSurgicalAnalysisStage] = useState('initializing');

  // Load surgical analysis when videoId is available
  useEffect(() => {
    const loadSurgicalAnalysis = async () => {
      if (!videoId) return;

      // If we have initialAnalysisData from parent component, use it first
      if (initialAnalysisData) {
        console.log('[Surgical Analysis] Using initial data from parent component');
        setSurgicalAnalysisData(initialAnalysisData);
        setSurgicalAnalysisProgress(100);
        setSurgicalAnalysisStage('completed');
        setIsLoadingSurgicalAnalysis(false);
        return;
      }

      setIsLoadingSurgicalAnalysis(true);
      setSurgicalAnalysisError(null);
      setSurgicalAnalysisProgress(0);
      setSurgicalAnalysisStage('initializing');

      try {
        // 1. Try to load from static files first (pre-deployed analysis)
        console.log('[Surgical Analysis] Checking static file...');
        const staticResponse = await fetch(`/analysis/${videoId}.json`);

        if (staticResponse.ok) {
          console.log('[Surgical Analysis] Loaded from static file');
          const staticData = await staticResponse.json();
          setSurgicalAnalysisData(staticData);
          setSurgicalAnalysisProgress(100);
          setSurgicalAnalysisStage('completed');
          setIsLoadingSurgicalAnalysis(false);
          return;
        }

        // 2. Static file not found, check API (Blob storage or processing)
        console.log('[Surgical Analysis] Static file not found, checking API...');
        const response = await fetch(`/api/analysis/${videoId}?t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        const data = await response.json();

        if (data.status === "completed") {
          console.log('[Surgical Analysis] Loaded from API/Blob');
          setSurgicalAnalysisData(data.data);
          setSurgicalAnalysisProgress(100);
          setSurgicalAnalysisStage('completed');
          setIsLoadingSurgicalAnalysis(false);
        } else if (data.status === "not_found") {
          console.log('[Surgical Analysis] No results found, starting processing...');
          setIsLoadingSurgicalAnalysis(true);
          const startResponse = await fetch(`/api/analysis/${videoId}`, { method: "POST" });
          const startData = await startResponse.json();
          console.log('[Surgical Analysis] Processing started:', startData);
          pollSurgicalAnalysis(videoId);
        } else if (data.status === "processing") {
          console.log('[Surgical Analysis] Already processing, polling...');
          setIsLoadingSurgicalAnalysis(true);
          setSurgicalAnalysisProgress(data.progress || 0);
          setSurgicalAnalysisStage(data.stage || 'processing');
          pollSurgicalAnalysis(videoId);
        }
      } catch (error) {
        console.error('[Surgical Analysis] Error loading:', error);
        setSurgicalAnalysisError(error.message);
        setIsLoadingSurgicalAnalysis(false);
      }
    };

    loadSurgicalAnalysis();
  }, [videoId, initialAnalysisData]);

  // Poll surgical analysis status
  // refreshType: 'all', 'timeline', or 'soap'
  const pollSurgicalAnalysis = async (videoId, refreshType = 'all') => {
    const maxAttempts = 60; // 5 minutes (5s interval)
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/analysis/${videoId}?t=${Date.now()}`, {
          cache: 'no-store'
        });
        const data = await response.json();

        if (data.status === "completed") {
          // For partial refresh, check if the specific field has data (not null)
          // If null, the refresh is still in progress
          if (refreshType === 'timeline') {
            if (data.data?.chapters !== null && data.data?.chapters !== undefined) {
              console.log(`[Surgical Analysis] timeline processing completed`);
              setChapters(data.data.chapters);
              setIsLoadingTimeline(false);
            } else {
              // chapters is null - still processing, continue polling
              console.log(`[Surgical Analysis] timeline still processing (chapters is null)...`);
              attempts++;
              if (attempts < maxAttempts) {
                setTimeout(poll, 5000);
              } else {
                console.error('[Surgical Analysis] Timeline refresh timed out');
                setIsLoadingTimeline(false);
              }
            }
            return;
          } else if (refreshType === 'soap') {
            if (data.data?.operative_note !== null && data.data?.operative_note !== undefined) {
              console.log(`[Surgical Analysis] soap processing completed`);
              setOperatingNote(data.data.operative_note);
              setIsLoadingSOAP(false);
            } else {
              // operative_note is null - still processing, continue polling
              console.log(`[Surgical Analysis] soap still processing (operative_note is null)...`);
              attempts++;
              if (attempts < maxAttempts) {
                setTimeout(poll, 5000);
              } else {
                console.error('[Surgical Analysis] SOAP refresh timed out');
                setIsLoadingSOAP(false);
              }
            }
            return;
          } else {
            // Full refresh
            console.log(`[Surgical Analysis] full processing completed`);
            setSurgicalAnalysisData(data.data);
            setSurgicalAnalysisProgress(100);
            setSurgicalAnalysisStage('completed');
            setIsLoadingSurgicalAnalysis(false);
          }
        } else if (data.status === "processing" || data.status === "not_found") {
          // Show estimated progress based on elapsed time
          // TwelveLabs analysis typically takes 1-2 minutes
          if (refreshType === 'all') {
            const estimatedProgress = Math.min(90, Math.round((attempts / 20) * 90)); // ~100s to 90%

            let stage;
            if (attempts >= 20) {
              // Taking longer than expected (> ~1.7 min)
              stage = 'finalizing (taking longer than expected, please wait...)';
            } else {
              const stages = ['starting analysis', 'analyzing video content', 'generating timeline', 'creating SOAP note', 'finalizing'];
              const stageIndex = Math.min(Math.floor(attempts / 4), stages.length - 1);
              stage = stages[stageIndex];
            }

            console.log(`[Surgical Analysis] Waiting... attempt ${attempts}, estimated progress: ${estimatedProgress}%`);
            setSurgicalAnalysisProgress(estimatedProgress);
            setSurgicalAnalysisStage(stage);
          }

          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(poll, 5000);
          } else {
            throw new Error('Surgical analysis processing timeout - please try again later');
          }
        } else if (data.status === "error") {
          throw new Error(data.message || 'Analysis failed');
        }
      } catch (error) {
        console.error('[Surgical Analysis] Polling error:', error);
        if (refreshType === 'timeline') {
          setIsLoadingTimeline(false);
        } else if (refreshType === 'soap') {
          setIsLoadingSOAP(false);
        } else {
          setSurgicalAnalysisError(error.message);
          setIsLoadingSurgicalAnalysis(false);
        }
      }
    };

    poll();
  };

  // State for separate loading indicators
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [isLoadingSOAP, setIsLoadingSOAP] = useState(false);

  // Refresh only Timeline/chapters - fetches from Twelve Labs API
  const refreshTimeline = async () => {
    if (!videoId || isLoadingTimeline) return;

    setIsLoadingTimeline(true);
    setChapters(null);

    try {
      console.log('[Surgical Analysis] Refreshing Timeline only...');
      const startResponse = await fetch(`/api/analysis/${videoId}?type=chapters`, { method: "POST" });
      const startData = await startResponse.json();
      console.log('[Surgical Analysis] Timeline refresh started:', startData);

      // If already processing, just poll for results
      if (startData.status === 'already_processing' || startResponse.status === 409) {
        console.log('[Surgical Analysis] Timeline already processing, polling for results...');
      }
      pollSurgicalAnalysis(videoId, 'timeline');
    } catch (error) {
      console.error('[Surgical Analysis] Error refreshing timeline:', error);
      setIsLoadingTimeline(false);
    }
  };

  // Refresh only SOAP note - fetches from Twelve Labs API
  const refreshSOAPNote = async () => {
    if (!videoId || isLoadingSOAP) return;

    setIsLoadingSOAP(true);
    setOperatingNote(null);

    try {
      console.log('[Surgical Analysis] Refreshing SOAP Note only...');
      const startResponse = await fetch(`/api/analysis/${videoId}?type=soap`, { method: "POST" });
      const startData = await startResponse.json();
      console.log('[Surgical Analysis] SOAP Note refresh started:', startData);

      // If already processing, just poll for results
      if (startData.status === 'already_processing' || startResponse.status === 409) {
        console.log('[Surgical Analysis] SOAP Note already processing, polling for results...');
      }
      pollSurgicalAnalysis(videoId, 'soap');
    } catch (error) {
      console.error('[Surgical Analysis] Error refreshing SOAP note:', error);
      setIsLoadingSOAP(false);
    }
  };

  // Refresh full surgical analysis (both Timeline and SOAP) - force re-analysis
  const refreshSurgicalAnalysis = async () => {
    if (!videoId) return;

    setIsLoadingSurgicalAnalysis(true);
    setSurgicalAnalysisError(null);
    setSurgicalAnalysisProgress(0);
    setSurgicalAnalysisStage('initializing');
    setSurgicalAnalysisData(null);
    setOperatingNote(null);
    setChapters(null);

    try {
      console.log('[Surgical Analysis] Force refresh - fetching new data from Twelve Labs API...');
      // Use force=true parameter to bypass cache and fetch fresh data from Twelve Labs
      const startResponse = await fetch(`/api/analysis/${videoId}?force=true`, { method: "POST" });
      const startData = await startResponse.json();
      console.log('[Surgical Analysis] Force refresh started:', startData);
      pollSurgicalAnalysis(videoId, 'all');
    } catch (error) {
      console.error('[Surgical Analysis] Error refreshing:', error);
      setSurgicalAnalysisError(error.message);
      setIsLoadingSurgicalAnalysis(false);
    }
  };

  // Update state when query data changes
  useEffect(() => {
    if (surgicalAnalysisData) {
      if (surgicalAnalysisData.chapters) {
        setChapters(surgicalAnalysisData.chapters);
      }
      if (surgicalAnalysisData.operative_note) {
        setOperatingNote(surgicalAnalysisData.operative_note);
      }
      setReportGenerated(true);
    }
  }, [surgicalAnalysisData]);

  // Sync loading and error states
  useEffect(() => {
    setIsLoadingChapters(isLoadingSurgicalAnalysis);
    setIsLoading(isLoadingSurgicalAnalysis);
    if (surgicalAnalysisError) {
      setChaptersError(surgicalAnalysisError.message);
    }
  }, [isLoadingSurgicalAnalysis, surgicalAnalysisError]);

  // Initialize edited SOAP when operating note is loaded
  useEffect(() => {
    if (operatingNote && operatingNote.SOAP) {
      setEditedSOAP({
        Subjective: operatingNote.SOAP.Subjective,
        Objective: operatingNote.SOAP.Objective,
        Assessment: operatingNote.SOAP.Assessment,
        Plan: operatingNote.SOAP.Plan,
      });
    }
  }, [operatingNote]);

  const handleEditSOAP = (section) => {
    setIsEditingSOAP((prev) => ({
      ...prev,
      [section]: true,
    }));
  };

  const handleSaveSOAP = async (section) => {
    try {
      // Update local state immediately for better UX
      const updatedSOAP = {
        ...operatingNote.SOAP,
        [section]: editedSOAP[section],
      };

      setOperatingNote((prev) => ({
        ...prev,
        SOAP: updatedSOAP,
      }));

      setIsEditingSOAP((prev) => ({
        ...prev,
        [section]: false,
      }));

      // Save to server
      const response = await fetch(`/api/analysis/${videoId}?t=${Date.now()}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          SOAP: updatedSOAP,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[SOAP Note] Server error response:', errorData);
        throw new Error(errorData.error || errorData.details || `Server returned ${response.status}`);
      }

      const data = await response.json();
      console.log('[SOAP Note] Saved successfully:', data);
      console.log('[SOAP Note] Server returned SOAP:', data.data?.operative_note?.SOAP);

      // Update surgical analysis data to keep it in sync
      if (data.data) {
        // Force update both states to ensure consistency
        setSurgicalAnalysisData(data.data);
        setOperatingNote(data.data.operative_note);
        console.log('[SOAP Note] Updated states with server response');
        console.log('[SOAP Note] New operatingNote.SOAP:', data.data.operative_note.SOAP);
      }
    } catch (error) {
      console.error('[SOAP Note] Error saving:', error);

      // Try to get more detailed error message
      let errorMessage = 'Failed to save SOAP note. Please try again.';
      if (error.message) {
        errorMessage += `\n\nError: ${error.message}`;
      }

      alert(errorMessage);

      // Revert to original value on error
      setEditedSOAP((prev) => ({
        ...prev,
        [section]: operatingNote.SOAP[section],
      }));
    }
  };

  const handleCancelEdit = (section) => {
    setEditedSOAP((prev) => ({
      ...prev,
      [section]: operatingNote.SOAP[section],
    }));
    setIsEditingSOAP((prev) => ({
      ...prev,
      [section]: false,
    }));
  };

  const handleSOAPChange = (section, value) => {
    setEditedSOAP((prev) => ({
      ...prev,
      [section]: value,
    }));
  };

    // Export SOAP note to PDF
    const exportToPDF = () => {
        if (!operatingNote?.SOAP) return;

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;
        const maxWidth = pageWidth - margin * 2;
        let y = 20;

        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text("SOAP Note", pageWidth / 2, y, { align: "center" });
        y += 15;

        const sections = [
            { title: "SUBJECTIVE", content: operatingNote.SOAP.Subjective },
            { title: "OBJECTIVE", content: operatingNote.SOAP.Objective },
            { title: "ASSESSMENT", content: operatingNote.SOAP.Assessment },
            { title: "PLAN", content: operatingNote.SOAP.Plan },
        ];

        sections.forEach((section) => {
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text(section.title, margin, y);
            y += 7;

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            const lines = doc.splitTextToSize(section.content || "", maxWidth);
            lines.forEach((line) => {
                if (y > 280) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(line, margin, y);
                y += 5;
            });
            y += 10;
        });

        doc.save(`soap-note-${new Date().toISOString().split("T")[0]}.pdf`);
    };

    // Export SOAP note to CSV
    const exportToCSV = () => {
        if (!operatingNote?.SOAP) return;

        let csv = "SOAP Note\n\n";
        csv += "Section,Content\n";
        csv += `"Subjective","${operatingNote.SOAP.Subjective.replace(/"/g, '""')}"\n`;
        csv += `"Objective","${operatingNote.SOAP.Objective.replace(/"/g, '""')}"\n`;
        csv += `"Assessment","${operatingNote.SOAP.Assessment.replace(/"/g, '""')}"\n`;
        csv += `"Plan","${operatingNote.SOAP.Plan.replace(/"/g, '""')}"\n`;

        const element = document.createElement("a");
        const file = new Blob([csv], { type: "text/csv" });
        element.href = URL.createObjectURL(file);
        element.download = `soap-note-${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    return (
        <div className="w-full space-y-6">
            {/* Video and Chat Section */}
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Video Section */}
        <div className="w-full lg:w-1/2 space-y-4">
                    {clipData && (
                        <ClickableVideo
                            hlsUrl={clipData.hls?.video_url}
                            thumbnailUrl={clipData.hls?.thumbnail_urls?.[0]}
                            height={null}
                            width={null}
                            toolDetectionData={toolDetectionData}
                            showToolDetection={showToolDetection}
                            enabledTools={enabledTools}
                        />
                    )}

          {/* Tool Detection Status & Filter Panel */}
          <div className="mt-4">
            {isLoadingToolDetection ? (
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl shadow-lg border border-emerald-200 p-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="relative">
                      <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-200 border-t-emerald-600"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <WrenchScrewdriverIcon className="h-5 w-5 text-emerald-600" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Processing Tool Detection
                    </h3>
                    <p className="text-sm text-gray-600 mb-1">
                      Analyzing video with YOLO11m model to identify surgical
                      instruments...
                    </p>
                    <p className="text-xs text-amber-600 font-medium mb-3">
                      ⏱️ This typically takes 2-3 minutes for longer videos. Please wait.
                    </p>
                    <div className="bg-white/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 font-medium">
                          Progress
                        </span>
                        <span className="text-emerald-600 font-semibold">
                          {toolDetectionProgress}% - {toolDetectionStage}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-emerald-500 to-teal-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${toolDetectionProgress}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 italic">
                        ✨ This only happens once. Results will be cached for
                        instant loading next time.
                      </p>
                    </div>
                    <div className="mt-3 flex items-center space-x-2 text-xs text-gray-500">
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                        <span>
                          Detecting: Grasper, Clipper, Scissors, Hook,
                          Irrigator, Bipolar, Specimen Bag
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : toolDetectionError ? (
              <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl shadow-lg border border-red-200 p-6">
                <div className="flex items-start space-x-4">
                  <ExclamationTriangleIcon className="h-8 w-8 text-red-500 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-red-900 mb-2">
                      Tool Detection Error
                    </h3>
                    <p className="text-sm text-red-700 mb-3">
                      {toolDetectionError}
                    </p>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            ) : toolDetectionData ? (
              <ToolFilterPanel
                detectionData={toolDetectionData}
                enabledTools={enabledTools}
                onToggleTool={handleToggleTool}
                isVisible={showToolDetection}
                onToggleVisibility={() =>
                  setShowToolDetection(!showToolDetection)
                }
              />
            ) : (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">
                  Tool detection not available for this video.
                </p>
              </div>
            )}
          </div>
                </div>

                {/* Chat Section */}
                <div className="w-full lg:w-1/2">
                    <ClipChat videoId={videoId} />
                </div>
            </div>

            {/* Tabs Section - Tool, Timeline, SOAP Note */}
            <div className="w-full">
              {/* Tab Navigation */}
              <div className="border-b border-gray-200 mb-4">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                  <button
                    onClick={() => setActiveTab('tool')}
                    className={`
                      py-4 px-1 border-b-2 font-medium text-sm
                      ${activeTab === 'tool'
                        ? 'border-emerald-500 text-emerald-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    Tool
                  </button>
                  <button
                    onClick={() => setActiveTab('timeline')}
                    className={`
                      py-4 px-1 border-b-2 font-medium text-sm
                      ${activeTab === 'timeline'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    Timeline
                  </button>
                  <button
                    onClick={() => setActiveTab('soap')}
                    className={`
                      py-4 px-1 border-b-2 font-medium text-sm
                      ${activeTab === 'soap'
                        ? 'border-purple-500 text-purple-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    SOAP Note
                  </button>
                </nav>
              </div>

              {/* Tab Content */}
              <div className="mt-4">
                {/* Tool Tab */}
                {activeTab === 'tool' && (
                  <div className="space-y-6">
                    {/* Tool Usage Timeline */}
                    {toolDetectionData && (
                      <ToolUsageTimeline
                        detectionData={toolDetectionData}
                        videoDuration={toolDetectionData.video_properties?.duration || clipData?.duration || 0}
                        onSeekTo={(timestamp) => {
                          // Seek video to timestamp
                          const videoElement = document.querySelector('video');
                          if (videoElement) {
                            videoElement.currentTime = timestamp;
                          }
                        }}
                      />
                    )}

                    {/* Tool Usage Statistics */}
                    {toolDetectionData && (
                      <ToolUsageStatistics detectionData={toolDetectionData} />
                    )}

                    {!toolDetectionData && !isLoadingToolDetection && (
                      <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
                        <p className="text-gray-500">Tool detection data not available</p>
                      </div>
                    )}
                    {!toolDetectionData && isLoadingToolDetection && (
                      <div className="bg-blue-50 rounded-lg border border-blue-200 p-8 text-center">
                        <div className="flex flex-col items-center space-y-3">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                          <p className="text-blue-600">
                            {toolDetectionStage === 'waiting for upload'
                              ? 'Waiting for video upload to complete...'
                              : `Processing tool detection... ${toolDetectionProgress}%`}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Timeline Tab */}
                {activeTab === 'timeline' && (
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
            <ClockIcon className="h-5 w-5 text-blue-500" />
            <span>Surgical Phase Timeline</span>
          </h3>
          <div className="flex items-center space-x-2">
            {chapters && chapters.length > 0 && (
              <div className="flex items-center space-x-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg">
                <span className="text-sm font-medium">
                  {chapters.length} Phases
                </span>
              </div>
            )}
            <button
              onClick={refreshTimeline}
              disabled={isLoadingTimeline}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              title="Refresh timeline analysis"
            >
              <ArrowPathIcon className={`h-4 w-4 ${isLoadingTimeline ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {isLoadingChapters || isLoadingTimeline ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">
              {isLoadingTimeline ? 'Regenerating timeline...' : 'Loading surgical phases...'}
            </span>
          </div>
        ) : chaptersError ? (
          <div className="text-center py-8">
            <ExclamationTriangleIcon className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <p className="text-amber-600 font-medium">Failed to load phases</p>
            <p className="text-sm text-gray-600 mt-2">{chaptersError}</p>
          </div>
        ) : chapters && chapters.length > 0 ? (
          <div className="space-y-3">
            {chapters.map((chapter, index) => (
              <div
                key={index}
                className="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-blue-200/50 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="px-3 py-1 rounded-full text-sm font-semibold text-blue-700 bg-blue-100 border border-blue-200">
                        {chapter.phase || chapter.chapter_title}
                      </span>
                      <span className="text-sm text-gray-600">
                        {Math.floor((chapter.start_time_sec ?? chapter.start_time) / 60)}:
                        {((chapter.start_time_sec ?? chapter.start_time) % 60)
                          .toString()
                          .padStart(2, "0")}{" "}
                        - {Math.floor((chapter.end_time_sec ?? chapter.end_time) / 60)}:
                        {((chapter.end_time_sec ?? chapter.end_time) % 60)
                          .toString()
                          .padStart(2, "0")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800">
                      {chapter.description || chapter.chapter_summary}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <ClockIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">No phases identified</p>
            <p className="text-sm text-gray-500 mt-2">
              Unable to identify surgical phases in this video.
            </p>
          </div>
        )}
                  </div>
                )}

                {/* SOAP Note Tab */}
                {activeTab === 'soap' && (
                  <div>
            {/* Forensics Details Panel */}
            <div className="w-full">
                <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-white/20 shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200/50">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-gradient-to-br from-emerald-500 to-lime-600 rounded-lg">
                  <DocumentTextIcon className="h-6 w-6 text-white" />
                                </div>
                                <div>
                  <h2 className="text-xl font-bold text-gray-900">SOAP Note</h2>
                  <p className="text-sm text-gray-600">
                    Subjective, Objective, Assessment & Plan
                  </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={refreshSOAPNote}
                                disabled={isLoadingSOAP}
                                className="flex items-center space-x-2 px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                                title="Refresh SOAP note analysis"
                              >
                                <ArrowPathIcon className={`h-4 w-4 ${isLoadingSOAP ? 'animate-spin' : ''}`} />
                                <span className="text-sm font-medium">Refresh</span>
                              </button>
                              {operatingNote && operatingNote.SOAP && (
                                <>
                                  <button
                                    onClick={exportToPDF}
                                    className="flex items-center space-x-2 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                                  >
                                    <ArrowDownTrayIcon className="h-4 w-4" />
                                    <span className="text-sm font-medium">PDF</span>
                                  </button>
                                  <button
                                    onClick={exportToCSV}
                                    className="flex items-center space-x-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                                  >
                                    <ArrowDownTrayIcon className="h-4 w-4" />
                                    <span className="text-sm font-medium">CSV</span>
                                  </button>
                                </>
                              )}
                            </div>
                        </div>
                    </div>

                    {isLoading || isLoadingSOAP ? (
                        <div className="p-8 text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto"></div>
              <p className="mt-4 text-gray-600">
                {isLoadingSOAP ? 'Regenerating SOAP note...' : 'Analyzing surgical video with TwelveLabs Pegasus...'}
              </p>
                        </div>
          ) : !operatingNote ? (
                        <div className="p-8 text-center">
                            <div className="mb-6">
                                <DocumentTextIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  Loading SOAP Note...
                </h3>
                                <p className="text-gray-500 max-w-md mx-auto">
                  Analyzing surgical video to generate operative note.
                </p>
              </div>
            </div>
          ) : operatingNote ? (
            <div className="p-6 space-y-6">
              {/* OPERATIVE NOTE (SOAP) */}
              {operatingNote.SOAP && (
                <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-6 border border-emerald-100">
                  <div className="space-y-4">
                    {/* Subjective */}
                    <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-emerald-200/50">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900 flex items-center space-x-2">
                          <span className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-bold">
                            S
                          </span>
                          <span>Subjective</span>
                        </h4>
                        {!isEditingSOAP.Subjective ? (
                          <button
                            onClick={() => handleEditSOAP("Subjective")}
                            className="flex items-center space-x-1 px-2 py-1 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                          >
                            <PencilIcon className="h-3 w-3" />
                            <span>Edit</span>
                          </button>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleSaveSOAP("Subjective")}
                              className="flex items-center space-x-1 px-2 py-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
                            >
                              <CheckCircleIcon className="h-3 w-3" />
                              <span>Save</span>
                            </button>
                            <button
                              onClick={() => handleCancelEdit("Subjective")}
                              className="flex items-center space-x-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors"
                            >
                              <XCircleIcon className="h-3 w-3" />
                              <span>Cancel</span>
                            </button>
                          </div>
                        )}
                      </div>
                      {!isEditingSOAP.Subjective ? (
                        <p className="text-sm text-gray-800 leading-relaxed pl-10">
                          {operatingNote.SOAP.Subjective}
                        </p>
                      ) : (
                        <textarea
                          value={editedSOAP.Subjective}
                          onChange={(e) =>
                            handleSOAPChange("Subjective", e.target.value)
                          }
                          className="w-full pl-10 pr-2 py-2 text-sm text-gray-800 leading-relaxed border border-emerald-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white min-h-[100px]"
                        />
                      )}
                            </div>

                    {/* Objective */}
                    <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-emerald-200/50">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900 flex items-center space-x-2">
                          <span className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-bold">
                            O
                          </span>
                          <span>Objective</span>
                        </h4>
                        {!isEditingSOAP.Objective ? (
                          <button
                            onClick={() => handleEditSOAP("Objective")}
                            className="flex items-center space-x-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                          >
                            <PencilIcon className="h-3 w-3" />
                            <span>Edit</span>
                          </button>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleSaveSOAP("Objective")}
                              className="flex items-center space-x-1 px-2 py-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
                            >
                              <CheckCircleIcon className="h-3 w-3" />
                              <span>Save</span>
                            </button>
                            <button
                              onClick={() => handleCancelEdit("Objective")}
                              className="flex items-center space-x-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors"
                            >
                              <XCircleIcon className="h-3 w-3" />
                              <span>Cancel</span>
                            </button>
                                </div>
                        )}
                                </div>
                      {!isEditingSOAP.Objective ? (
                        <p className="text-sm text-gray-800 leading-relaxed pl-10">
                          {operatingNote.SOAP.Objective}
                        </p>
                      ) : (
                        <textarea
                          value={editedSOAP.Objective}
                          onChange={(e) =>
                            handleSOAPChange("Objective", e.target.value)
                          }
                          className="w-full pl-10 pr-2 py-2 text-sm text-gray-800 leading-relaxed border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-h-[150px]"
                        />
                      )}
                                </div>

                    {/* Assessment */}
                    <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-emerald-200/50">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900 flex items-center space-x-2">
                          <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">
                            A
                          </span>
                          <span>Assessment</span>
                        </h4>
                        {!isEditingSOAP.Assessment ? (
                          <button
                            onClick={() => handleEditSOAP("Assessment")}
                            className="flex items-center space-x-1 px-2 py-1 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded transition-colors"
                          >
                            <PencilIcon className="h-3 w-3" />
                            <span>Edit</span>
                          </button>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleSaveSOAP("Assessment")}
                              className="flex items-center space-x-1 px-2 py-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
                            >
                              <CheckCircleIcon className="h-3 w-3" />
                              <span>Save</span>
                            </button>
                            <button
                              onClick={() => handleCancelEdit("Assessment")}
                              className="flex items-center space-x-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors"
                            >
                              <XCircleIcon className="h-3 w-3" />
                              <span>Cancel</span>
                            </button>
                            </div>
                        )}
                        </div>
                      {!isEditingSOAP.Assessment ? (
                        <p className="text-sm text-gray-800 leading-relaxed pl-10">
                          {operatingNote.SOAP.Assessment}
                        </p>
                      ) : (
                        <textarea
                          value={editedSOAP.Assessment}
                          onChange={(e) =>
                            handleSOAPChange("Assessment", e.target.value)
                          }
                          className="w-full pl-10 pr-2 py-2 text-sm text-gray-800 leading-relaxed border border-purple-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-h-[120px]"
                        />
                      )}
                    </div>

                    {/* Plan */}
                    <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-emerald-200/50">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900 flex items-center space-x-2">
                          <span className="w-8 h-8 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-sm font-bold">
                            P
                          </span>
                          <span>Plan</span>
                        </h4>
                        {!isEditingSOAP.Plan ? (
                          <button
                            onClick={() => handleEditSOAP("Plan")}
                            className="flex items-center space-x-1 px-2 py-1 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded transition-colors"
                          >
                            <PencilIcon className="h-3 w-3" />
                            <span>Edit</span>
                          </button>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleSaveSOAP("Plan")}
                              className="flex items-center space-x-1 px-2 py-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
                            >
                              <CheckCircleIcon className="h-3 w-3" />
                              <span>Save</span>
                            </button>
                            <button
                              onClick={() => handleCancelEdit("Plan")}
                              className="flex items-center space-x-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors"
                            >
                              <XCircleIcon className="h-3 w-3" />
                              <span>Cancel</span>
                            </button>
                          </div>
                        )}
                      </div>
                      {!isEditingSOAP.Plan ? (
                        <p className="text-sm text-gray-800 leading-relaxed pl-10">
                          {operatingNote.SOAP.Plan}
                        </p>
                      ) : (
                        <textarea
                          value={editedSOAP.Plan}
                          onChange={(e) =>
                            handleSOAPChange("Plan", e.target.value)
                          }
                          className="w-full pl-10 pr-2 py-2 text-sm text-gray-800 leading-relaxed border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white min-h-[100px]"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
                </div>
            </div>
                  </div>
                )}
              </div>
            </div>
        </div>
    );
}
