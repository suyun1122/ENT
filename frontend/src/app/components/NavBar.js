"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import {
  BellIcon,
  HomeIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";

export default function NavBar() {
  const [showNotifications, setShowNotifications] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
  };

  const handleDashboardClick = (e) => {
    e.preventDefault();
    // If already on /clips page, refresh to reset search state
    if (pathname === '/clips') {
      window.location.href = '/clips';
    } else {
      router.push('/clips');
    }
  };

  return (
    <nav className="border-b shadow-soft sticky top-0 z-50" style={{ backgroundColor: "var(--zinc-100)", borderColor: "var(--zinc-300)" }}>
      <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-24">
          {/* Left side - Logos and Title */}
          <div className="flex items-center space-x-8">
            {/* NVIDIA Logo */}
            <div className="relative h-30 w-30 flex-shrink-0">
              <Image
                src="/nvidia.jpg"
                alt="NVIDIA Logo"
                fill
                className="object-contain filter brightness-110"
              />
            </div>

            {/* Twelve Labs Logo */}
            <div className="relative h-30 w-30 flex-shrink-0">
              <Image
                src="/twelvelabs.png"
                alt="Twelve Labs Logo"
                fill
                className="object-contain filter brightness-110"
              />
            </div>

            {/* Title */}
            <div className="hidden lg:block">
              <h1 className="text-xl font-normal font-['Milling'] whitespace-nowrap tracking-tight leading-tight" style={{ color: "var(--zinc-900)" }}>
                NVIDIA VSS Twelve Labs Integration
                <span className="block text-base font-normal mt-1" style={{ color: "var(--zinc-700)" }}>
                  Manufacturing Automation
                </span>
              </h1>
            </div>

            {/* Medium screens title */}
            <div className="hidden sm:block lg:hidden">
              <h1 className="text-lg font-normal font-['Milling'] whitespace-nowrap tracking-tight" style={{ color: "var(--zinc-900)" }}>
                NVIDIA + Twelve Labs
              </h1>
            </div>

            {/* Mobile Title */}
            <div className="sm:hidden">
              <h1 className="text-base font-normal font-['Milling'] tracking-tight" style={{ color: "var(--zinc-900)" }}>
                NVIDIA + TL
              </h1>
            </div>

            {/* Sample App Badge */}
            <span className="sample-badge hidden md:inline-block">
              SAMPLE APP
            </span>
          </div>

          {/* Right side - Navigation */}
          <div className="flex items-center space-x-6">
            {/* Dashboard Button - Now points to /clips */}
            <Link
              href="/clips"
              onClick={handleDashboardClick}
              className="flex flex-row items-center space-x-3 px-5 py-3 rounded-xl text-base font-normal font-['Milling'] transition-all duration-200 ease-in-out group"
              style={{ color: "var(--zinc-700)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-gray-200)";
                e.currentTarget.style.color = "var(--zinc-900)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--zinc-700)";
              }}
            >
              <HomeIcon className="h-5 w-5 flex-shrink-0" />
              <span className="hidden md:block whitespace-nowrap">
                Dashboard
              </span>
            </Link>

            {/* Notifications Button */}
            <div className="relative">
              <button
                onClick={toggleNotifications}
                className="cursor-pointer flex flex-row items-center px-5 py-3 rounded-xl text-base font-normal font-['Milling'] transition-all duration-200 ease-in-out group relative"
                style={{ color: "var(--zinc-700)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-gray-200)";
                  e.currentTarget.style.color = "var(--zinc-900)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--zinc-700)";
                }}
                aria-label="Notifications"
              >
                <BellIcon className="h-5 w-5 flex-shrink-0" />

                {/* Notification badge */}
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full animate-pulse" style={{ backgroundColor: "var(--color-red)" }}></span>
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-card border py-2 z-50 animate-in slide-in-from-top-2 duration-200"
                     style={{ borderColor: "var(--zinc-200)" }}>
                  <div className="px-4 py-2 border-b" style={{ borderColor: "var(--zinc-200)" }}>
                    <h3 className="text-sm font-semibold font-['Milling']" style={{ color: "var(--zinc-900)" }}>
                      Notifications
                    </h3>
                  </div>

                  <div className="max-h-64 overflow-y-auto scrollbar-thin">
                    {/* Sample notifications */}
                    <div className="px-4 py-3 hover:bg-gray-50 border-b transition-colors" style={{ borderColor: "var(--zinc-100)" }}>
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          <div className="h-2 w-2 rounded-full mt-2" style={{ backgroundColor: "var(--color-blue)" }}></div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm" style={{ color: "var(--zinc-900)" }}>
                            Motion detected in Assembly Line 3
                          </p>
                          <p className="text-xs mt-1" style={{ color: "var(--zinc-600)" }}>
                            2 minutes ago
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="px-4 py-3 hover:bg-gray-50 border-b transition-colors" style={{ borderColor: "var(--zinc-100)" }}>
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          <div className="h-2 w-2 rounded-full mt-2" style={{ backgroundColor: "var(--color-orange)" }}></div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm" style={{ color: "var(--zinc-900)" }}>
                            Quality control alert: Anomaly detected
                          </p>
                          <p className="text-xs mt-1" style={{ color: "var(--zinc-600)" }}>
                            5 minutes ago
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          <div className="h-2 w-2 rounded-full mt-2" style={{ backgroundColor: "var(--color-green)" }}></div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm" style={{ color: "var(--zinc-900)" }}>
                            Production line operating normally
                          </p>
                          <p className="text-xs mt-1" style={{ color: "var(--zinc-600)" }}>
                            15 minutes ago
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 py-2 border-t" style={{ borderColor: "var(--zinc-200)" }}>
                    <button className="text-sm font-medium font-['Milling'] transition-colors hover:opacity-80" style={{ color: "var(--color-confidence-high)" }}>
                      View all notifications
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Click outside to close notifications */}
      {showNotifications && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowNotifications(false)}
        ></div>
      )}
    </nav>
  );
}
