'use client';

import React from 'react';
import { useState, useEffect } from 'react';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

export default function ClipSort({ clipData = [], onFilterChange }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showExamples, setShowExamples] = useState(false);
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

  const handleExampleClick = async (example) => {
    setSearchQuery(example);
    setShowExamples(false);
    // Perform search immediately with the example query
    const filteredClips = await filterAndSortClips(clipData, example);
    setHasSearchResults(true);
    if (onFilterChange) {
      onFilterChange(filteredClips, true);
    }
  };

  // Search function - integrates with Twelve Labs API
  const performSemanticSearch = async (query, clips) => {
    if (!query.trim()) {
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

      const clipsArray = Array.isArray(clips) ? clips : Object.values(clips);

      // Map each search result (clip) to a new clip entry with time range
      const sortedClips = sortedData.map((result, index) => {
        const video = clipsArray.find(c =>
          c.id === result.videoId ||
          c.vss_id === result.videoId ||
          c.systemMetadata?.vss_id === result.videoId
        );
        if (video) {
          return {
            ...video,
            id: `${video.id}_clip_${index}`,
            clipId: `${video.id}_clip_${index}`,
            originalVideoId: video.id,
            start: result.start,
            end: result.end,
            clipStart: result.start,
            clipEnd: result.end,
            searchScore: result.score,
            searchConfidence: result.confidence,
            filename: `${video.filename} (${Math.floor(result.start)}s - ${Math.floor(result.end)}s)`,
            isClip: true
          };
        }
        return null;
      }).filter(Boolean);

      return sortedClips;

    } catch (error) {
      console.error('Search error:', error);
      return Array.isArray(clips) ? clips : Object.values(clips);
    } finally {
      setIsSearching(false);
    }
  };

  // Filter and sort clips based on current state
  const filterAndSortClips = async (clips, query = null) => {
    const clipsArray = Array.isArray(clips) ? clips : Object.values(clips);
    let filteredClips = [...clipsArray];

    const effectiveQuery = query !== null ? query : searchQuery;

    if (effectiveQuery.trim()) {
      filteredClips = await performSemanticSearch(effectiveQuery, clipsArray);
    }

    // Sort by date when not searching, by score when searching
    filteredClips.sort((a, b) => {
      if (effectiveQuery.trim()) {
        return (b.searchScore || 0) - (a.searchScore || 0);
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return filteredClips;
  };

  // Effect to handle filtering when clipData changes
  useEffect(() => {
    const applyFilters = async () => {
      const filteredClips = await filterAndSortClips(clipData);
      const hasSearch = searchQuery.trim() !== '';
      if (onFilterChange) {
        onFilterChange(filteredClips, hasSearch);
      }
    };

    applyFilters();
  }, [clipData]);

  // Handle search button click
  const handleSearch = async () => {
    const filteredClips = await filterAndSortClips(clipData);
    const hasSearch = searchQuery.trim() !== '';
    if (hasSearch) {
      setHasSearchResults(true);
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
    if (onFilterChange) {
      const filteredClips = await filterAndSortClips(clipData, '');
      onFilterChange(filteredClips, false);
    }
  };

  return (
    <div className="py-6" style={{ backgroundColor: 'var(--zinc-100)' }}>
      <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Search Input - CreatorDiscovery Style */}
        <div className="relative">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="w-full"
          >
            {/* Gradient Border Container */}
            <div
              className="h-16 py-[2px] px-[2px] rounded-2xl inline-flex justify-start items-center w-full shadow-card transition-all duration-500"
              style={{
                background: !searchQuery
                  ? 'var(--gradient-search)'
                  : 'var(--gradient-brand)'
              }}
            >
              {/* Inner White Container */}
              <div className="flex-1 self-stretch pr-2 pl-5 flex justify-start items-center gap-3 bg-white rounded-[14px]">
                {/* Input Field */}
                <div className="flex-1 flex items-center relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setShowExamples(true)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-transparent border-none focus:outline-none text-base font-normal font-['Milling'] leading-7 tracking-tight pr-8"
                    style={{ color: 'var(--zinc-900)' }}
                    placeholder="What are you looking for?"
                  />

                  {/* Clear Button */}
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="absolute right-14 flex items-center justify-center w-8 h-8 cursor-pointer transition-opacity hover:opacity-70"
                    >
                      <XMarkIcon className="w-5 h-5" style={{ color: 'var(--zinc-600)' }} />
                    </button>
                  )}

                  {/* Search Button */}
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="w-11 h-11 rounded-2xl inline-flex justify-center items-center transition-all duration-500"
                    style={{
                      background: !searchQuery
                        ? 'var(--zinc-400)'
                        : 'var(--gradient-button)',
                      cursor: isSearching ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isSearching ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <MagnifyingGlassIcon className="w-5 h-5 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* Example Queries Dropdown */}
          {showExamples && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setShowExamples(false)}
              ></div>
              <div
                className="absolute top-full left-0 right-0 mt-2 rounded-[20px] shadow-card border z-40 overflow-hidden"
                style={{ backgroundColor: 'white', borderColor: 'var(--zinc-200)' }}
              >
                <div className="p-4 border-b" style={{ borderColor: 'var(--zinc-200)' }}>
                  <h3 className="text-sm font-bold font-['Milling'] mb-1" style={{ color: 'var(--zinc-900)' }}>
                    Example Searches
                  </h3>
                  <p className="text-xs font-['Milling']" style={{ color: 'var(--zinc-600)' }}>
                    Click any example to try it out
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto scrollbar-thin p-2">
                  {exampleQueries.map((example, index) => (
                    <button
                      key={index}
                      onClick={() => handleExampleClick(example)}
                      className="cursor-pointer w-full text-left px-4 py-3 text-base rounded-lg transition-colors duration-150 font-['Milling']"
                      style={{ color: 'var(--zinc-700)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--zinc-100)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
