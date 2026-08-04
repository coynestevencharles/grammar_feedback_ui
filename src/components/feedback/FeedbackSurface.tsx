import { X } from 'lucide-react';
import { useEditorPlugin, usePluginOption } from 'platejs/react';
import { useMemo } from 'react';

import { commentPlugin } from '@/components/editor/plugins/comment-kit';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import type { FeedbackDiscussion } from '@/types/api';

type FeedbackSurfaceProps = {
  discussions: FeedbackDiscussion[];
  onDismiss: (feedbackId: string) => void;
};

export function FeedbackSurface({ discussions, onDismiss }: FeedbackSurfaceProps) {
  const { setOption } = useEditorPlugin(commentPlugin);
  const activeElement = usePluginOption(commentPlugin, 'activeElement');
  const activeIds = usePluginOption(commentPlugin, 'activeIds');
  const anchorRef = useMemo(() => ({ current: activeElement }), [activeElement]);

  const activeDiscussions = activeIds
    .map((id) => discussions.find((discussion) => discussion.id === id))
    .filter((discussion): discussion is FeedbackDiscussion => Boolean(discussion));

  const close = () => {
    setOption('activeElement', null);
    setOption('activeId', null);
    setOption('activeIds', []);
  };

  const handleDismiss = (feedbackId: string) => {
    onDismiss(feedbackId);

    const remainingIds = activeIds.filter((id) => id !== feedbackId);
    setOption('activeIds', remainingIds);
    setOption('activeId', remainingIds[0] ?? null);
    if (remainingIds.length === 0) close();
  };

  return (
    <Popover
      open={activeElement !== null && activeDiscussions.length > 0}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] space-y-4"
        sideOffset={10}
        role="dialog"
        aria-label="Grammar feedback"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold">Grammar feedback</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Close feedback"
            onClick={close}
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        {activeDiscussions.map((feedback) => (
          <article
            className="space-y-3 border-t border-border pt-3 first:border-t-0 first:pt-0"
            key={feedback.id}
          >
            <div className="text-sm font-semibold text-brand">{feedback.error_tag}</div>
            <section className="space-y-1">
              <h3 className="text-sm font-medium">What&apos;s wrong?</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                {feedback.feedback_explanation}
              </p>
            </section>
            <section className="space-y-1">
              <h3 className="text-sm font-medium">What to do:</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                {feedback.feedback_suggestion}
              </p>
            </section>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleDismiss(feedback.id)}
            >
              Dismiss
            </Button>
          </article>
        ))}
      </PopoverContent>
    </Popover>
  );
}
