"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ShieldCheckIcon,
  ClockIcon,
  UserGroupIcon,
  DocumentTextIcon,
  ChartBarIcon,
  EyeIcon,
  CogIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ArrowDownTrayIcon,
  CurrencyDollarIcon,
  WrenchScrewdriverIcon,
  LightBulbIcon,
  CalendarDaysIcon,
  UserIcon,
  ClipboardDocumentListIcon,
  PencilIcon,
} from "@heroicons/react/24/outline";
import ClickableVideo from "./ClickableVideo";
import ClipChat from "./ClipChat";
import { ToolFilterPanel } from "./ToolDetectionOverlay";

// Optional default geolocation (configure via NEXT_PUBLIC_DEFAULT_LAT/LON)
const DEFAULT_LAT = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT || "");
const DEFAULT_LON = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LON || "");
const HAS_DEFAULT_GEO =
  Number.isFinite(DEFAULT_LAT) && Number.isFinite(DEFAULT_LON);
const DEFAULT_GEOLOCATION = HAS_DEFAULT_GEO
    ? { coords: { latitude: DEFAULT_LAT, longitude: DEFAULT_LON } }
    : null;

export default function ClipBento({ clipData, buttonMetadata, videoId }) {
  const [operatingNote, setOperatingNote] = useState(null);
  const [chapters, setChapters] = useState(null);
    const [forensicsData, setForensicsData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [reportGenerated, setReportGenerated] = useState(false);
    const [correctiveActionStatuses, setCorrectiveActionStatuses] = useState({});
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

  // Auto-load tool detection when videoId is available
  useEffect(() => {
    const loadToolDetection = async () => {
      if (!videoId) return;

      setIsLoadingToolDetection(true);
      setToolDetectionError(null);

      try {
        // 1. First, try to load from static files (pre-deployed detections)
        console.log('[Tool Detection] Checking static file...');
        const staticResponse = await fetch(`/detections/${videoId}.json`);

        if (staticResponse.ok) {
          console.log('[Tool Detection] Loaded from static file');
          const staticData = await staticResponse.json();
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
          setToolDetectionData(data.data);
          setToolDetectionProgress(100);
          setToolDetectionStage('completed');
          setIsLoadingToolDetection(false);
        } else if (data.status === "not_found") {
          console.log('[Tool Detection] No results found, starting processing...');
          setIsLoadingToolDetection(true);
          // Start processing in background
          const startResponse = await fetch(`/api/detect-tools/${videoId}`, {
            method: "POST",
          });
          const startData = await startResponse.json();
          console.log("[Tool Detection] Processing started:", startData);

          // Poll for results
          pollToolDetection(videoId);
        } else if (data.status === "processing") {
          console.log("[Tool Detection] Already processing, polling...");
          setIsLoadingToolDetection(true);
          pollToolDetection(videoId);
        }
      } catch (error) {
        console.error("[Tool Detection] Error loading:", error);
        setToolDetectionError(error.message);
        setIsLoadingToolDetection(false);
      }
    };

    loadToolDetection();
  }, [videoId]);

  // Poll for tool detection results
  const pollToolDetection = async (videoId) => {
    const maxAttempts = 60; // 5 minutes (5s interval)
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/detect-tools/${videoId}`);
        const data = await response.json();

        if (data.status === "completed") {
          console.log("[Tool Detection] Processing complete!");
          setToolDetectionData(data.data);
          setToolDetectionProgress(100);
          setToolDetectionStage('completed');
          setIsLoadingToolDetection(false);
          return;
        } else if (data.status === "error") {
          console.error("[Tool Detection] Processing error:", data.error);
          setToolDetectionError(data.error);
          setIsLoadingToolDetection(false);
          return;
        } else if (data.status === "processing") {
          // Update progress from server
          console.log(`[Tool Detection] Progress: ${data.progress}%, Stage: ${data.stage}`);
          setToolDetectionProgress(data.progress || 0);
          setToolDetectionStage(data.stage || 'processing');
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000); // Poll every 5 seconds
        } else {
          setToolDetectionError("Processing timeout");
          setIsLoadingToolDetection(false);
        }
      } catch (error) {
        console.error("[Tool Detection] Poll error:", error);
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

  // Surgical analysis prompt (constant)
  const surgicalAnalysisPrompt = `You are analyzing a full-length surgical video.

This task is for EDUCATIONAL and DEMONSTRATION purposes only.
The output is a video-derived operative summary and is NOT a substitute for a clinical operative report.

Your tasks:

1. Chapterize the surgery using the predefined surgical phases below.
2. Generate a SOAP-inspired operative note STRICTLY based on what is visible in the video.
   - CRITICAL: Write the operative note in FIRST-PERSON perspective
   - Use "I performed...", "I observed...", "I assessed...", "I identified..."
   - Write as if you are the surgeon documenting the procedure
   - Example: "I made an incision..." instead of "An incision was made..."
   - Example: "I identified the cystic duct..." instead of "The cystic duct was identified..."

IMPORTANT GLOBAL RULES (SURGEON-SAFE GUARDRAILS):

- Analyze the ENTIRE video from start to finish.
- Use ONLY the phases provided. Do NOT invent new phases.
- Do NOT infer or assume:
• patient symptoms
• surgical indication
• pathology or diagnosis (e.g., gallstones, malignancy)
• postoperative orders or plans
- If information is NOT explicitly visible or inferable from the video, clearly state:
"Not explicitly observed in the video."
- Prioritize factual, observable actions over narrative completeness.
- When in doubt, be conservative.

---

## SURGICAL PHASE DEFINITIONS

Use the following phases, in this exact order when applicable:

1. Access / Exposure

Establishing access to the operative field, including incision or port placement, patient positioning, and visualization.

2. Establishing Hemostasis (Early)

Initial control of bleeding introduced during access and exposure to ensure adequate visualization.

3. Anatomy Identification

Identification of anatomical landmarks and critical structures to orient the surgeon.

4. Pathology Treatment / Intervention

The primary operative task, such as resection, repair, reconstruction, or implant placement.

5. Hemostasis & Verification

Final bleeding control and verification that the intended outcome of the intervention was achieved.

6. Closure

Layered closure of the operative field and restoration of tissue integrity.

---

## OUTPUT REQUIREMENTS

Respond with a single valid JSON object in the following format:

{
"chapters": [
{
"phase": "Access / Exposure",
"start_time_sec": number,
"end_time_sec": number,
"description": "Brief, objective description of what occurred during this phase."
}
],
"operative_note": {
"SOAP": {
"Subjective": "If patient-reported symptoms or surgical indications are not explicitly shown, state: 'Not explicitly observed in the video.'",
"Objective": "Objective intraoperative actions and findings observed in the video, written in clinical operative language.",
"Assessment": "Assessment of procedural completion and intraoperative outcome based solely on observed evidence (e.g., adequate exposure, completion of intervention, hemostasis achieved).",
"Plan": "Only include immediate postoperative observations if explicitly visible; otherwise state: 'Not explicitly observed in the video.'"
}
}
}

---

## STYLE GUIDELINES

- Use a neutral, professional surgical tone.
- Write in the past tense.
- Avoid timestamps in the operative note text.
- Do NOT over-summarize or embellish.
- Clarity and safety take precedence over completeness.`;

  // Use TanStack Query for surgical analysis with automatic caching
  const {
    data: surgicalAnalysisData,
    isLoading: isLoadingSurgicalAnalysis,
    error: surgicalAnalysisError,
  } = useQuery({
    queryKey: ['surgicalAnalysis', videoId],
    queryFn: async () => {
      if (!videoId) return null;

      console.log('[Surgical Analysis] Fetching analysis for video', videoId);
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: videoId,
          userQuery: surgicalAnalysisPrompt,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to load surgical analysis");
      }

      const data = await response.json();

      // TwelveLabs API returns data as a JSON string that needs parsing
      let parsedData;
      try {
        let jsonString = data.data || data.response;

        // Remove markdown code blocks if present (```json ... ```)
        if (typeof jsonString === 'string') {
          // Remove markdown code fences
          jsonString = jsonString
            .replace(/^```json\s*/i, '')  // Remove opening ```json
            .replace(/^```\s*/i, '')      // Remove opening ```
            .replace(/\s*```$/i, '')      // Remove closing ```
            .trim();

          parsedData = JSON.parse(jsonString);
        } else {
          // Already parsed
          parsedData = jsonString || data;
        }
      } catch (parseError) {
        console.error('[Surgical Analysis] JSON parse error:', parseError);
        console.error('[Surgical Analysis] Raw data:', data);
        throw new Error(`Failed to parse surgical analysis: ${parseError.message}`);
      }

      return parsedData;
    },
    enabled: !!videoId, // Only run if videoId exists
    staleTime: 60 * 60 * 1000, // Consider data fresh for 1 hour
    gcTime: 24 * 60 * 60 * 1000, // Keep in cache for 24 hours
  });

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

  const handleSaveSOAP = (section) => {
    setOperatingNote((prev) => ({
      ...prev,
      SOAP: {
        ...prev.SOAP,
        [section]: editedSOAP[section],
      },
    }));
    setIsEditingSOAP((prev) => ({
      ...prev,
      [section]: false,
    }));
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

    const mockForensicsData = {
        compliance: {
            violations: [
                {
                    id: 1,
          type: "PPE Violation",
          severity: "high",
          description:
            "Worker at the sewing station is not wearing protective gloves while the machine is in operation.",
          timestamp: "00:05",
          location: "Sewing Station 3",
          regulation: "OSHA 1910.132",
          rootCause: "Training Gap",
          potentialFineUSD: 15625,
                },
                {
                    id: 2,
          type: "Safety Protocol",
          severity: "medium",
          description:
            "Improper lifting technique observed during material handling",
          timestamp: "01:32",
          location: "Warehouse Section B",
          regulation: "OSHA 1910.178",
          rootCause: "Process Flaw",
          potentialFineUSD: 8750,
        },
      ],
      scoringMethodology:
        "Base score of 100, with deductions for violations based on severity (High: -15, Medium: -10, Low: -5).",
      score: 75,
        },
        riskAssessment: {
      overallSafetyRisk: "medium",
      overallOperationalRisk: "low",
            riskFactors: [
        {
          factor: "Lack of Consistent PPE Usage",
          level: "medium",
          impact: "Worker Safety",
        },
        {
          factor: "Equipment Operation",
          level: "low",
          impact: "Production Efficiency",
        },
        {
          factor: "Environmental",
          level: "medium",
          impact: "Workplace Safety",
        },
      ],
        },
        correctiveActions: [
            {
                violationId: 1,
        action:
          "Conduct mandatory refresher training on PPE requirements for all sewing station operators and install a glove dispenser at Station 3.",
        assignee: "Shift Supervisor",
        dueDate: "2025-10-18",
        status: "Pending",
            },
            {
                violationId: 2,
        action:
          "Implement proper lifting technique training and provide mechanical lifting aids.",
        assignee: "Safety Manager",
        dueDate: "2025-10-20",
        status: "In Progress",
      },
        ],
        operationalEfficiency: {
            identifiedWastes: [
                {
          type: "Waiting (Muda)",
          timestamp: "00:12",
          description:
            "Worker at the packing station is idle for 15 seconds waiting for boxes to arrive on the conveyor belt, indicating a bottleneck upstream.",
        },
        {
          type: "Unnecessary Motion (Muda)",
          timestamp: "00:21",
          description:
            "Worker at Assembly Line B has to walk 10 feet to retrieve a tool, which should be located at their station.",
        },
            ],
            recommendations: [
        "Adjust conveyor belt speed from the primary cutting area to better match the packing station's cycle time.",
        "Implement a 5S program at Assembly Line B to ensure all necessary tools are within arm's reach.",
      ],
        },
        summary: {
      duration: "00:30",
            workersPresent: 2,
            safetyIncidents: 0,
            keyFindings: [
        "While no injuries occurred, the observed PPE violation at Sewing Station 3 represents a significant and recurring risk.",
        "Analysis of workflow indicates a minor bottleneck causing intermittent downtime at the final packing station.",
      ],
    },
  };

    const exportToPDF = () => {
        // In real implementation, this would generate and download a PDF
    const element = document.createElement("a");
    const file = new Blob(
      ["Compliance Report PDF content would be generated here"],
      { type: "application/pdf" }
    );
        element.href = URL.createObjectURL(file);
    element.download = `compliance-report-${
      new Date().toISOString().split("T")[0]
    }.pdf`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const exportToCSV = () => {
        // Generate CSV content from forensics data
        const csvContent = generateCSVContent();
    const element = document.createElement("a");
    const file = new Blob([csvContent], { type: "text/csv" });
        element.href = URL.createObjectURL(file);
    element.download = `compliance-report-${
      new Date().toISOString().split("T")[0]
    }.csv`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const generateCSVContent = () => {
    if (!forensicsData) return "";

    let csv = "Compliance Report\n\n";
    csv += "Compliance Score," + forensicsData.compliance.score + "%\n";
    csv +=
      "Scoring Methodology," +
      forensicsData.compliance.scoringMethodology +
      "\n\n";

    csv += "Violations\n";
    csv +=
      "ID,Type,Severity,Description,Timestamp,Location,Regulation,Root Cause,Potential Fine (USD)\n";
    forensicsData.compliance.violations.forEach((violation) => {
            csv += `"${violation.id}","${violation.type}","${violation.severity}","${violation.description}","${violation.timestamp}","${violation.location}","${violation.regulation}","${violation.rootCause}","${violation.potentialFineUSD}"\n`;
        });

    csv += "\nRisk Assessment\n";
    csv +=
      "Overall Safety Risk," +
      forensicsData.riskAssessment.overallSafetyRisk +
      "\n";
    csv +=
      "Overall Operational Risk," +
      forensicsData.riskAssessment.overallOperationalRisk +
      "\n";
    csv += "Factor,Level,Impact\n";
    forensicsData.riskAssessment.riskFactors.forEach((factor) => {
            csv += `"${factor.factor}","${factor.level}","${factor.impact}"\n`;
        });

    csv += "\nCorrective Actions\n";
    csv += "Violation ID,Action,Assignee,Due Date,Status\n";
    forensicsData.correctiveActions.forEach((action) => {
            csv += `"${action.violationId}","${action.action}","${action.assignee}","${action.dueDate}","${action.status}"\n`;
        });

    csv += "\nOperational Efficiency\n";
    csv += "Waste Type,Timestamp,Description\n";
    forensicsData.operationalEfficiency.identifiedWastes.forEach((waste) => {
            csv += `"${waste.type}","${waste.timestamp}","${waste.description}"\n`;
        });

    csv += "\nRecommendations\n";
    forensicsData.operationalEfficiency.recommendations.forEach((rec) => {
            csv += `"${rec}"\n`;
        });

    csv += "\nSummary\n";
    csv += "Duration," + forensicsData.summary.duration + "\n";
    csv += "Workers Present," + forensicsData.summary.workersPresent + "\n";
    csv += "Safety Incidents," + forensicsData.summary.safetyIncidents + "\n";

    csv += "\nKey Findings\n";
    forensicsData.summary.keyFindings.forEach((finding) => {
            csv += `"${finding}"\n`;
        });

        return csv;
    };

    const getSeverityColor = (severity) => {
    switch (severity) {
      case "high":
        return "text-red-600 bg-red-50 border-red-200";
      case "medium":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "low":
        return "text-green-600 bg-green-50 border-green-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
        }
    };

    const getRiskLevelColor = (level) => {
    switch (level) {
      case "high":
        return "text-red-600";
      case "medium":
        return "text-yellow-600";
      case "low":
        return "text-green-600";
      default:
        return "text-gray-600";
        }
    };

    const getEventTypeIcon = (type) => {
    switch (type) {
      case "warning":
        return <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />;
      case "info":
        return <CheckCircleIcon className="h-4 w-4 text-blue-500" />;
      case "error":
        return <XCircleIcon className="h-4 w-4 text-red-500" />;
      default:
        return <ClockIcon className="h-4 w-4 text-gray-500" />;
        }
    };

    const getActionStatusColor = (status) => {
    switch (status) {
      case "Approved":
        return "text-green-600 bg-green-50 border-green-200";
      case "Declined":
        return "text-red-600 bg-red-50 border-red-200";
      case "Pending":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "In Progress":
        return "text-blue-600 bg-blue-50 border-blue-200";
      case "Completed":
        return "text-green-600 bg-green-50 border-green-200";
      case "Overdue":
        return "text-red-600 bg-red-50 border-red-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
        }
    };

    const getWasteTypeColor = (type) => {
    switch (type) {
      case "Waiting (Muda)":
        return "text-orange-600 bg-orange-50 border-orange-200";
      case "Unnecessary Motion (Muda)":
        return "text-purple-600 bg-purple-50 border-purple-200";
      case "Overproduction (Muda)":
        return "text-red-600 bg-red-50 border-red-200";
      case "Defects (Muda)":
        return "text-pink-600 bg-pink-50 border-pink-200";
      case "Inventory (Muda)":
        return "text-indigo-600 bg-indigo-50 border-indigo-200";
      case "Transportation (Muda)":
        return "text-cyan-600 bg-cyan-50 border-cyan-200";
      case "Overprocessing (Muda)":
        return "text-teal-600 bg-teal-50 border-teal-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
        }
    };

    const handleActionApproval = (actionIndex, status) => {
    setCorrectiveActionStatuses((prev) => ({
            ...prev,
      [actionIndex]: status,
        }));
    };

    const getActionStatus = (actionIndex, originalStatus) => {
        return correctiveActionStatuses[actionIndex] || originalStatus;
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
                            button_metadata={buttonMetadata}
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
                    <p className="text-sm text-gray-600 mb-3">
                      Analyzing video with YOLO11m model to identify surgical
                      instruments...
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

      {/* Surgical Phase Timeline */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
            <ClockIcon className="h-5 w-5 text-blue-500" />
            <span>Surgical Phase Timeline</span>
          </h3>
          {chapters && chapters.length > 0 && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg">
              <span className="text-sm font-medium">
                {chapters.length} Phases
              </span>
            </div>
          )}
        </div>

        {isLoadingChapters ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">
              Loading surgical phases...
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
                        {chapter.phase}
                      </span>
                      <span className="text-sm text-gray-600">
                        {Math.floor(chapter.start_time_sec / 60)}:
                        {(chapter.start_time_sec % 60)
                          .toString()
                          .padStart(2, "0")}{" "}
                        - {Math.floor(chapter.end_time_sec / 60)}:
                        {(chapter.end_time_sec % 60)
                          .toString()
                          .padStart(2, "0")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800">
                      {chapter.description}
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
              {operatingNote && operatingNote.SOAP && (
                                        <div className="flex items-center space-x-2">
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
                                        </div>
                                )}
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="p-8 text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto"></div>
              <p className="mt-4 text-gray-600">
                Analyzing surgical video with TwelveLabs Pegasus...
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
          ) : forensicsData ? (
                        <div className="p-6 space-y-6">
              {/* Legacy Forensics View - kept for backward compatibility */}
                            {/* 1. COMPLIANCE VIOLATIONS - Most Critical for Factory Managers */}
                            <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-6 border border-red-100">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                                        <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
                                        <span>Compliance Violations</span>
                                    </h3>
                                    <div className="flex items-center space-x-4">
                                        <div className="text-right">
                                            <div className="text-2xl font-bold text-red-600">
                                                {forensicsData?.compliance.score || 0}%
                                            </div>
                      <div className="text-sm text-gray-600">
                        Compliance Score
                      </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-bold text-red-600">
                        $
                        {forensicsData?.compliance.violations
                          ?.reduce(
                            (sum, v) => sum + (v.potentialFineUSD || 0),
                            0
                          )
                          .toLocaleString() || 0}
                                            </div>
                      <div className="text-sm text-gray-600">
                        Potential Fines
                      </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mb-4 p-3 bg-white/70 backdrop-blur-sm rounded-lg border border-red-200/50">
                                    <p className="text-sm text-gray-700">
                    <strong>Scoring Methodology:</strong>{" "}
                    {forensicsData?.compliance.scoringMethodology}
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    {forensicsData?.compliance.violations.map((violation) => (
                    <div
                      key={violation.id}
                      className="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-red-200/50"
                    >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center space-x-2 mb-2">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor(
                                violation.severity
                              )}`}
                            >
                                                            {violation.severity.toUpperCase()}
                                                        </span>
                            <span className="text-sm text-gray-600">
                              {violation.timestamp}
                            </span>
                            <span className="text-sm text-gray-500">
                              • {violation.location}
                            </span>
                            <span className="text-sm font-bold text-red-600">
                              ${violation.potentialFineUSD?.toLocaleString()}
                            </span>
                                                    </div>
                          <p className="text-sm text-gray-800 mb-2">
                            {violation.description}
                          </p>
                                                    <div className="flex items-center space-x-4 text-xs text-gray-600">
                            <span>
                              <strong>Regulation:</strong>{" "}
                              {violation.regulation}
                            </span>
                            <span>
                              <strong>Root Cause:</strong> {violation.rootCause}
                            </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 2. CORRECTIVE ACTIONS - Actionable Items */}
                            <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-6 border border-emerald-100">
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2 mb-4">
                                    <ClipboardDocumentListIcon className="h-5 w-5 text-emerald-500" />
                                    <span>Corrective Actions</span>
                                </h3>

                                <div className="space-y-3">
                                    {forensicsData?.correctiveActions.map((action, index) => {
                                        const currentStatus = getActionStatus(index, action.status);
                                        return (
                      <div
                        key={index}
                        className="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-emerald-200/50"
                      >
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex-1">
                            <p className="text-sm text-gray-800 mb-2">
                              {action.action}
                            </p>
                                                        <div className="flex items-center space-x-4 text-xs text-gray-600">
                                                            <span className="flex items-center space-x-1">
                                                                <UserIcon className="h-3 w-3" />
                                <span>
                                  <strong>Assignee:</strong> {action.assignee}
                                </span>
                                                            </span>
                                                            <span className="flex items-center space-x-1">
                                                                <CalendarDaysIcon className="h-3 w-3" />
                                <span>
                                  <strong>Due:</strong> {action.dueDate}
                                                            </span>
                              </span>
                              <span>
                                <strong>Violation ID:</strong>{" "}
                                {action.violationId}
                              </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end space-y-2">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium border ${getActionStatusColor(
                                currentStatus
                              )}`}
                            >
                                                            {currentStatus}
                                                        </span>
                            {currentStatus === "Pending" && (
                                                            <div className="flex space-x-2">
                                                                <button
                                  onClick={() =>
                                    handleActionApproval(index, "Approved")
                                  }
                                                                    className="px-3 py-1 bg-green-100 hover:bg-green-200 text-green-700 text-xs font-medium rounded-md border border-green-200 transition-colors duration-200 flex items-center space-x-1"
                                                                >
                                                                    <CheckCircleIcon className="h-3 w-3" />
                                                                    <span>Approve</span>
                                                                </button>
                                                                <button
                                  onClick={() =>
                                    handleActionApproval(index, "Declined")
                                  }
                                                                    className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded-md border border-red-200 transition-colors duration-200 flex items-center space-x-1"
                                                                >
                                                                    <XCircleIcon className="h-3 w-3" />
                                                                    <span>Decline</span>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 3. RISK ASSESSMENT - Safety & Operational Risk */}
                            <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl p-6 border border-yellow-100">
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2 mb-4">
                                    <ChartBarIcon className="h-5 w-5 text-yellow-500" />
                                    <span>Risk Assessment</span>
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                    <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 text-center">
                                        <ShieldCheckIcon className="h-6 w-6 text-red-500 mx-auto mb-2" />
                    <div className="text-lg font-bold text-gray-900 capitalize">
                      {forensicsData?.riskAssessment.overallSafetyRisk}
                    </div>
                                        <div className="text-xs text-gray-600">Safety Risk</div>
                                    </div>
                                    <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 text-center">
                                        <CogIcon className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                    <div className="text-lg font-bold text-gray-900 capitalize">
                      {forensicsData?.riskAssessment.overallOperationalRisk}
                    </div>
                    <div className="text-xs text-gray-600">
                      Operational Risk
                    </div>
                                    </div>
                                    <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 text-center">
                                        <ExclamationTriangleIcon className="h-6 w-6 text-yellow-500 mx-auto mb-2" />
                    <div className="text-lg font-bold text-gray-900">
                      {forensicsData?.riskAssessment.riskFactors?.length || 0}
                    </div>
                                        <div className="text-xs text-gray-600">Risk Factors</div>
                                    </div>
                                </div>

                                <div>
                  <h4 className="font-medium text-gray-800 mb-3">
                    Risk Factors
                  </h4>
                                    <div className="space-y-2">
                    {forensicsData?.riskAssessment.riskFactors.map(
                      (factor, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between bg-white/70 backdrop-blur-sm rounded-lg p-3"
                        >
                                                <div>
                            <p className="text-sm font-medium text-gray-800">
                              {factor.factor}
                            </p>
                            <p className="text-xs text-gray-600">
                              {factor.impact}
                            </p>
                                                </div>
                          <span
                            className={`text-sm font-medium ${getRiskLevelColor(
                              factor.level
                            )}`}
                          >
                                                    {factor.level.toUpperCase()}
                                                </span>
                                            </div>
                      )
                    )}
                                    </div>
                                </div>
                            </div>

                            {/* 4. OPERATIONAL EFFICIENCY - Lean Manufacturing Focus */}
                            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-100">
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2 mb-4">
                                    <WrenchScrewdriverIcon className="h-5 w-5 text-purple-500" />
                                    <span>Operational Efficiency</span>
                                </h3>

                                <div className="space-y-4">
                                    <div>
                    <h4 className="font-medium text-gray-800 mb-3">
                      Identified Wastes (7 Wastes of Lean)
                    </h4>
                                        <div className="space-y-2">
                      {forensicsData?.operationalEfficiency.identifiedWastes.map(
                        (waste, index) => (
                          <div
                            key={index}
                            className="bg-white/70 backdrop-blur-sm rounded-lg p-3 border border-purple-200/50"
                          >
                                                    <div className="flex items-start justify-between mb-1">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium border ${getWasteTypeColor(
                                  waste.type
                                )}`}
                              >
                                                            {waste.type}
                                                        </span>
                              <span className="text-xs text-gray-500">
                                {waste.timestamp}
                              </span>
                                                    </div>
                            <p className="text-sm text-gray-800">
                              {waste.description}
                            </p>
                                                </div>
                        )
                      )}
                                        </div>
                                    </div>

                                    <div>
                    <h4 className="font-medium text-gray-800 mb-3">
                      Recommendations
                    </h4>
                                        <div className="space-y-2">
                      {forensicsData?.operationalEfficiency.recommendations.map(
                        (rec, index) => (
                          <div
                            key={index}
                            className="flex items-start space-x-2 bg-white/70 backdrop-blur-sm rounded-lg p-3"
                          >
                                                    <LightBulbIcon className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                                                    <p className="text-sm text-gray-800">{rec}</p>
                                                </div>
                        )
                      )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 5. SUMMARY & METRICS - Overview */}
                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2 mb-4">
                                    <DocumentTextIcon className="h-5 w-5 text-blue-500" />
                                    <span>Summary & Metrics</span>
                                </h3>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                    <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 text-center">
                                        <ClockIcon className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-gray-900">
                      {forensicsData?.summary.duration}
                    </div>
                                        <div className="text-xs text-gray-600">Duration</div>
                                    </div>
                                    <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 text-center">
                                        <UserGroupIcon className="h-6 w-6 text-green-500 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-gray-900">
                      {forensicsData?.summary.workersPresent}
                    </div>
                                        <div className="text-xs text-gray-600">Workers</div>
                                    </div>
                                    <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 text-center">
                                        <ExclamationTriangleIcon className="h-6 w-6 text-red-500 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-gray-900">
                      {forensicsData?.summary.safetyIncidents}
                    </div>
                                        <div className="text-xs text-gray-600">Incidents</div>
                                    </div>
                                    <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 text-center">
                                        <CurrencyDollarIcon className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
                                        <div className="text-2xl font-bold text-gray-900">
                      $
                      {forensicsData?.compliance.violations
                        ?.reduce((sum, v) => sum + (v.potentialFineUSD || 0), 0)
                        .toLocaleString() || 0}
                                        </div>
                                        <div className="text-xs text-gray-600">Total Risk</div>
                                    </div>
                                </div>

                                <div>
                  <h4 className="font-medium text-gray-800 mb-3">
                    Key Findings
                  </h4>
                                    <div className="space-y-2">
                    {forensicsData?.summary.keyFindings.map(
                      (finding, index) => (
                        <div
                          key={index}
                          className="flex items-start space-x-2 bg-white/70 backdrop-blur-sm rounded-lg p-3"
                        >
                                                <EyeIcon className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                                                <p className="text-sm text-gray-800">{finding}</p>
                                            </div>
                      )
                    )}
                                    </div>
                                </div>
                            </div>
                        </div>
          ) : null}
                </div>
            </div>
        </div>
    );
}
