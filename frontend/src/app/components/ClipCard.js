'use client';

import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';
import {
  PlayIcon,
  CalendarIcon,
  ClockIcon,
  EyeIcon,
  TagIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import Hls from 'hls.js';
import { useRouter } from 'next/navigation';

export default function ClipCard({ video_url, createdAt, duration, name, thumbnail_url, vss_id, category, priority, searchScore, searchConfidence, clipStart, clipEnd, isClip, isSearchResult }) {
    const [hovered, setHovered] = useState(false);
    const [imageError, setImageError] = useState(false);
    const videoRef = useRef(null);
    const router = useRouter();

    // Use clip-specific duration if it's a clip, otherwise use full duration
    const actualDuration = isClip && clipStart !== undefined && clipEnd !== undefined
        ? clipEnd - clipStart
        : duration;

    // Get category and priority from props or determine from filename
    const getCategory = () => {
      if (category) return category;
      const filename = name?.toLowerCase() || '';
      if (filename.includes('safety') || filename.includes('ppe') || filename.includes('helmet')) {
        return 'safety';
      } else if (filename.includes('defect') || filename.includes('quality') || filename.includes('error')) {
        return 'defect';
      }
      return 'general';
    };

    const getPriority = () => {
      if (priority) return priority;
      const filename = name?.toLowerCase() || '';
      if (filename.includes('urgent') || filename.includes('critical') || filename.includes('emergency')) {
        return 'high';
      } else if (filename.includes('warning') || filename.includes('caution')) {
        return 'medium';
      }
      return 'low';
    };

    const clipCategory = getCategory();
    const clipPriority = getPriority();

    useEffect(() => {
        let hls;

        if (hovered && videoRef.current && video_url) {
            const video = videoRef.current;

            if (Hls.isSupported()) {
                hls = new Hls();
                hls.loadSource(video_url);
                hls.attachMedia(video);

                // If this is a clip with time range, seek to the start time
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    if (isClip && clipStart !== undefined) {
                        video.currentTime = clipStart;
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = video_url;

                // If this is a clip with time range, seek to the start time
                video.addEventListener('loadedmetadata', () => {
                    if (isClip && clipStart !== undefined) {
                        video.currentTime = clipStart;
                    }
                });
            }

            // Stop playback when reaching clip end
            if (isClip && clipEnd !== undefined) {
                const handleTimeUpdate = () => {
                    if (video.currentTime >= clipEnd) {
                        video.currentTime = clipStart || 0;
                    }
                };
                video.addEventListener('timeupdate', handleTimeUpdate);

                return () => {
                    video.removeEventListener('timeupdate', handleTimeUpdate);
                    if (hls) {
                        hls.destroy();
                    }
                };
            }
        }

        return () => {
            if (hls) {
                hls.destroy();
            }
        };
    }, [hovered, video_url, clipStart, clipEnd, isClip]);

    const formatDate = (dateString) => {
        if (!dateString) return 'Unknown date';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getPriorityStyle = (priority) => {
        switch(priority) {
            case 'high': return { backgroundColor: 'var(--color-red)' };
            case 'medium': return { backgroundColor: 'var(--color-orange)' };
            case 'low': return { backgroundColor: 'var(--color-green)' };
            default: return { backgroundColor: 'var(--zinc-500)' };
        }
    };

    const handleClick = () => {
        console.log('View clip details for:', vss_id || name);
        router.push(`/clips/${name}`); // Navigate to clip detail page
    };

    // Get confidence badge styles based on score
    const getConfidenceBadgeClass = (score) => {
        if (score >= 80) return 'confidence-high';
        if (score >= 60) return 'confidence-medium';
        return 'confidence-low';
    };

    const getConfidenceLabel = (score) => {
        if (score >= 80) return 'HIGH';
        if (score >= 60) return 'MEDIUM';
        return 'LOW';
    };

    return (
        <div
            className="group cursor-pointer"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={handleClick}
        >
            {/* Video/Thumbnail Container */}
            <div className="relative aspect-video w-full rounded-[32px] overflow-hidden shadow-soft hover:shadow-card transition-all duration-300 transform hover:-translate-y-1"
                 style={{ backgroundColor: 'var(--zinc-300)' }}>
                {!hovered ? (
                    <>
                        {!imageError && thumbnail_url ? (
                            <Image
                                src={thumbnail_url}
                                alt={name || 'Video thumbnail'}
                                fill
                                className="object-cover group-hover:scale-105 transition-transform duration-500"
                                onError={() => setImageError(true)}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center"
                                 style={{ background: 'linear-gradient(135deg, var(--zinc-300), var(--zinc-400))' }}>
                                <PlayIcon className="h-16 w-16" style={{ color: 'var(--zinc-600)' }} />
                            </div>
                        )}

                        {/* Play Button Overlay */}
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-all duration-300 flex items-center justify-center">
                            <div className="w-16 h-16 bg-white/95 rounded-full flex items-center justify-center group-hover:bg-white group-hover:scale-110 transition-all duration-300"
                                 style={{ boxShadow: 'var(--shadow-card)' }}>
                                <PlayIcon className="h-7 w-7 ml-1" style={{ color: 'var(--zinc-700)' }} />
                            </div>
                        </div>

                        {/* View Details Button */}
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="rounded-lg px-3 py-2 flex items-center space-x-2 text-sm font-['Milling'] backdrop-blur-[20px]"
                                 style={{ backgroundColor: 'rgba(255,255,255,0.9)', color: 'var(--zinc-700)' }}>
                                <EyeIcon className="h-4 w-4" />
                                <span>View Details</span>
                            </div>
                        </div>
                    </>
                ) : (
                    <video
                        ref={videoRef}
                        muted
                        autoPlay
                        loop
                        playsInline
                        disablePictureInPicture
                        controlsList="nodownload nofullscreen noremoteplayback"
                        className="w-full h-full object-cover"
                        poster={thumbnail_url}
                        style={{ pointerEvents: 'none' }}
                    />
                )}

                {/* Search Result Overlay - Only for search results */}
                {isSearchResult && searchScore && (
                    <div className="absolute inset-0 pointer-events-none transition-opacity duration-100 ease-in-out"
                         style={{ background: 'linear-gradient(rgba(29, 28, 27, 0.5) 0%, rgba(29, 28, 27, 0) 25%, rgba(29, 28, 27, 0) 70%, rgba(29, 28, 27, 0.7) 100%)' }}>
                        {/* Confidence Level Badge (HIGH/MEDIUM/LOW) - Top Left */}
                        <div className="absolute top-4 left-5">
                            <div className={`confidence-badge ${getConfidenceBadgeClass(searchScore)}`}>
                                <p className="text-xs uppercase font-semibold font-['Milling']">
                                    {getConfidenceLabel(searchScore)}
                                </p>
                            </div>
                        </div>

                        {/* Timestamp Badge - Top Right */}
                        {isClip && clipStart !== undefined && clipEnd !== undefined && (
                            <div className="absolute top-4 right-5">
                                <div className="tag-outline">
                                    <span className="text-xs font-mono whitespace-nowrap">
                                        {formatDuration(clipStart)} - {formatDuration(clipEnd)}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Progress Bar at Bottom - Shows matched segment */}
                        {isClip && clipStart !== undefined && clipEnd !== undefined && duration && (
                            <div className="absolute bottom-5 left-5 right-5 h-2 rounded-lg"
                                 style={{ backgroundColor: 'rgba(255,255,255,0.3)' }}>
                                <div
                                    className="absolute top-0 h-full rounded-sm"
                                    style={{
                                        left: `${(clipStart / duration) * 100}%`,
                                        width: `${((clipEnd - clipStart) / duration) * 100}%`,
                                        backgroundColor: searchScore >= 80
                                            ? 'var(--color-light-green)'
                                            : searchScore >= 60
                                            ? 'var(--color-orange)'
                                            : 'var(--zinc-400)'
                                    }}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Regular badges for non-search results */}
                {!isSearchResult && (
                    <>
                        {/* Duration Badge */}
                        {actualDuration && (
                            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                                <div className="p-1 rounded outline outline-1 outline-white/80 backdrop-blur-sm"
                                     style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                                    <span className="text-white text-xs font-semibold uppercase tracking-tight font-['Milling']">
                                        {isClip ? `${formatDuration(actualDuration)} clip` : formatDuration(actualDuration)}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Priority Indicator */}
                        <div className="absolute bottom-4 right-4">
                            <div className="w-3 h-3 rounded-full shadow-lg"
                                 style={getPriorityStyle(clipPriority)}></div>
                        </div>

                        {/* Search Score Badge */}
                        {searchScore && (
                            <div className="absolute top-4 left-4">
                                <div className="confidence-badge confidence-high">
                                    <span className="font-bold">{searchScore.toFixed(1)}</span>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>


            {/* Title Below Video */}
            <p className="text-sm truncate mt-3 text-center font-['Milling']"
               style={{ color: 'var(--zinc-900)' }}>
                {name || 'Untitled Video'}
            </p>
        </div>
    );
}
