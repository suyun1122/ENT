'use client';

import { useEffect, useState } from 'react';
import ClipSort from '../components/ClipSort';
import UploadVideo from '../components/UploadVideo';
import {
  CpuChipIcon,
} from '@heroicons/react/24/outline';
import ClipCard from '../components/ClipCard';

export default function Clips() {

  const [isVisible, setIsVisible] = useState(false);
  const [clipData, setClipData] = useState([]);
  const [filteredClipData, setFilteredClipData] = useState([]);

  useEffect(() => {
    loadClipData();
    // Trigger animations after component mounts
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Update filtered data when clipData changes
  useEffect(() => {
    setFilteredClipData(clipData);
  }, [clipData]);

  // Handle filter changes from ClipSort component
  const handleFilterChange = (filteredClips) => {
    setFilteredClipData(filteredClips);
  };

  const sampleIds = [('13380578_3840_2160_25fps.mp4', '2ec57a48-d330-4404-a26a-0587348fa865')]

  const loadClipData = async () => {

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
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ClipSort clipData={clipData} onFilterChange={handleFilterChange} />

      {/* Header Section */}
      <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className={`transition-all duration-1000 ease-out ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>

          {/* Description */}
          <div className={`transition-all duration-1000 delay-200 ease-out ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                <h1 className="text-4xl font-bold text-gray-900 font-inter tracking-tight mb-4">
                    Clip Storage
                </h1>
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <CpuChipIcon className="h-6 w-6 text-lime-600 mt-1" />
                </div>
                <div>
                  <p className="text-lg text-gray-700 font-inter leading-relaxed">
                    Video clips are automatically saved from your connected cameras from CV Pipeline and analyzed by
                    <span className="font-semibold text-lime-600"> Twelve Labs Pegasus</span>.
                    Clips are automatically indexed and can be searched semantically with Twelve Labs Marengo model above!
                  </p>


                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Video Grid */}
        <div className={`transition-all duration-1000 delay-800 ease-out ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

            {/* Upload Video Component */}
            <UploadVideo />

            {/* Clip Cards */}
            {filteredClipData && (Array.isArray(filteredClipData) ? filteredClipData : Object.values(filteredClipData)).map((clip, index) => (
              <ClipCard
                key={clip.id || clip.pegasusId || index}
                vss_id={clip.vss_id || clip.id}
                video_url={clip.hls?.video_url || clip.video_url || ''}
                thumbnail_url={clip.hls?.thumbnail_urls?.[0] || clip.thumbnail_url || ''}
                createdAt={clip.createdAt}
                duration={clip.duration}
                name={clip.filename || clip.name || 'Untitled'}
                searchScore={clip.searchScore}
                searchConfidence={clip.searchConfidence}
              />
            ))}

          </div>
        </div>
      </div>
    </div>
  );
}