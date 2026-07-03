import { ArrowChevronBack } from '@/svg_components';
import Link from 'next/link';
import { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center px-4">
      <div className="absolute left-3 top-4 sm:left-6 sm:top-6">
        <Link href="/" className="group flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-950 sm:gap-3">
          <ArrowChevronBack className="h-5 w-5 stroke-current" />
          <span>Back to Home</span>
        </Link>
      </div>
      <div className="w-full max-w-[420px] rounded-md border border-border bg-white p-6 shadow-sm md:p-8">{children}</div>
    </div>
  );
}
