import { MenuBar } from '@/components/MenuBar';
import { ResponsiveContainer } from '@/components/ui/ResponsiveContainer';
import { useCheckIfRequiredFieldsArePopulated } from '@/hooks/useCheckIfRequiredFieldsArePopulated';
import React from 'react';

export default async function Layout({ children }: { children: React.ReactNode }) {
  // This runs only once on the initial load of this layout
  // e.g. when the user signs in/up or on hard reload
  await useCheckIfRequiredFieldsArePopulated();

  return (
    <div className="min-h-screen md:flex md:justify-center">
      <MenuBar />

      <ResponsiveContainer className="px-4 pb-24 pt-4 md:px-6 md:pb-8 md:pt-6">{children}</ResponsiveContainer>
    </div>
  );
}
