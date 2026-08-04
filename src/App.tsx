import { useCallback, useMemo, useState } from 'react';
import type { Value } from 'platejs';

import type { GrammarFeedbackEditor } from '@/components/editor/editor-kit';
import { initialEditorValue, useGrammarFeedbackEditor } from '@/components/editor/editor-kit';
import EssayEditor from '@/components/EssayEditor';
import Controls from '@/components/controls';
import { serializeEditorDocument } from '@/editorText';
import {
  deactivateFeedback,
  dismissFeedback,
  replaceFeedbackResponse,
} from '@/feedbackAnnotations';
import type {
  FeedbackDiscussion,
  FeedbackResponse,
  FeedbackSystem,
  UserRequest,
} from '@/types/api';
import { apiBaseUrl, defaultSystem, maxDrafts } from '@/utils/constants';

type GrammarFeedbackApplicationProps = {
  editor: GrammarFeedbackEditor;
};

const scrollEditorIntoViewOnMobile = () => {
  if (!window.matchMedia?.('(max-width: 767px)').matches) return;

  window.requestAnimationFrame(() => {
    document
      .getElementById('essay-workspace')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
};

export function GrammarFeedbackApplication({ editor }: GrammarFeedbackApplicationProps) {
  const [editorValue, setEditorValue] = useState<Value>(initialEditorValue);
  const [feedbackList, setFeedbackList] = useState<FeedbackDiscussion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftNumber, setDraftNumber] = useState(1);
  const [systemChoice, setSystemChoice] = useState<FeedbackSystem>(defaultSystem);

  const userId = useMemo(() => {
    const storedUserId = localStorage.getItem('user_id');
    if (storedUserId) return storedUserId;

    const newUserId = crypto.randomUUID();
    localStorage.setItem('user_id', newUserId);
    return newUserId;
  }, []);

  const handleEditorChange = useCallback((newValue: Value) => {
    setEditorValue(newValue);
  }, []);

  const handleSubmit = useCallback(async () => {
    const currentText = serializeEditorDocument(editorValue);

    if (draftNumber > maxDrafts || !currentText.trim()) {
      if (draftNumber > maxDrafts) {
        setError(`Maximum draft limit (${maxDrafts}) reached.`);
      }
      if (!currentText.trim()) {
        setError('Please enter some text before submitting.');
      }
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    deactivateFeedback(editor);

    const requestData: UserRequest = {
      user_id: userId,
      system_choice: systemChoice,
      draft_number: draftNumber,
      text: currentText,
    };

    try {
      const response = await fetch(`${apiBaseUrl}/grammar_feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        let message = `Request failed with status ${response.status}.`;

        try {
          const errorBody: unknown = await response.json();
          if (
            typeof errorBody === 'object' &&
            errorBody !== null &&
            'detail' in errorBody &&
            typeof errorBody.detail === 'string'
          ) {
            message = errorBody.detail;
          }
        } catch {
          // Keep the status-based message when the error response is not JSON.
        }

        throw new Error(message);
      }

      const responseData = (await response.json()) as FeedbackResponse;
      setFeedbackList(replaceFeedbackResponse(editor, currentText, responseData));
      setDraftNumber((previous) => previous + 1);
      scrollEditorIntoViewOnMobile();
    } catch (caught: unknown) {
      const message = caught instanceof TypeError ? 'Network Error' : undefined;
      setError(
        message ?? (caught instanceof Error ? caught.message : 'An unknown error occurred.'),
      );
    } finally {
      setIsLoading(false);
    }
  }, [draftNumber, editor, editorValue, systemChoice, userId]);

  const handleDismissFeedback = useCallback(
    (feedbackId: string) => {
      dismissFeedback(editor, feedbackId);
      setFeedbackList((currentFeedback) =>
        currentFeedback.filter((feedback) => feedback.id !== feedbackId),
      );
    },
    [editor],
  );

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-muted/35 text-foreground md:h-dvh md:min-h-[32rem] md:overflow-hidden">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-1 px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Grammar Feedback Tool
          </h1>
          <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
            Submit your essay draft, choose a feedback system, and click submit to see feedback on
            grammar, vocabulary, and spelling issues.
          </p>
        </div>
      </header>
      <Controls
        draftNumber={draftNumber}
        maxDrafts={maxDrafts}
        isLoading={isLoading}
        error={error}
        handleSubmit={handleSubmit}
        systemChoice={systemChoice}
        setSystemChoice={setSystemChoice}
      />
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 px-0 py-0 sm:px-4 sm:py-4 md:min-h-0 md:overflow-hidden lg:px-8">
        <EssayEditor
          discussions={feedbackList}
          editor={editor}
          onChange={handleEditorChange}
          onDismiss={handleDismissFeedback}
          readOnly={isLoading}
        />
      </main>
    </div>
  );
}

function App() {
  const editor = useGrammarFeedbackEditor();
  return <GrammarFeedbackApplication editor={editor} />;
}

export default App;
