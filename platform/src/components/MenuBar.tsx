'use client';

import { Feather, GridFeedCards, LogOutCircle, NotificationBell, Profile, Search } from '@/svg_components';
import { useSessionUserData } from '@/hooks/useSessionUserData';
import { useNotificationsCountQuery } from '@/hooks/queries/useNotificationsCountQuery';
import Link from 'next/link';
import { LogoText } from './LogoText';
import { MenuBarItem } from './MenuBarItem';

export function MenuBar() {
  const [user] = useSessionUserData();
  const username = user?.username || 'user-not-found';
  const { data: notificationCount } = useNotificationsCountQuery();

  return (
    <div className="fixed bottom-0 z-[2] flex w-full border-t border-border bg-white/95 shadow-sm backdrop-blur-sm md:sticky md:top-0 md:h-screen md:w-[236px] md:flex-col md:items-start md:border-r md:border-t-0 md:bg-white md:p-5 md:shadow-none md:backdrop-blur-none">
      <Link href="/" title="Home" className="mb-6 hidden items-center gap-2 md:flex">
        <Feather className="h-9 w-9 stroke-emerald-700" />

        <LogoText className="text-2xl" />
      </Link>
      {[
        {
          title: 'Feed',
          Icon: GridFeedCards,
          route: '/feed',
        },
        {
          title: 'Discover',
          Icon: Search,
          route: '/discover',
        },
        {
          title: 'Notifications',
          Icon: NotificationBell,
          route: '/notifications',
          badge: notificationCount,
        },
        { title: 'My Profile', Icon: Profile, route: `/${username}` },
        {
          title: 'Logout',
          Icon: LogOutCircle,
          route: '/api/auth/signout',
        },
      ].map((item) => (
        <MenuBarItem key={item.title} {...item}>
          {item.title}
        </MenuBarItem>
      ))}
    </div>
  );
}
