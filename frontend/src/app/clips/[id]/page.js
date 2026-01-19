"use client";

import ClipBento from "@/app/components/ClipBento";
import React, { useState, useEffect } from "react";
import Link from "next/link";

export default function ClipDetailPage({ params }) {

    const [clipData, setClipData] = useState(null);
    const [cachedData, setCachedData] = useState(null);
    const [error, setError] = useState(null);
    const [isRetrying, setIsRetrying] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [isAutoRetrying, setIsAutoRetrying] = useState(false);

    const paramsObj = (typeof React.use === 'function') ? React.use(params) : params;
    const { id } = paramsObj;

    useEffect(() => {
        loadClipData();
    }, []);

    // Load cached surgical analysis data after clipData is available
    useEffect(() => {
        if (clipData && clipData.pegasusId) {
            console.log(clipData)
            generateCacheData()
        }
    }, [clipData]);

    // Auto-start retry for upload/processing errors
    useEffect(() => {
        if (error && (error.type === 'video_not_uploaded' || error.type === 'video_not_ready') && !isAutoRetrying) {
            // Start auto-retry after a short delay
            console.log("Starting auto-retry");
            console.log(error)
            const timer = setTimeout(() => {
                startAutoRetry();
            }, 2000);

            return () => clearTimeout(timer);
        }
    }, [error]);

    const loadClipData = async () => {

        try {
            // Decode URL-encoded filename
            const decodedId = decodeURIComponent(id);
            console.log("Loading clip data for:", decodedId);

            const response = await fetch('/api/video', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Failed to load clip data", {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText
                });
                setError({
                    type: 'load_error',
                    message: `Failed to load video data: ${response.status} ${response.statusText}`
                });
                return;
            }

            const data = await response.json();
            console.log("Video data loaded:", data);

            // Try to find the clip by filename (try both encoded and decoded versions)
            let foundClip = null;

            for (let key in data) {
                const item = data[key];
                const itemFilename = item['filename'] || item['systemMetadata']?.filename || key;

                // Try exact match first
                if (decodedId === itemFilename || id === itemFilename) {
                    foundClip = item;
                    break;
                }

                // Try case-insensitive match
                if (decodedId.toLowerCase() === itemFilename.toLowerCase() ||
                    id.toLowerCase() === itemFilename.toLowerCase()) {
                    foundClip = item;
                    break;
                }

                // Try partial match (in case of URL encoding issues)
                if (itemFilename.includes(decodedId) || decodedId.includes(itemFilename)) {
                    foundClip = item;
                    break;
                }
            }

            if (foundClip) {
                console.log("Clip found:", foundClip);
                // Ensure required fields are set
                if (!foundClip.filename) {
                    foundClip.filename = foundClip.systemMetadata?.filename || decodedId;
                }
                if (!foundClip.id && foundClip.pegasusId) {
                    foundClip.id = foundClip.pegasusId;
                }
                setClipData(foundClip);
                return foundClip;
            } else {
                console.warn("Clip not found. ID:", decodedId);
                console.warn("Available clips:", Object.keys(data));
                setError({
                    type: 'clip_not_found',
                    message: `Video "${decodedId}" not found in index.`
                });
                return null;
            }

        } catch (error) {
            console.error("Error loading clip data", error);
            setError({
                type: 'load_error',
                message: `Error loading video: ${error.message}`
            });
            return;
        }
    }

    async function generateCacheData() {

        if (!clipData || !clipData.pegasusId) {
            console.warn('No clipData available for analysis yet');
            return;
        }

        try {

            const response = await fetch(`/api/analysis/${clipData['pegasusId']}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            })

            if (!response.ok) {
                const errorData = await response.json();
                console.error("Failed to fetch cached analysis data", errorData);

                // Check for video_not_ready error
                if (errorData.code === 'video_not_ready') {
                    setError({
                        type: 'video_not_ready',
                        message: errorData.message || 'The video is still being indexed. Please try again once the indexing process is complete.'
                    });
                    return;
                }

                // Check for video_not_uploaded error
                if (errorData.code === 'video_not_uploaded') {
                    setError({
                        type: 'video_not_uploaded',
                        message: errorData.message || 'The video is still being uploaded and processed. Please wait for the upload to complete.'
                    });
                    return;
                }

                // For cached data, we can continue without it
                console.warn("Could not fetch cached analysis data, continuing without it");
                return;
            }

            const data = await response.json();
            console.log("Cached analysis response", data);

            setCachedData(data);
            setError(null); // Clear any previous errors

        } catch (error) {
            console.error("Error fetching cached analysis data", error);
            // For cached data errors, we don't need to show an error to the user
            return;
        }
    }

    const retryAnalysis = async () => {
        setIsRetrying(true);
        setError(null);
        setRetryCount(prev => prev + 1);

        try {
            await generateCacheData();
        } catch (error) {
            console.error("Error during retry", error);
        } finally {
            setIsRetrying(false);
        }
    };

    const startAutoRetry = () => {
        if (isAutoRetrying) return;

        setIsAutoRetrying(true);
        setRetryCount(0);

        const autoRetry = async () => {
            if (retryCount >= 10) { // Max 10 retries
                setIsAutoRetrying(false);
                return;
            }

            try {
                await generateCacheData();

                // If successful, stop auto-retry
                if (!error) {
                    setIsAutoRetrying(false);
                    return;
                }
            } catch (error) {
                console.error("Error during auto-retry", error);
            }

            // Wait 5 seconds before next retry
            setTimeout(() => {
                setRetryCount(prev => prev + 1);
                autoRetry();
            }, 5000);
        };

        autoRetry();
    };

    const stopAutoRetry = () => {
        setIsAutoRetrying(false);
        setRetryCount(0);
    };

    // Small helper to format dates from a few common possible fields
    function formatClipDate(item) {
        if (!item) return null;
        const possible = item.date || item.createdAt || item.recorded_at || item.timestamp || item.uploaded_at;
        if (!possible) return null;
        try {
            const d = new Date(possible);
            if (isNaN(d.getTime())) return String(possible);
            return d.toLocaleString();
        } catch (e) {
            return String(possible);
        }
    }

    function getTags(obj) {
        const raw = obj?.hashtags ?? obj?.tags ?? null;
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.filter(Boolean).slice(0, 12);
        if (typeof raw === 'string') return raw.split(/[,\s]+/).map(t => t.replace(/^#/, '')).filter(Boolean).slice(0, 12);
        return [];
    }

    const displayDate = formatClipDate(clipData);

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#f4f3f3' }}>
            <div className="container mx-auto px-4 py-6">
                {/* Back Navigation */}
                <Link
                    href="/"
                    className="inline-flex items-center gap-1 text-gray-700 text-xs font-normal mb-6 hover:text-gray-900 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Library
                </Link>

                {/* Header: title and date */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">
                        {clipData ? clipData['filename']?.replace(/\.mp4$/i, '') : 'Loading...'}
                    </h1>
                    {displayDate && (
                        <p className="mt-1 text-sm text-gray-600">
                            Recorded: {displayDate}
                        </p>
                    )}
                </div>

                {/* Error Display */}
                {error && (
                    <div className={`mb-6 rounded-[20px] p-6 outline outline-1 outline-offset-[-1px] ${
                        error.type === 'video_not_uploaded'
                            ? 'bg-blue-50 outline-blue-200'
                            : error.type === 'video_not_ready'
                            ? 'bg-amber-50 outline-amber-200'
                            : 'bg-red-50 outline-red-200'
                    }`}>
                        <div className="flex items-start">
                            <div className="flex-shrink-0">
                                {error.type === 'video_not_uploaded' ? (
                                    <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                    </svg>
                                ) : error.type === 'video_not_ready' ? (
                                    <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                ) : (
                                    <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                )}
                            </div>
                            <div className="ml-3 flex-1">
                                <h3 className={`text-lg font-medium ${
                                    error.type === 'video_not_uploaded'
                                        ? 'text-blue-800'
                                        : error.type === 'video_not_ready'
                                        ? 'text-amber-800'
                                        : 'text-red-800'
                                }`}>
                                    {error.type === 'video_not_uploaded'
                                        ? 'Video Being Uploaded'
                                        : error.type === 'video_not_ready'
                                        ? 'Video Still Processing'
                                        : 'Analysis Error'
                                    }
                                </h3>
                                <p className={`mt-1 text-sm ${
                                    error.type === 'video_not_uploaded'
                                        ? 'text-blue-700'
                                        : error.type === 'video_not_ready'
                                        ? 'text-amber-700'
                                        : 'text-red-700'
                                }`}>
                                    {error.message}
                                </p>

                                {/* Auto-retry status for upload/processing errors */}
                                {(error.type === 'video_not_uploaded' || error.type === 'video_not_ready') && (
                                    <div className="mt-3">
                                        {isAutoRetrying ? (
                                            <div className="flex items-center text-sm text-gray-600">
                                                <div className="w-4 h-4 rounded-full border-2 border-solid border-gray-500 border-t-transparent animate-spin mr-2"></div>
                                                Auto-checking every 5 seconds... (Attempt {retryCount}/10)
                                            </div>
                                        ) : (
                                            <div className="text-sm text-gray-600">
                                                We will automatically check when the video is ready.
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="mt-4 flex gap-3">
                                    <button
                                        onClick={retryAnalysis}
                                        disabled={isRetrying || isAutoRetrying}
                                        className="cursor-pointer h-10 px-4 py-2 text-sm font-normal rounded-2xl inline-flex justify-center items-center gap-2 bg-[#1D1C1B] text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {isRetrying ? (
                                            <>
                                                <div className="w-4 h-4 rounded-full border-2 border-solid border-white border-t-transparent animate-spin"></div>
                                                Retrying...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                                Try Now
                                            </>
                                        )}
                                    </button>

                                    {(error.type === 'video_not_uploaded' || error.type === 'video_not_ready') && (
                                        <>
                                            {!isAutoRetrying ? (
                                                <button
                                                    onClick={startAutoRetry}
                                                    className="cursor-pointer h-10 px-4 py-2 text-sm font-normal rounded-2xl inline-flex justify-center items-center gap-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                    </svg>
                                                    Auto-Retry
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={stopAutoRetry}
                                                    className="cursor-pointer h-10 px-4 py-2 text-sm font-normal rounded-2xl inline-flex justify-center items-center gap-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                    Stop Auto-Retry
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ClipBento Component with Video, Chat, and Forensics */}
                <div>
                    {clipData ? (
                        <ClipBento
                            clipData={clipData}
                            videoId={clipData['pegasusId']}
                            initialAnalysisData={cachedData?.data}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="w-10 h-10 rounded-full border-2 border-solid border-gray-500 border-t-transparent animate-spin mb-6"></div>
                            <p className="text-gray-600 font-normal text-base">Loading clip data...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )

}