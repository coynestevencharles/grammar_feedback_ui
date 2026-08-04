import type { Value } from 'platejs';

import { Plate } from 'platejs/react';

import type { GrammarFeedbackEditor } from '@/components/editor/editor-kit';
import { FeedbackSurface } from '@/components/feedback/FeedbackSurface';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { cn } from '@/lib/utils';
import type { FeedbackDiscussion } from '@/types/api';

type EssayEditorProps = {
  discussions: FeedbackDiscussion[];
  editor: GrammarFeedbackEditor;
  onChange: (value: Value) => void;
  onDismiss: (feedbackId: string) => void;
  readOnly: boolean;
};

export default function EssayEditor({
  discussions,
  editor,
  onChange,
  onDismiss,
  readOnly,
}: EssayEditorProps) {
  return (
    <Plate editor={editor} readOnly={readOnly} onValueChange={({ value }) => onChange(value)}>
      <div
        id="essay-workspace"
        className={cn(
          'grid min-h-[32rem] w-full min-w-0 flex-1 gap-4 md:h-full md:min-h-0 md:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_23rem]',
          discussions.length > 0 && 'mb-[min(48dvh,24rem)] md:mb-0',
        )}
      >
        <EditorContainer
          className="min-h-[32rem] min-w-0 overflow-y-auto bg-background shadow-sm sm:rounded-xl sm:border md:h-full md:min-h-0"
          data-feedback-scroll-container
        >
          <Editor
            className="min-h-full px-5 py-6 text-base leading-8 sm:px-8 md:px-8 md:py-8 md:pb-10 lg:px-10 lg:text-lg lg:leading-9 xl:px-12"
            placeholder="Start writing your draft…"
            spellCheck={false}
            aria-label="Essay text"
            aria-multiline="true"
          />
        </EditorContainer>
        <FeedbackSurface discussions={discussions} onDismiss={onDismiss} />
      </div>
    </Plate>
  );
}
