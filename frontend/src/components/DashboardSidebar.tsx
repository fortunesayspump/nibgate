"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { name: 'Profile', path: '/dashboard/profile', id: 'profile' },
  { name: 'Sites', path: '/dashboard/sites', id: 'sites' },
  { name: 'Contents', path: '/dashboard/contents', id: 'contents' },
  { name: 'Analytics', path: '/dashboard/analytics', id: 'analytics' },
  { name: 'Earnings', path: '/dashboard/earnings', id: 'earnings' }
];

export default function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col dashboard-sidebar lg:w-48" style={{ background: 'var(--nib-page-bg)' }}>
      {navLinks.map((link, index) => {
        const isActive = pathname === link.path || pathname.startsWith(link.path + '/');
        return (
          <Link
            key={link.id}
            title={link.name}
            href={link.path}
            className={`dashboard-box box-${index} flex-1 no-underline w-full h-full ${isActive ? 'active' : ''}`}
            data-tab={link.id}
          >
            <span>{link.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
