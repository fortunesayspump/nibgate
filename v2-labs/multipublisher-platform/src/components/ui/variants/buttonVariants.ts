import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'group flex flex-row items-center justify-center font-semibold transition-colors focus:outline-none active:scale-[0.99] active:ring-4 disabled:cursor-not-allowed disabled:opacity-70',
  {
    variants: {
      size: {
        huge: 'gap-3 rounded-md px-8 py-4 text-base',
        large: 'gap-3 rounded-md px-6 py-3 text-sm',
        medium: 'gap-2 rounded-md px-5 py-3 text-sm',
        small: 'gap-2 rounded-md px-3 py-2 text-[13px]',
      },
      mode: {
        primary: 'bg-slate-950 text-white hover:bg-emerald-700 active:ring-primary/30',
        secondary:
          'border border-border bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 active:ring-secondary-foreground/20',
        subtle:
          'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100 active:ring-primary-accent/30',
        ghost: 'font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-950 active:ring-muted-foreground/20',
      },
      expand: {
        full: 'w-full',
        half: 'w-1/2',
        none: '',
      },
      shape: {
        pill: 'rounded-full',
        rounded: '',
      },
    },
    defaultVariants: {
      size: 'medium',
      mode: 'primary',
      expand: 'none',
      shape: 'rounded',
    },
  },
);

export const buttonIconVariants = cva('', {
  variants: {
    size: {
      huge: 'h-6 w-6',
      large: 'h-6 w-6',
      medium: 'h-6 w-6',
      small: 'h-5 w-5',
    },
    mode: {
      primary: 'stroke-primary-foreground',
      secondary: 'stroke-secondary-foreground',
      subtle: 'stroke-primary-accent',
      ghost: 'stroke-muted-foreground',
    },
  },
  defaultVariants: {
    size: 'medium',
    mode: 'primary',
  },
});
