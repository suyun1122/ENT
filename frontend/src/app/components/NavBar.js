"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();

  const handleHomeClick = (e) => {
    e.preventDefault();
    if (pathname === '/clips') {
      window.location.href = '/clips';
    } else {
      router.push('/clips');
    }
  };

  return (
    <nav style={{ backgroundColor: "var(--zinc-100)" }}>
      <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Left side - Title and Badge */}
          <div className="flex items-center space-x-4">
            {/* Title - Clickable Home */}
            <Link
              href="/clips"
              onClick={handleHomeClick}
              className="text-xl font-normal font-['Milling'] whitespace-nowrap tracking-tight transition-opacity hover:opacity-70"
              style={{ color: "var(--zinc-900)" }}
            >
              Surgical Video Intelligence
            </Link>

            {/* Sample App Badge */}
            <span className="sample-badge hidden sm:inline-block">
              SAMPLE APP
            </span>
          </div>

          {/* Right side - Twelve Labs Logo */}
          <div className="relative h-30 w-30 flex-shrink-0">
            <Image
              src="/twelvelabs.png"
              alt="Twelve Labs Logo"
              fill
              className="object-contain"
            />
          </div>
        </div>
      </div>
    </nav>
  );
}
