import * as React from 'react';

import type { PlateContentProps } from 'platejs/react';

import { PlateContainer, PlateContent } from 'platejs/react';

import { cn } from '@/lib/utils';

export function EditorContainer({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <PlateContainer
      className={cn(
        'relative h-full w-full cursor-text select-text overflow-y-auto caret-primary selection:bg-brand/25 focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export type EditorProps = PlateContentProps;

export const Editor = ({
  className,
  ref,
  ...props
}: EditorProps & { ref?: React.RefObject<HTMLDivElement | null> }) => (
  <PlateContent
    ref={ref}
    className={cn(
      'group/editor relative w-full cursor-text select-text overflow-x-hidden whitespace-break-spaces break-words rounded-md ring-offset-background focus-visible:outline-none **:data-slate-placeholder:!top-1/2 **:data-slate-placeholder:-translate-y-1/2 **:data-slate-placeholder:text-muted-foreground/80 **:data-slate-placeholder:opacity-100! [&_strong]:font-bold',
      className,
    )}
    disableDefaultStyles
    {...props}
  />
);

Editor.displayName = 'Editor';
