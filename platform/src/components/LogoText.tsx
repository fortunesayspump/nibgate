import { cn } from '@/lib/cn';
import React from 'react';

interface LogoTextProps extends React.HTMLAttributes<HTMLHeadElement> {}
export function LogoText({ ...rest }: LogoTextProps) {
  return (
    <span {...rest} className={cn('inline-flex items-center gap-2', rest.className)} aria-label="Nibgate">
      <img src="/brand/nibgate-mark.svg" alt="" className="h-10 w-10" />
      <img src="/brand/nibgate-wordmark.svg" alt="Nibgate" className="h-[38px] w-[124px]" />
    </span>
  );
}
