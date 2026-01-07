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

    const getCategoryColor = (category) => {
        switch(category) {
            case 'safety': return 'bg-red-100 text-red-800';
            case 'defect': return 'bg-yellow-100 text-yellow-800';
            case 'general': return 'bg-blue-100 text-blue-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getPriorityColor = (priority) => {
        switch(priority) {
            case 'high': return 'bg-red-500';
            case 'medium': return 'bg-yellow-500';
            case 'low': return 'bg-green-500';
            default: return 'bg-gray-500';
        }
    };

    const handleClick = () => {
        console.log('View clip details for:', vss_id || name);
        router.push(`/clips/${name}`); // Navigate to clip detail page
    };

    return (
        <div
            className="group cursor-pointer"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={handleClick}
        >
            {/* Video/Thumbnail Container */}
            <div className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
                {!hovered ? (
                    <>
                        {!imageError && thumbnail_url ? (
                            <Image 
                                src={thumbnail_url} 
                                alt={name || 'Video thumbnail'} 
                                fill
                                className="object-cover group-hover:scale-110 transition-transform duration-500"
                                onError={() => setImageError(true)}
                            />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center">
                                <PlayIcon className="h-16 w-16 text-gray-600" />
                            </div>
                        )}
                        
                        {/* Play Button Overlay */}
                        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
                            <div className="w-20 h-20 bg-white/95 rounded-full flex items-center justify-center group-hover:bg-white group-hover:scale-125 transition-all duration-300 shadow-lg">
                                <PlayIcon className="h-8 w-8 text-gray-700 ml-1" />
                            </div>
                        </div>

                        {/* View Details Button */}
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="bg-white/90 hover:bg-white rounded-lg px-3 py-2 flex items-center space-x-2 text-sm font-medium text-gray-700 shadow-md">
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
                        <div className="absolute top-3 left-5">
                            <div className={`flex items-center px-2 py-1 rounded border ${
                                searchScore >= 80
                                    ? 'bg-lime-900/70 border-lime-400 text-lime-400'
                                    : searchScore >= 60
                                    ? 'bg-yellow-900/70 border-yellow-400 text-yellow-400'
                                    : 'bg-gray-900/70 border-gray-400 text-gray-400'
                            }`}>
                                <p className="text-xs uppercase font-semibold">
                                    {searchScore >= 80 ? 'HIGH' : searchScore >= 60 ? 'MEDIUM' : 'LOW'}
                                </p>
                            </div>
                        </div>

                        {/* Timestamp Badge - Top Right */}
                        {isClip && clipStart !== undefined && clipEnd !== undefined && (
                            <div className="absolute top-3 right-5">
                                <div className="px-2 py-1 rounded-md border border-white backdrop-blur-[20px] bg-black/30">
                                    <div className="text-xs text-white font-mono whitespace-nowrap">
                                        {formatDuration(clipStart)} - {formatDuration(clipEnd)}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Progress Bar at Bottom - Shows matched segment */}
                        {isClip && clipStart !== undefined && clipEnd !== undefined && duration && (
                            <div className="absolute bottom-5 left-5 right-5 h-2 bg-gray-200/40 rounded-lg">
                                <div
                                    className={`absolute top-0 h-full rounded-xs ${
                                        searchScore >= 80
                                            ? 'bg-lime-500'
                                            : searchScore >= 60
                                            ? 'bg-yellow-500'
                                            : 'bg-gray-500'
                                    }`}
                                    style={{
                                        left: `${(clipStart / duration) * 100}%`,
                                        width: `${((clipEnd - clipStart) / duration) * 100}%`
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
                            <div className="absolute bottom-3 left-3 bg-black/80 text-white px-3 py-1 rounded-lg text-sm font-medium backdrop-blur-sm">
                                {isClip ? `${formatDuration(actualDuration)} clip` : formatDuration(actualDuration)}
                            </div>
                        )}

                        {/* Priority Indicator */}
                        <div className="absolute bottom-3 right-3">
                            <div className={`w-3 h-3 rounded-full ${getPriorityColor(clipPriority)} shadow-lg`}></div>
                        </div>

                        {/* Search Score Badge */}
                        {searchScore && (
                            <div className="absolute top-3 left-3 bg-lime-500 text-white px-3 py-1 rounded-lg text-sm font-bold shadow-lg backdrop-blur-sm">
                                {searchScore.toFixed(1)}
                            </div>
                        )}
                    </>
                )}
            </div>


            {/* Title Below Video */}
            <p className="text-base text-gray-900 truncate mt-2 font-inter">
                {name || 'Untitled Video'}
            </p>
        </div>
    );
}
