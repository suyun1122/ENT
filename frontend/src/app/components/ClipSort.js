'use client';

import React from 'react';
import { useState, useEffect } from 'react';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  CalendarDaysIcon,
  ClockIcon,
  ChevronDownIcon,
  SparklesIcon,
  XMarkIcon,
  StarIcon
} from '@heroicons/react/24/outline';

export default function ClipSort({ clipData = [], onFilterChange }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showExamples, setShowExamples] = useState(false);
  const [sortBy, setSortBy] = useState('date');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearchResults, setHasSearchResults] = useState(false);

  const exampleQueries = [
    "Using scissors to cut tissue",
    "Grasper holding organ",
    "Bleeding or hemorrhage during procedure",
    "Clipper applying surgical clips",
    "Cauterization with bipolar forceps",
    "Suturing or stitching tissue",
    "Removing gallbladder or organs"
  ];

  // Sort options - include Score only when search results are shown
  const sortOptions = hasSearchResults
    ? [
        { value: 'score', label: 'Score', icon: StarIcon },
        { value: 'date', label: 'Date', icon: CalendarDaysIcon },
        { value: 'duration', label: 'Duration', icon: ClockIcon }
      ]
    : [
        { value: 'date', label: 'Date', icon: CalendarDaysIcon },
        { value: 'duration', label: 'Duration', icon: ClockIcon }
      ];

  const handleExampleClick = (example) => {
    setSearchQuery(example);
    setShowExamples(false);
    // Don't trigger search automatically - user needs to click Search button
  };

  // Search function - integrates with Twelve Labs API
  const performSemanticSearch = async (query, clips) => {
    if (!query.trim()) {
      // Convert clips to array if it's an object
      return Array.isArray(clips) ? clips : Object.values(clips);
    }

    setIsSearching(true);
    try {

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query, groupBy: 'clip', threshold: 'none' })
      })

      const data = await response.json();
      const json_data = data['data'];

      console.log("Search response:", data);

      // Sort data by score (highest first)
      const sortedData = json_data.sort((a, b) => b.score - a.score);

      console.log("Sorted data:", sortedData);

      // Convert clips to array if it's an object
      const clipsArray = Array.isArray(clips) ? clips : Object.values(clips);

      console.log("Clips array:", clipsArray);

      // Debug: Log the IDs we're trying to match
      console.log("Search result videoIds:", sortedData.map(r => r.videoId));
      console.log("Clip IDs:", clipsArray.map(c => ({ id: c.id, vss_id: c.vss_id, systemMetadata_vss_id: c.systemMetadata?.vss_id })));

      // First, deduplicate results by videoId, keeping the highest scoring one
      const deduplicatedResults = sortedData.reduce((acc, result) => {
        const existing = acc.find(r => r.videoId === result.videoId);
        if (!existing || result.score > existing.score) {
          // Remove existing if it has lower score, or add new result
          const filtered = acc.filter(r => r.videoId !== result.videoId);
          return [...filtered, result];
        }
        return acc;
      }, []);

      console.log("Deduplicated results:", deduplicatedResults);

      // Map each search result (clip) to a new clip entry with time range
      const sortedClips = sortedData.map((result, index) => {
        // Find the corresponding video from clipsArray by trying multiple ID fields
        const video = clipsArray.find(c =>
          c.id === result.videoId ||
          c.vss_id === result.videoId ||
          c.systemMetadata?.vss_id === result.videoId
        );
        if (video) {
          console.log(`Found matching video for clip - videoId ${result.videoId}:`, video.id);
          // Create a new clip entry with the specific time range from the search result
          return {
            ...video,
            // Create unique ID for this clip by combining video ID and clip index
            id: `${video.id}_clip_${index}`,
            clipId: `${video.id}_clip_${index}`,
            originalVideoId: video.id,
            // Add clip-specific properties
            start: result.start,
            end: result.end,
            clipStart: result.start,
            clipEnd: result.end,
            searchScore: result.score,
            searchConfidence: result.confidence,
            // Update filename to show it's a clip
            filename: `${video.filename} (${Math.floor(result.start)}s - ${Math.floor(result.end)}s)`,
            isClip: true
          };
        } else {
          console.log(`No matching video found for clip - videoId: ${result.videoId}`);
        }
        return null;
      }).filter(Boolean); // Remove any undefined results

      return sortedClips;

    } catch (error) {
      console.error('Search error:', error);
      // Convert clips to array if it's an object
      return Array.isArray(clips) ? clips : Object.values(clips);
    } finally {
      setIsSearching(false);
    }
  };

  // Filter and sort clips based on current state
  const filterAndSortClips = async (clips) => {
    // Convert object to array if needed
    const clipsArray = Array.isArray(clips) ? clips : Object.values(clips);
    let filteredClips = [...clipsArray];

    // Apply search filter
    if (searchQuery.trim()) {
      filteredClips = await performSemanticSearch(searchQuery, clipsArray);
    }

    // Apply sorting
    filteredClips.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'duration':
          // For clips with time ranges, use clip duration; otherwise use full duration
          const aDuration = (a.isClip && a.clipEnd !== undefined && a.clipStart !== undefined)
            ? (a.clipEnd - a.clipStart)
            : (a.duration || 0);
          const bDuration = (b.isClip && b.clipEnd !== undefined && b.clipStart !== undefined)
            ? (b.clipEnd - b.clipStart)
            : (b.duration || 0);
          return bDuration - aDuration;
        case 'score':
          return (b.searchScore || 0) - (a.searchScore || 0);
        default:
          return 0;
      }
    });

    return filteredClips;
  };

  // Effect to handle filtering when filters change (but not search query)
  useEffect(() => {
    const applyFilters = async () => {
      const filteredClips = await filterAndSortClips(clipData);
      const hasSearch = searchQuery.trim() !== '';
      if (onFilterChange) {
        onFilterChange(filteredClips, hasSearch);
      }
    };

    applyFilters();
  }, [sortBy, clipData]);

  // Handle search button click
  const handleSearch = async () => {
    const filteredClips = await filterAndSortClips(clipData);
    const hasSearch = searchQuery.trim() !== '';
    if (hasSearch) {
      setHasSearchResults(true);
      setSortBy('score'); // Default to score when search results are shown
    }
    if (onFilterChange) {
      onFilterChange(filteredClips, hasSearch);
    }
  };

  // Handle Enter key in search input
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Clear search and reset to original data
  const handleClearSearch = async () => {
    setSearchQuery('');
    setShowExamples(false);
    setHasSearchResults(false);
    setSortBy('date'); // Reset to date sorting when clearing search
    // Reset to original clip data without search
    if (onFilterChange) {
      const filteredClips = await filterAndSortClips(clipData);
      onFilterChange(filteredClips, false); // false = not a search
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 shadow-sm sticky top-24 z-40">
      <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Semantic Search - Main Feature */}
          <div className="flex-1">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 font-inter mb-3">
                <SparklesIcon className="inline h-4 w-4 mr-2 text-lime-500" />
                AI-Powered Semantic Search
              </label>

              {/* Search Input */}
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowExamples(true)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search surgical videos by procedure, tools, or techniques..."
                  className="w-full pl-12 pr-4 py-4 text-lg border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-lime-500 focus:border-lime-500 transition-all duration-200 font-inter placeholder-gray-500"
                />

                {/* Clear Button - Only show when there's text */}
                {searchQuery && (
                  <button
                    onClick={handleClearSearch}
                    className="cursor-pointer absolute right-32 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors duration-200 p-2 rounded-full hover:bg-gray-100"
                    aria-label="Clear search"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                )}

                {/* Search Button */}
                <button
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="cursor-pointer absolute right-2 top-1/2 transform -translate-y-1/2 bg-lime-500 hover:bg-lime-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-all duration-200 font-medium font-inter"
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </div>

              {/* Example Queries Dropdown */}
              {showExamples && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowExamples(false)}
                  ></div>
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 z-40 animate-in slide-in-from-top-2 duration-200">
                    <div className="p-4 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900 font-inter mb-2">Example Searches</h3>
                      <p className="text-xs text-gray-600">Click any example to try it out</p>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-2">
                      {exampleQueries.map((example, index) => (
                        <button
                          key={index}
                          onClick={() => handleExampleClick(example)}
                          className="cursor-pointer w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors duration-150 font-inter"
                        >
                          <SparklesIcon className="inline h-3 w-3 mr-2 text-lime-500" />
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sorting Controls */}
          <div className="flex flex-wrap gap-4 lg:flex-nowrap">

            {/* Sort By Dropdown */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 font-inter mb-3">
                <FunnelIcon className="inline h-4 w-4 mr-2" />
                Sort By
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowSortDropdown(!showSortDropdown)}
                  className="flex items-center space-x-2 px-4 py-3 bg-white border border-gray-300 rounded-xl text-sm font-medium font-inter text-gray-700 hover:bg-gray-50 transition-all duration-200 min-w-40"
                >
                  {React.createElement(sortOptions.find(opt => opt.value === sortBy)?.icon || CalendarDaysIcon, { className: "h-4 w-4" })}
                  <span>{sortOptions.find(opt => opt.value === sortBy)?.label}</span>
                  <ChevronDownIcon className="h-4 w-4 ml-auto" />
                </button>

                {showSortDropdown && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowSortDropdown(false)}></div>
                    <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 z-40 min-w-40 animate-in slide-in-from-top-2 duration-200">
                      {sortOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setSortBy(option.value);
                            setShowSortDropdown(false);
                          }}
                          className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl transition-colors duration-150 font-inter"
                        >
                          <option.icon className="h-4 w-4" />
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>


      </div>
    </div>
  );
}
