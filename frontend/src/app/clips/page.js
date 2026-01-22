'use client';

import { useEffect, useState, useCallback } from 'react';
import ClipSort from '../components/ClipSort';
import UploadVideo from '../components/UploadVideo';
import ClipCard from '../components/ClipCard';
import SearchResultModal from '../components/SearchResultModal';
import { useUpload } from '../contexts/UploadContext';

export default function Clips() {

  const [isVisible, setIsVisible] = useState(false);
  const [clipData, setClipData] = useState([]);
  const [filteredClipData, setFilteredClipData] = useState([]);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const { onUploadComplete } = useUpload();

  // Modal state for search results
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClipIndex, setSelectedClipIndex] = useState(0);

  // Handle opening modal for search result
  const handleSearchResultClick = (clipIndex) => {
    setSelectedClipIndex(clipIndex);
    setIsModalOpen(true);
  };

  // Handle modal navigation
  const handleModalNavigate = (newIndex) => {
    if (newIndex >= 0 && newIndex < filteredClipData.length) {
      setSelectedClipIndex(newIndex);
    }
  };

  // Memoize loadClipData to avoid dependency issues
  const loadClipData = useCallback(async () => {

    console.log("Loading clip data from TwelveLabs");

    try {
        // Fetch Twelve Labs video data
        const response = await fetch('/api/video', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Failed to load clip data from TwelveLabs", {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            // Show user-friendly error message
            alert(`Failed to load videos: ${response.status} ${response.statusText}. Check console for details.`);
            return;
        }

        const data = await response.json();
        console.log("TwelveLabs video data:", data);

        // Convert TwelveLabs video data to clip format
        const clips = Object.values(data).map((video) => {
            return {
                id: video.id || video.pegasusId,
                pegasusId: video.pegasusId || video.id,
                filename: video.filename || video.systemMetadata?.filename || 'Unknown',
                createdAt: video.createdAt || video.created_at || new Date().toISOString(),
                duration: video.duration || video.metadata?.duration || 0,
                // Use video URL from TwelveLabs if available, otherwise use placeholder
                video_url: video.video_url || video.hls?.video_url || '',
                thumbnail_url: video.thumbnail_url || video.hls?.thumbnail_urls?.[0] || video.thumbnail_urls?.[0] || '',
                vss_id: video.vss_id || video.id,
                searchScore: video.searchScore,
                searchConfidence: video.searchConfidence,
                // Add hls object for compatibility with ClipCard
                hls: video.hls || {
                    video_url: video.video_url || '',
                    thumbnail_urls: video.thumbnail_urls || [video.thumbnail_url || '']
                }
            };
        });

        console.log("Converted clips:", clips);
        setClipData(clips);

        return clips;

    } catch (error) {
        console.error("Error loading clip data", error);
        // Try to load from VSS if available (fallback)
        const VSS_BASE_URL = process.env.NEXT_PUBLIC_VSS_BASE_URL;
        if (VSS_BASE_URL) {
            try {
                console.log("Attempting to load from VSS as fallback");
                const vss_response = await fetch(`${VSS_BASE_URL}/files?purpose=vision`);
                if (vss_response.ok) {
                    const vss_data = await vss_response.json();
                    const vss_file_data = vss_data['data'] || [];

                    const response = await fetch('/api/video');
                    if (response.ok) {
                        const data = await response.json();
                        for (let fileData of vss_file_data) {
                            const fileName = fileData['filename'];
                            if (fileName in data) {
                                data[fileName]['vss_id'] = fileData['id'];
                            }
                        }
                        setClipData(data);
                    }
                }
            } catch (vssError) {
                console.error("VSS fallback also failed", vssError);
            }
        }
        return;
    }
  }, []);

  useEffect(() => {
    loadClipData();
    // Trigger animations after component mounts
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, [loadClipData]);

  // Subscribe to upload completion to refresh the list
  useEffect(() => {
    const unsubscribe = onUploadComplete(() => {
      console.log('Upload completed, refreshing clip list...');
      loadClipData();
    });
    return unsubscribe;
  }, [onUploadComplete, loadClipData]);

  // Update filtered data when clipData changes
  useEffect(() => {
    setFilteredClipData(clipData);
  }, [clipData]);

  // Handle filter changes from ClipSort component
  const handleFilterChange = (filteredClips, isSearch = false) => {
    setFilteredClipData(filteredClips);
    setIsSearchActive(isSearch);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--zinc-100)' }}>
      <ClipSort clipData={clipData} onFilterChange={handleFilterChange} />

      {/* Header Section */}
      <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Video Grid */}
        <div className={`transition-all duration-1000 delay-800 ease-out ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

            {/* Upload Video Component - Hidden during search */}
            {!isSearchActive && <UploadVideo />}

            {/* Clip Cards */}
            {filteredClipData && (Array.isArray(filteredClipData) ? filteredClipData : Object.values(filteredClipData)).map((clip, index) => (
              <ClipCard
                key={clip.clipId || clip.id || clip.pegasusId || index}
                vss_id={clip.vss_id || clip.id}
                video_url={clip.hls?.video_url || clip.video_url || ''}
                thumbnail_url={clip.hls?.thumbnail_urls?.[0] || clip.thumbnail_url || ''}
                createdAt={clip.createdAt}
                duration={clip.duration}
                name={clip.filename || clip.name || 'Untitled'}
                searchScore={clip.searchScore}
                searchConfidence={clip.searchConfidence}
                clipStart={clip.clipStart}
                clipEnd={clip.clipEnd}
                isClip={clip.isClip}
                isSearchResult={isSearchActive}
                onSearchResultClick={() => handleSearchResultClick(index)}
              />
            ))}

          </div>
        </div>
      </div>

      {/* Search Result Modal */}
      <SearchResultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        clip={filteredClipData[selectedClipIndex]}
        allClips={filteredClipData}
        currentIndex={selectedClipIndex}
        onNavigate={handleModalNavigate}
      />
    </div>
  );
}