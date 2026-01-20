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
import { useUpload } from "../contexts/UploadContext";

// Optional default geolocation (configure via NEXT_PUBLIC_DEFAULT_LAT/LON)
const DEFAULT_LAT = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT || "");
const DEFAULT_LON = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LON || "");
const HAS_DEFAULT_GEO =
  Number.isFinite(DEFAULT_LAT) && Number.isFinite(DEFAULT_LON);
const DEFAULT_GEOLOCATION = HAS_DEFAULT_GEO
    ? { coords: { latitude: DEFAULT_LAT, longitude: DEFAULT_LON } }
    : null;

export default function ClipBento({ clipData, videoId, initialAnalysisData }) {
  // Get upload context to check if this video is currently being processed
  const { detectionVideoId, isDetecting, startAnalysis, completeAnalysis } = useUpload();

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
        return;
      }

      // Mark as started immediately to prevent duplicate requests
      detectionStartedRef.current = true;

      setIsLoadingToolDetection(true);
      setToolDetectionError(null);
      setToolDetectionProgress(0);
      setToolDetectionStage('initializing');

      // Debug: log key state for this video
      console.log(`[TD] videoId=${videoId}, isDetecting=${isDetecting}, detectionVideoId=${detectionVideoId}`);

      try {
        // 1. First, try to load from static files (pre-deployed detections)
        const staticResponse = await fetch(`/detections/${videoId}.json`);

        if (staticResponse.ok) {
          const staticData = await staticResponse.json();
          detectionLoadedRef.current = true;
          setToolDetectionData(staticData);
          setToolDetectionProgress(100);
          setToolDetectionStage('completed');
          setIsLoadingToolDetection(false);
          console.log(`[TD] ${videoId}: loaded from static`);
          return;
        }

        // 2. Static file not found, check API (Blob storage or processing)
        const response = await fetch(`/api/detect-tools/${videoId}`);
        const data = await response.json();
        console.log(`[TD] ${videoId}: API status=${data.status}`);

        if (data.status === "completed") {
          detectionLoadedRef.current = true;
          setToolDetectionData(data.data);
          setToolDetectionProgress(100);
          setToolDetectionStage('completed');
          setIsLoadingToolDetection(false);
        } else if (data.status === "not_found") {
          // Tool detection not found - check if this video is currently being uploaded/processed
          const isCurrentlyProcessing = isDetecting && detectionVideoId === videoId;
          console.log(`[TD] ${videoId}: not_found, isCurrentlyProcessing=${isCurrentlyProcessing}`);

          if (isCurrentlyProcessing) {
            // This video is being processed right now, poll for results
            setIsLoadingToolDetection(true);
            setToolDetectionStage('waiting for detection');
            startPolling(videoId);
          } else {
            // This is an older video without detection data
            setIsLoadingToolDetection(false);
            setToolDetectionData(null);
          }
        } else if (data.status === "processing") {
          console.log(`[TD] ${videoId}: processing`);
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
        console.error(`[TD] ${videoId}: error`, error.message);
        setToolDetectionError(error.message);
        setIsLoadingToolDetection(false);
        detectionStartedRef.current = false; // Allow retry on error
      }
    };

    loadToolDetection();

    // Cleanup: stop polling when component unmounts or videoId changes
    return () => {
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

    const poll = async () => {
      // Check if polling was cancelled
      if (!pollingRef.current.active) {
        return;
      }

      try {
        const response = await fetch(`/api/detect-tools/${videoId}`);
        const data = await response.json();

        // Check again after fetch (component might have unmounted)
        if (!pollingRef.current.active) {
          return;
        }

        // Only log on status change or every 6th attempt (30s)
        if (attempts % 6 === 0) {
          console.log(`[TD] ${videoId}: poll #${attempts}, status=${data.status}`);
        }

        if (data.status === "completed") {
          console.log(`[TD] ${videoId}: completed`);
          pollingRef.current.active = false;
          detectionLoadedRef.current = true;
          setToolDetectionData(data.data);
          setToolDetectionProgress(100);
          setToolDetectionStage('completed');
          setIsLoadingToolDetection(false);
          return;
        } else if (data.status === "error") {
          console.log(`[TD] ${videoId}: error - ${data.error}`);
          pollingRef.current.active = false;
          setToolDetectionError(data.error);
          setIsLoadingToolDetection(false);
          return;
        } else if (data.status === "not_found") {
          // Not started yet - waiting for upload process to trigger detection
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
        console.log(`[TD] ${videoId}: poll error - ${error.message}`);
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
        setSurgicalAnalysisData(initialAnalysisData);
        setSurgicalAnalysisProgress(100);
        setSurgicalAnalysisStage('completed');
        setIsLoadingSurgicalAnalysis(false);
        completeAnalysis(videoId);
        return;
      }

      setIsLoadingSurgicalAnalysis(true);
      setSurgicalAnalysisError(null);
      setSurgicalAnalysisProgress(0);
      setSurgicalAnalysisStage('initializing');

      try {
        // 1. Try to load from static files first (pre-deployed analysis)
        const staticResponse = await fetch(`/analysis/${videoId}.json`);

        if (staticResponse.ok) {
          const staticData = await staticResponse.json();
          setSurgicalAnalysisData(staticData);
          setSurgicalAnalysisProgress(100);
          setSurgicalAnalysisStage('completed');
          setIsLoadingSurgicalAnalysis(false);
          completeAnalysis(videoId);
          return;
        }

        // 2. Static file not found, check API (Blob storage or processing)
        const response = await fetch(`/api/analysis/${videoId}?t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        const data = await response.json();

        if (data.status === "completed") {
          setSurgicalAnalysisData(data.data);
          setSurgicalAnalysisProgress(100);
          setSurgicalAnalysisStage('completed');
          setIsLoadingSurgicalAnalysis(false);
          completeAnalysis(videoId);
        } else if (data.status === "not_found") {
          // No existing analysis - generate both timeline and SOAP in parallel
          setIsLoadingSurgicalAnalysis(true);
          startAnalysis(videoId);
          setSurgicalAnalysisStage('generating analysis...');
          setSurgicalAnalysisProgress(10);

          console.log('[Analysis] Starting initial generation (timeline + SOAP in parallel)');

          // Call both endpoints in parallel
          const [timelineResult, soapResult] = await Promise.all([
            fetch(`/api/analysis/${videoId}/timeline`, { method: "POST" }).then(r => r.json()),
            fetch(`/api/analysis/${videoId}/soap`, { method: "POST" }).then(r => r.json())
          ]);

          console.log('[Analysis] Timeline result:', timelineResult.status);
          console.log('[Analysis] SOAP result:', soapResult.status);

          // Use the latest data (SOAP should have both since it runs after timeline)
          const finalData = soapResult.status === 'completed' ? soapResult.data : timelineResult.data;

          if (finalData) {
            setSurgicalAnalysisData(finalData);
            setSurgicalAnalysisProgress(100);
            setSurgicalAnalysisStage('completed');
            setIsLoadingSurgicalAnalysis(false);
            completeAnalysis(videoId);
          } else {
            throw new Error('Failed to generate analysis');
          }
        }
      } catch (error) {
        setSurgicalAnalysisError(error.message);
        setIsLoadingSurgicalAnalysis(false);
      }
    };

    loadSurgicalAnalysis();
  }, [videoId, initialAnalysisData]);

  // Poll surgical analysis status (for initial loading only)
  const pollSurgicalAnalysis = async (videoId) => {
    const maxAttempts = 60; // 5 minutes (5s interval)
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/analysis/${videoId}?t=${Date.now()}`, {
          cache: 'no-store'
        });
        const data = await response.json();

        if (data.status === "completed") {
          // Verify that data actually contains results
          if (data.data && (data.data.chapters || data.data.operative_note)) {
            console.log(`[Poll] Completed with data, lastUpdated: ${data.data._lastUpdated}`);
            setSurgicalAnalysisData(data.data);
            setSurgicalAnalysisProgress(100);
            setSurgicalAnalysisStage('completed');
            setIsLoadingSurgicalAnalysis(false);
            completeAnalysis(videoId);
          } else {
            // Status is completed but data is not ready yet, continue polling
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(poll, 5000);
            } else {
              throw new Error('Surgical analysis processing timeout - please try again later');
            }
          }
        } else if (data.status === "processing" || data.status === "not_found") {
          console.log(`[Poll] status=${data.status}, attempt=${attempts}`);

          const estimatedProgress = Math.min(90, Math.round((attempts / 20) * 90));

          let stage;
          if (attempts >= 20) {
            stage = 'finalizing (taking longer than expected, please wait...)';
          } else {
            const stages = ['starting analysis', 'analyzing video content', 'generating timeline', 'creating SOAP note', 'finalizing'];
            const stageIndex = Math.min(Math.floor(attempts / 4), stages.length - 1);
            stage = stages[stageIndex];
          }

          setSurgicalAnalysisProgress(estimatedProgress);
          setSurgicalAnalysisStage(stage);

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
        setSurgicalAnalysisError(error.message);
        setIsLoadingSurgicalAnalysis(false);
      }
    };

    poll();
  };

  // State for separate loading indicators
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [isLoadingSOAP, setIsLoadingSOAP] = useState(false);

  // Refresh only Timeline/chapters - calls dedicated timeline endpoint
  const refreshTimeline = async () => {
    if (!videoId || isLoadingTimeline) return;

    setIsLoadingTimeline(true);
    console.log(`[Refresh] Timeline refresh started`);

    try {
      // POST to dedicated timeline endpoint (waits for completion)
      const response = await fetch(`/api/analysis/${videoId}/timeline`, { method: "POST" });
      const result = await response.json();
      console.log(`[Refresh] Timeline result:`, result.status);

      if (result.status === 'completed' && result.data?.chapters) {
        console.log(`[Refresh] Timeline: Setting ${result.data.chapters.length} chapters`);
        setChapters(result.data.chapters);
        setSurgicalAnalysisData(result.data);
      } else if (result.status === 'error') {
        console.error(`[Refresh] Timeline error:`, result.error);
      }
    } catch (error) {
      console.error('[Refresh] Timeline refresh failed:', error);
    } finally {
      setIsLoadingTimeline(false);
    }
  };

  // Refresh only SOAP note - calls dedicated soap endpoint
  const refreshSOAPNote = async () => {
    if (!videoId || isLoadingSOAP) return;

    setIsLoadingSOAP(true);
    console.log(`[Refresh] SOAP refresh started`);

    try {
      // POST to dedicated soap endpoint (waits for completion)
      const response = await fetch(`/api/analysis/${videoId}/soap`, { method: "POST" });
      const result = await response.json();
      console.log(`[Refresh] SOAP result:`, result.status);

      if (result.status === 'completed' && result.data?.operative_note) {
        console.log(`[Refresh] SOAP: Setting operative_note`);
        setOperatingNote(result.data.operative_note);
        setSurgicalAnalysisData(result.data);
      } else if (result.status === 'error') {
        console.error(`[Refresh] SOAP error:`, result.error);
      }
    } catch (error) {
      console.error('[Refresh] SOAP refresh failed:', error);
    } finally {
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
      // Use force=true parameter to bypass cache and fetch fresh data from Twelve Labs
      const startResponse = await fetch(`/api/analysis/${videoId}?force=true`, { method: "POST" });
      await startResponse.json();
      pollSurgicalAnalysis(videoId, 'all');
    } catch (error) {
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
        throw new Error(errorData.error || errorData.details || `Server returned ${response.status}`);
      }

      const data = await response.json();

      // Update surgical analysis data to keep it in sync
      if (data.data) {
        // Force update both states to ensure consistency
        setSurgicalAnalysisData(data.data);
        setOperatingNote(data.data.operative_note);
      }
    } catch (error) {

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
              <div className="bg-white rounded-[20px] p-6 outline outline-1 outline-offset-[-1px] outline-gray-300">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Processing Tool Detection</h3>
                    <p className="text-sm text-gray-600 mt-1">Analyzing video with YOLO model to identify surgical instruments...</p>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    <div className="w-8 h-8 rounded-full border-2 border-solid border-gray-500 border-t-transparent animate-spin"></div>
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
              <div className="border-b border-gray-300 mb-4">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                  <button
                    onClick={() => setActiveTab('tool')}
                    className={`
                      cursor-pointer py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2
                      ${activeTab === 'tool'
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    <WrenchScrewdriverIcon className="h-4 w-4" />
                    Tool
                  </button>
                  <button
                    onClick={() => setActiveTab('timeline')}
                    className={`
                      cursor-pointer py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2
                      ${activeTab === 'timeline'
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    <ClockIcon className="h-4 w-4" />
                    Timeline
                  </button>
                  <button
                    onClick={() => setActiveTab('soap')}
                    className={`
                      cursor-pointer py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2
                      ${activeTab === 'soap'
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    <DocumentTextIcon className="h-4 w-4" />
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
                              : 'Processing tool detection...'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Timeline Tab */}
                {activeTab === 'timeline' && (
                  <div className="bg-white rounded-[20px] p-6 outline outline-1 outline-offset-[-1px] outline-gray-300">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Surgical Phase Timeline
            </h3>
            {surgicalAnalysisData?._lastUpdated && (
              <p className="text-xs text-gray-400 mt-1">
                Last updated: {new Date(surgicalAnalysisData._lastUpdated).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {chapters && chapters.length > 0 && (
              <div className="flex items-center space-x-2 px-3 py-1 rounded-full outline outline-1 outline-offset-[-1px] outline-gray-300">
                <span className="text-sm font-medium text-gray-700">
                  {chapters.length} Phases
                </span>
              </div>
            )}
            <button
              onClick={refreshTimeline}
              disabled={isLoadingTimeline}
              className="cursor-pointer flex items-center space-x-2 px-3 py-2 bg-[#1D1C1B] text-white rounded-2xl hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              title="Refresh timeline analysis"
            >
              <ArrowPathIcon className={`h-4 w-4 ${isLoadingTimeline ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {isLoadingChapters || isLoadingTimeline ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 rounded-full border-2 border-solid border-gray-500 border-t-transparent animate-spin"></div>
            <span className="ml-3 text-gray-600">
              {isLoadingTimeline ? 'Regenerating timeline...' : 'Loading surgical phases...'}
            </span>
          </div>
        ) : chaptersError ? (
          <div className="text-center py-8">
            <ExclamationTriangleIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-700 font-medium">Failed to load phases</p>
            <p className="text-sm text-gray-500 mt-2">{chaptersError}</p>
          </div>
        ) : chapters && chapters.length > 0 ? (
          <div className="space-y-3">
            {chapters.map((chapter, index) => (
              <div
                key={index}
                className="bg-gray-50 rounded-xl p-4 outline outline-1 outline-offset-[-1px] outline-gray-200 hover:outline-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <button
                        onClick={() => {
                          const videoElement = document.querySelector('video');
                          if (videoElement) {
                            videoElement.currentTime = chapter.start_time_sec ?? chapter.start_time;
                            videoElement.play();
                          }
                        }}
                        className="cursor-pointer px-3 py-1 rounded-full text-sm font-medium text-gray-700 bg-white outline outline-1 outline-offset-[-1px] outline-gray-300 hover:bg-gray-100 hover:outline-gray-400 transition-colors"
                        title={`Play from ${Math.floor((chapter.start_time_sec ?? chapter.start_time) / 60)}:${((chapter.start_time_sec ?? chapter.start_time) % 60).toString().padStart(2, "0")}`}
                      >
                        {chapter.phase || chapter.chapter_title}
                      </button>
                      <span className="text-sm text-gray-500">
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
                    <p className="text-sm text-gray-700">
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
                  <div className="bg-white rounded-[20px] outline outline-1 outline-offset-[-1px] outline-gray-300 overflow-hidden">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                            <div>
                  <h2 className="text-lg font-semibold text-gray-900">SOAP Note</h2>
                  <p className="text-sm text-gray-600">
                    Subjective, Objective, Assessment & Plan
                  </p>
                  {surgicalAnalysisData?._lastUpdated && (
                    <p className="text-xs text-gray-400 mt-1">
                      Last updated: {new Date(surgicalAnalysisData._lastUpdated).toLocaleString()}
                    </p>
                  )}
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={refreshSOAPNote}
                                disabled={isLoadingSOAP}
                                className="cursor-pointer flex items-center space-x-2 px-3 py-2 bg-[#1D1C1B] text-white rounded-2xl hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                                title="Refresh SOAP note analysis"
                              >
                                <ArrowPathIcon className={`h-4 w-4 ${isLoadingSOAP ? 'animate-spin' : ''}`} />
                                <span className="text-sm font-medium">Refresh</span>
                              </button>
                              {operatingNote && operatingNote.SOAP && (
                                <>
                                  <button
                                    onClick={exportToPDF}
                                    className="cursor-pointer flex items-center space-x-2 px-3 py-2 bg-white text-gray-700 rounded-2xl outline outline-1 outline-offset-[-1px] outline-gray-300 hover:bg-gray-50 transition-colors"
                                  >
                                    <ArrowDownTrayIcon className="h-4 w-4" />
                                    <span className="text-sm font-medium">PDF</span>
                                  </button>
                                  <button
                                    onClick={exportToCSV}
                                    className="cursor-pointer flex items-center space-x-2 px-3 py-2 bg-white text-gray-700 rounded-2xl outline outline-1 outline-offset-[-1px] outline-gray-300 hover:bg-gray-50 transition-colors"
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
                            <div className="w-10 h-10 rounded-full border-2 border-solid border-gray-500 border-t-transparent animate-spin mx-auto"></div>
              <p className="mt-4 text-gray-600">
                {isLoadingSOAP ? 'Regenerating SOAP note...' : 'Analyzing surgical video...'}
              </p>
                        </div>
          ) : !operatingNote ? (
                        <div className="p-8 text-center">
                            <div className="mb-6">
                                <DocumentTextIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  Loading SOAP Note...
                </h3>
                                <p className="text-gray-500 max-w-md mx-auto">
                  Analyzing surgical video to generate operative note.
                </p>
              </div>
            </div>
          ) : operatingNote ? (
            <div className="p-6 space-y-4">
              {/* OPERATIVE NOTE (SOAP) */}
              {operatingNote.SOAP && (
                <div className="space-y-4">
                    {/* Subjective */}
                    <div className="bg-gray-50 rounded-xl p-4 outline outline-1 outline-offset-[-1px] outline-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900 flex items-center space-x-2">
                          <span className="w-8 h-8 bg-gray-200 text-gray-700 rounded-full flex items-center justify-center text-sm font-bold">
                            S
                          </span>
                          <span>Subjective</span>
                        </h4>
                        {!isEditingSOAP.Subjective ? (
                          <button
                            onClick={() => handleEditSOAP("Subjective")}
                            className="cursor-pointer flex items-center space-x-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                          >
                            <PencilIcon className="h-3 w-3" />
                            <span>Edit</span>
                          </button>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleSaveSOAP("Subjective")}
                              className="cursor-pointer flex items-center space-x-1 px-2 py-1 text-xs text-gray-900 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                            >
                              <CheckCircleIcon className="h-3 w-3" />
                              <span>Save</span>
                            </button>
                            <button
                              onClick={() => handleCancelEdit("Subjective")}
                              className="cursor-pointer flex items-center space-x-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                            >
                              <XCircleIcon className="h-3 w-3" />
                              <span>Cancel</span>
                            </button>
                          </div>
                        )}
                      </div>
                      {!isEditingSOAP.Subjective ? (
                        <p className="text-sm text-gray-700 leading-relaxed pl-10">
                          {operatingNote.SOAP.Subjective}
                        </p>
                      ) : (
                        <textarea
                          value={editedSOAP.Subjective}
                          onChange={(e) =>
                            handleSOAPChange("Subjective", e.target.value)
                          }
                          className="w-full pl-10 pr-2 py-2 text-sm text-gray-700 leading-relaxed border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white min-h-[100px]"
                        />
                      )}
                            </div>

                    {/* Objective */}
                    <div className="bg-gray-50 rounded-xl p-4 outline outline-1 outline-offset-[-1px] outline-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900 flex items-center space-x-2">
                          <span className="w-8 h-8 bg-gray-200 text-gray-700 rounded-full flex items-center justify-center text-sm font-bold">
                            O
                          </span>
                          <span>Objective</span>
                        </h4>
                        {!isEditingSOAP.Objective ? (
                          <button
                            onClick={() => handleEditSOAP("Objective")}
                            className="cursor-pointer flex items-center space-x-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                          >
                            <PencilIcon className="h-3 w-3" />
                            <span>Edit</span>
                          </button>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleSaveSOAP("Objective")}
                              className="cursor-pointer flex items-center space-x-1 px-2 py-1 text-xs text-gray-900 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                            >
                              <CheckCircleIcon className="h-3 w-3" />
                              <span>Save</span>
                            </button>
                            <button
                              onClick={() => handleCancelEdit("Objective")}
                              className="cursor-pointer flex items-center space-x-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                            >
                              <XCircleIcon className="h-3 w-3" />
                              <span>Cancel</span>
                            </button>
                                </div>
                        )}
                                </div>
                      {!isEditingSOAP.Objective ? (
                        <p className="text-sm text-gray-700 leading-relaxed pl-10">
                          {operatingNote.SOAP.Objective}
                        </p>
                      ) : (
                        <textarea
                          value={editedSOAP.Objective}
                          onChange={(e) =>
                            handleSOAPChange("Objective", e.target.value)
                          }
                          className="w-full pl-10 pr-2 py-2 text-sm text-gray-700 leading-relaxed border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white min-h-[150px]"
                        />
                      )}
                                </div>

                    {/* Assessment */}
                    <div className="bg-gray-50 rounded-xl p-4 outline outline-1 outline-offset-[-1px] outline-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900 flex items-center space-x-2">
                          <span className="w-8 h-8 bg-gray-200 text-gray-700 rounded-full flex items-center justify-center text-sm font-bold">
                            A
                          </span>
                          <span>Assessment</span>
                        </h4>
                        {!isEditingSOAP.Assessment ? (
                          <button
                            onClick={() => handleEditSOAP("Assessment")}
                            className="cursor-pointer flex items-center space-x-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                          >
                            <PencilIcon className="h-3 w-3" />
                            <span>Edit</span>
                          </button>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleSaveSOAP("Assessment")}
                              className="cursor-pointer flex items-center space-x-1 px-2 py-1 text-xs text-gray-900 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                            >
                              <CheckCircleIcon className="h-3 w-3" />
                              <span>Save</span>
                            </button>
                            <button
                              onClick={() => handleCancelEdit("Assessment")}
                              className="cursor-pointer flex items-center space-x-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                            >
                              <XCircleIcon className="h-3 w-3" />
                              <span>Cancel</span>
                            </button>
                            </div>
                        )}
                        </div>
                      {!isEditingSOAP.Assessment ? (
                        <p className="text-sm text-gray-700 leading-relaxed pl-10">
                          {operatingNote.SOAP.Assessment}
                        </p>
                      ) : (
                        <textarea
                          value={editedSOAP.Assessment}
                          onChange={(e) =>
                            handleSOAPChange("Assessment", e.target.value)
                          }
                          className="w-full pl-10 pr-2 py-2 text-sm text-gray-700 leading-relaxed border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white min-h-[120px]"
                        />
                      )}
                    </div>

                    {/* Plan */}
                    <div className="bg-gray-50 rounded-xl p-4 outline outline-1 outline-offset-[-1px] outline-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900 flex items-center space-x-2">
                          <span className="w-8 h-8 bg-gray-200 text-gray-700 rounded-full flex items-center justify-center text-sm font-bold">
                            P
                          </span>
                          <span>Plan</span>
                        </h4>
                        {!isEditingSOAP.Plan ? (
                          <button
                            onClick={() => handleEditSOAP("Plan")}
                            className="cursor-pointer flex items-center space-x-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                          >
                            <PencilIcon className="h-3 w-3" />
                            <span>Edit</span>
                          </button>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleSaveSOAP("Plan")}
                              className="cursor-pointer flex items-center space-x-1 px-2 py-1 text-xs text-gray-900 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                            >
                              <CheckCircleIcon className="h-3 w-3" />
                              <span>Save</span>
                            </button>
                            <button
                              onClick={() => handleCancelEdit("Plan")}
                              className="cursor-pointer flex items-center space-x-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                            >
                              <XCircleIcon className="h-3 w-3" />
                              <span>Cancel</span>
                            </button>
                          </div>
                        )}
                      </div>
                      {!isEditingSOAP.Plan ? (
                        <p className="text-sm text-gray-700 leading-relaxed pl-10">
                          {operatingNote.SOAP.Plan}
                        </p>
                      ) : (
                        <textarea
                          value={editedSOAP.Plan}
                          onChange={(e) =>
                            handleSOAPChange("Plan", e.target.value)
                          }
                          className="w-full pl-10 pr-2 py-2 text-sm text-gray-700 leading-relaxed border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white min-h-[100px]"
                        />
                      )}
                    </div>
                </div>
              )}
            </div>
          ) : null}
                  </div>
                )}
              </div>
            </div>
        </div>
    );
}
