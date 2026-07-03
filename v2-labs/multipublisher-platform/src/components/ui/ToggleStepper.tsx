import { cn } from '@/lib/cn';
import { SVGProps, useRef } from 'react';
import { VariantProps, cva } from 'class-variance-authority';
import { AriaToggleButtonProps, mergeProps, useFocusRing, useToggleButton } from 'react-aria';
import { useToggleState } from 'react-stately';

const toggle = cva('flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 active:ring-4', {
  variants: {
    color: {
      red: 'hover:bg-destructive-foreground/30 focus:outline-none',
      blue: 'hover:bg-teal-50 focus:outline-none',
      emerald: 'hover:bg-emerald-50 focus:outline-none',
    },
  },
  defaultVariants: {
    color: 'emerald',
  },
});

const icon = cva('h-6 w-6', {
  variants: {
    color: {
      red: 'fill-destructive-foreground',
      blue: 'fill-teal-600',
      emerald: 'fill-emerald-700',
    },
  },
  defaultVariants: {
    color: 'emerald',
  },
});

interface ToggleStepperProps extends VariantProps<typeof icon>, AriaToggleButtonProps {
  Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
  quantity: number;
  noun?: string;
}

export function ToggleStepper({ Icon, quantity, noun, color, ...rest }: ToggleStepperProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const state = useToggleState(rest);
  const { buttonProps } = useToggleButton(rest, state, ref);
  const { isFocusVisible, focusProps } = useFocusRing();

  return (
    <button
      type="button"
      {...mergeProps(buttonProps, focusProps)}
      ref={ref}
      className={cn(
        'transition-transform active:scale-90',
        toggle({ color }),
        isFocusVisible && 'ring-2 ring-emerald-700 ring-offset-2',
      )}>
      <Icon width={22} height={22} className={cn(state.isSelected ? icon({ color }) : 'stroke-slate-500')} />
      <p className="text-sm font-medium text-slate-500">
        {quantity} {noun !== undefined ? (quantity === 1 ? noun : `${noun}s`) : ''}
      </p>
    </button>
  );
}
