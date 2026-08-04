import * as React from 'react';
import type { VariantProps } from 'class-variance-authority';

import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button };
