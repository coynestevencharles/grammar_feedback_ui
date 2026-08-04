import type { Value } from 'platejs';

import { Plate } from 'platejs/react';

import type { GrammarFeedbackEditor } from '@/components/editor/editor-kit';
import { FeedbackSurface } from '@/components/feedback/FeedbackSurface';
import { Editor, EditorContainer } from '@/components/ui/editor';
import type { FeedbackDiscussion } from '@/types/api';

import './EssayEditor.css';

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
      <EditorContainer>
        <Editor
          className="editable-area"
          placeholder="Enter your text..."
          spellCheck={false}
          variant="none"
          aria-label="Essay text"
          aria-multiline="true"
        />
      </EditorContainer>
      <FeedbackSurface discussions={discussions} onDismiss={onDismiss} />
    </Plate>
  );
}
