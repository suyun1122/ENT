"use client";

import React, { useEffect, useState, useRef } from "react";
import Script from "next/script";
import ClickableVideoButton from "./ClickableVideoButton";
import ToolDetectionOverlay from "./ToolDetectionOverlay";

export default function ClickableVideo({
    hlsUrl,
    thumbnailUrl,
    button_metadata = [],
    height,
    width,
    toolDetectionData = null,
    showToolDetection = true,
    enabledTools = null
}) {

    const videoRef = useRef(null);
    const [videoTime, setVideoTime] = useState(0);
    const [hlsLoaded, setHlsLoaded] = useState(false);

    useEffect(() => {

        let hls;

        const video = videoRef.current;

        console.log('[ClickableVideo] HLS URL:', hlsUrl);
        console.log('[ClickableVideo] Video element:', video);

        if (video && hlsUrl) {
            if (typeof window !== 'undefined' && window.Hls && window.Hls.isSupported()) {
                console.log('[ClickableVideo] Using HLS.js');
                hls = new window.Hls();
                hls.loadSource(hlsUrl);
                hls.attachMedia(video);
                hls.on(window.Hls.Events.ERROR, (event, data) => {
                    console.error('[ClickableVideo] HLS.js error:', data);
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                console.log('[ClickableVideo] Using native HLS');
                video.src = hlsUrl;
            } else {
                console.warn('[ClickableVideo] HLS not supported');
            }
        } else {
            console.warn('[ClickableVideo] Missing video element or HLS URL');
        }

        const handleTimeUpdate = () => {
            const currentTime = video?.currentTime;
            setVideoTime(currentTime);
        };

        if (video) {
            video.addEventListener('timeupdate', handleTimeUpdate);
        }

        return () => {
            if (hls) {
                hls.destroy();
            }
            if (video) {
                video.removeEventListener('timeupdate', handleTimeUpdate);
            }
        }

    }, [hlsUrl, hlsLoaded])

    return (
        <>
            <Script
                src="https://cdn.jsdelivr.net/npm/hls.js@latest"
                onLoad={() => {
                    console.log('[ClickableVideo] HLS.js loaded');
                    setHlsLoaded(true);
                }}
                onError={(e) => {
                    console.error('[ClickableVideo] Failed to load HLS.js:', e);
                }}
            />
            <div className="relative rounded-lg shadow-lg overflow-hidden" style={{ height: height || 'auto', width: width || '100%' }}>
            <video
                ref={videoRef}
                className="w-full h-auto"
                controls
                autoPlay
                muted
                playsInline
                poster={thumbnailUrl}
                style={{ display: 'block', width: '100%', height: '100%' }}
            />

            {/* Tool Detection Overlay */}
            {toolDetectionData && showToolDetection && (
                <ToolDetectionOverlay
                    videoRef={videoRef}
                    detectionData={toolDetectionData}
                    isVisible={showToolDetection}
                    enabledTools={enabledTools}
                />
            )}

            <div className="absolute inset-0 pointer-events-none">
                {button_metadata ? button_metadata.map((btn, idx) => {
                    const { x = 50, y = 50, title, description, onClick, start, end, category, link } = btn;
                    if (!(start <= videoTime && videoTime <= end)) return null;
                    const ariaId = `cv-btn-tooltip-${idx}`;
                    return (
                        <ClickableVideoButton
                            key={idx}
                            x={x}
                            y={y}
                            title={title}
                            tooltip={description}
                            onClick={onClick}
                            ariaId={ariaId}
                            category={category}
                            link={link}
                        />
                    )
                }) : null}
            </div>
        </div>
        </>
    )

}