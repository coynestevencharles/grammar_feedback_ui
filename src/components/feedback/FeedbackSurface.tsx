import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEditorContainerRef, useEditorPlugin, usePluginOption } from 'platejs/react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { commentPlugin } from '@/components/editor/plugins/comment-kit';
import { Button } from '@/components/ui/button';
import type { FeedbackDiscussion } from '@/types/api';

type FeedbackSurfaceProps = {
  discussions: FeedbackDiscussion[];
  onDismiss: (feedbackId: string) => void;
};

type ViewportMetrics = {
  bottomInset: number;
  height: number;
};

const getViewportMetrics = (viewport: VisualViewport | null): ViewportMetrics => {
  if (!viewport) return { bottomInset: 0, height: window.innerHeight };

  return {
    bottomInset: Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop),
    height: viewport.height,
  };
};

const useViewportMetrics = () => {
  const [metrics, setMetrics] = useState<ViewportMetrics>(() =>
    getViewportMetrics(window.visualViewport),
  );

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateMetrics = () => setMetrics(getViewportMetrics(viewport));

    updateMetrics();
    viewport?.addEventListener('resize', updateMetrics);
    viewport?.addEventListener('scroll', updateMetrics);
    window.addEventListener('resize', updateMetrics);

    return () => {
      viewport?.removeEventListener('resize', updateMetrics);
      viewport?.removeEventListener('scroll', updateMetrics);
      window.removeEventListener('resize', updateMetrics);
    };
  }, []);

  return metrics;
};

const findHighlight = (editorElement: HTMLElement, feedbackId: string) =>
  Array.from(editorElement.querySelectorAll<HTMLElement>('[data-feedback-ids]')).find((element) =>
    element.dataset.feedbackIds?.split(' ').includes(feedbackId),
  );

const scrollToHighlight = (highlight: HTMLElement) => {
  const highlightRect = highlight.getBoundingClientRect();
  const isMobile = window.matchMedia?.('(max-width: 767px)').matches ?? window.innerWidth < 768;

  if (isMobile) {
    window.scrollTo({
      behavior: 'smooth',
      top: Math.max(0, window.scrollY + highlightRect.top - 24),
    });
    return;
  }

  const scrollContainer = highlight.closest<HTMLElement>('[data-feedback-scroll-container]');
  if (!scrollContainer || typeof scrollContainer.scrollTo !== 'function') return;

  const containerRect = scrollContainer.getBoundingClientRect();
  scrollContainer.scrollTo({
    behavior: 'smooth',
    top:
      scrollContainer.scrollTop +
      highlightRect.top -
      containerRect.top -
      (scrollContainer.clientHeight - highlightRect.height) / 2,
  });
};

export function FeedbackSurface({ discussions, onDismiss }: FeedbackSurfaceProps) {
  const { setOption } = useEditorPlugin(commentPlugin);
  const editorElementRef = useEditorContainerRef();
  const activeId = usePluginOption(commentPlugin, 'activeId');
  const viewport = useViewportMetrics();
  const activeIndex = discussions.findIndex((discussion) => discussion.id === activeId);
  const selectedIndex = activeIndex >= 0 ? activeIndex : 0;
  const activeDiscussion = discussions[selectedIndex];

  const selectFeedback = useCallback(
    (feedbackId: string, scroll = true) => {
      setOption('activeId', feedbackId);

      if (!scroll) return;

      window.requestAnimationFrame(() => {
        const editorElement = editorElementRef.current;
        if (!editorElement) return;

        const highlight = findHighlight(editorElement, feedbackId);
        if (highlight) scrollToHighlight(highlight);
      });
    },
    [editorElementRef, setOption],
  );

  useEffect(() => {
    if (discussions.length > 0 && activeIndex < 0) {
      selectFeedback(discussions[0].id, false);
    }
  }, [activeIndex, discussions, selectFeedback]);

  const handleDismiss = () => {
    if (!activeDiscussion) return;

    const nextDiscussion = discussions[selectedIndex + 1] ?? discussions[selectedIndex - 1];
    onDismiss(activeDiscussion.id);

    if (nextDiscussion) {
      selectFeedback(nextDiscussion.id);
    } else {
      setOption('activeId', null);
    }
  };

  const surfaceVisibility = discussions.length === 0 ? 'hidden md:flex' : 'flex';
  const surfaceStyle = {
    '--feedback-max-height': `${Math.min(viewport.height * 0.48, 384)}px`,
    bottom: `calc(${viewport.bottomInset}px + env(safe-area-inset-bottom))`,
  } as CSSProperties;

  return (
    <aside
      id="feedback-panel"
      aria-label="Feedback details"
      className={`${surfaceVisibility} fixed inset-x-0 z-40 max-h-(--feedback-max-height) flex-col overflow-hidden border-t bg-background/98 shadow-[0_-8px_30px_rgba(15,23,42,0.14)] backdrop-blur md:static md:max-h-none md:min-h-0 md:rounded-xl md:border md:shadow-sm`}
      style={surfaceStyle}
    >
      {activeDiscussion ? (
        <>
          <div
            className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3"
            data-feedback-header
          >
            <div className="min-w-0 text-sm font-semibold text-brand">
              {activeDiscussion.error_tag}
            </div>
            <div className="shrink-0 text-xs font-medium text-muted-foreground" aria-live="polite">
              {selectedIndex + 1} of {discussions.length}
            </div>
          </div>

          <article
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4"
            data-feedback-body
            key={activeDiscussion.id}
          >
            <section className="space-y-1.5">
              <h2 className="text-sm font-semibold text-foreground">What&apos;s wrong?</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {activeDiscussion.feedback_explanation}
              </p>
            </section>
            <section className="space-y-1.5">
              <h2 className="text-sm font-semibold text-foreground">What to do</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {activeDiscussion.feedback_suggestion}
              </p>
            </section>
          </article>

          <div className="flex shrink-0 items-center gap-2 border-t px-3 py-3" data-feedback-footer>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Previous feedback"
              disabled={selectedIndex === 0}
              onClick={() => selectFeedback(discussions[selectedIndex - 1].id)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Next feedback"
              disabled={selectedIndex === discussions.length - 1}
              onClick={() => selectFeedback(discussions[selectedIndex + 1].id)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="ml-auto"
              onClick={handleDismiss}
            >
              Dismiss
            </Button>
          </div>
        </>
      ) : (
        <div className="hidden h-full min-h-48 place-items-center p-6 text-center text-sm leading-6 text-muted-foreground md:grid">
          Submit a draft to see feedback alongside your writing.
        </div>
      )}
    </aside>
  );
}
