"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CircleDollarSign, FileLock2, Globe2, UserRound } from "lucide-react";

const navLinks = [
  { name: 'Profile', description: 'Creator setup', path: '/dashboard/profile', id: 'profile', Icon: UserRound },
  { name: 'Sites', description: 'Connected origins', path: '/dashboard/sites', id: 'sites', Icon: Globe2 },
  { name: 'Contents', description: 'Protected routes', path: '/dashboard/contents', id: 'contents', Icon: FileLock2 },
  { name: 'Analytics', description: 'Views and unlocks', path: '/dashboard/analytics', id: 'analytics', Icon: BarChart3 },
  { name: 'Earnings', description: 'Revenue flow', path: '/dashboard/earnings', id: 'earnings', Icon: CircleDollarSign }
];

export default function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col dashboard-sidebar" style={{ background: 'var(--nib-page-bg)' }}>
      {navLinks.map((link, index) => {
        const isActive = pathname === link.path || pathname.startsWith(link.path + '/');
        const Icon = link.Icon;
        return (
          <Link
            key={link.id}
            title={link.name}
            href={link.path}
            className={`dashboard-box box-${index} flex-1 no-underline w-full h-full ${isActive ? 'active' : ''}`}
            data-tab={link.id}
          >
            <Icon className="dashboard-box-icon" aria-hidden="true" strokeWidth={1.8} />
            <span className="dashboard-box-label">{link.name}</span>
            <span className="dashboard-box-description">{link.description}</span>
          </Link>
        );
      })}
    </nav>
  );
}
