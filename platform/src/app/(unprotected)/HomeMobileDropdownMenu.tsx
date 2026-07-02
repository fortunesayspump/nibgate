'use client';

import { DropdownMenuButton } from '@/components/ui/DropdownMenuButton';
import { HamburgerMenu } from '@/svg_components';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Key, useCallback, useMemo } from 'react';
import { Item, Section } from 'react-stately';

export function HomeMobileDropdownMenu() {
  const router = useRouter();
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user;

  const onAction = useCallback((key: Key) => router.push(key as string), [router]);

  const menuItems = useMemo(() => {
    const items = [
      { key: '/feed', label: 'Feed' },
      { key: '/discover', label: 'Creators' },
      { key: '/terms', label: 'Terms' },
    ];

    if (!isLoggedIn) {
      items.push({ key: '/login', label: 'Login' });
      items.push({ key: '/register', label: 'Create profile' });
    }

    return items;
  }, [isLoggedIn]);

  return (
    <DropdownMenuButton key="home-dropdown-menu" label="Home dropdown menu" onAction={onAction} Icon={HamburgerMenu}>
      <Section>
        {menuItems.map((item) => (
          <Item key={item.key}>{item.label}</Item>
        ))}
      </Section>
    </DropdownMenuButton>
  );
}
