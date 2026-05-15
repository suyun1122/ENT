"use client";

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
          <div className="flex items-center space-x-4">
            <Link
              href="/clips"
              onClick={handleHomeClick}
              className="text-xl font-normal font-['Milling'] whitespace-nowrap tracking-tight transition-opacity hover:opacity-70"
              style={{ color: "var(--zinc-900)" }}
            >
              Surgical Video Intelligence
            </Link>

            <span className="sample-badge hidden sm:inline-block">
              LOCAL YOLO
            </span>
          </div>

          <div className="hidden text-right text-xs uppercase tracking-wide text-gray-500 sm:block">
            Surgical Instrument Detection
          </div>
        </div>
      </div>
    </nav>
  );
}
