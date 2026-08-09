import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Value } from 'platejs';

import type { GrammarFeedbackEditor } from '@/components/editor/editor-kit';
import { initialEditorValue, useGrammarFeedbackEditor } from '@/components/editor/editor-kit';
import EssayEditor from '@/components/EssayEditor';
import Controls from '@/components/controls';
import { appConfig, type AppConfig } from '@/config';
import { serializeEditorDocument } from '@/editorText';
import {
  deactivateFeedback,
  dismissFeedback,
  replaceFeedbackResponse,
} from '@/feedbackAnnotations';
import type {
  FeedbackDiscussion,
  FeedbackResponse,
  PipelinesResponse,
  UserRequest,
} from '@/types/api';

type GrammarFeedbackApplicationProps = {
  editor: GrammarFeedbackEditor;
  config?: AppConfig;
};

const isPipelinesResponse = (value: unknown): value is PipelinesResponse => {
  if (typeof value !== 'object' || value === null) return false;

  const response = value as Partial<PipelinesResponse>;
  return (
    typeof response.default_pipeline === 'string' &&
    Array.isArray(response.pipelines) &&
    response.pipelines.every((pipeline) => typeof pipeline === 'string')
  );
};

const scrollEditorIntoViewOnMobile = () => {
  if (!window.matchMedia?.('(max-width: 767px)').matches) return;

  window.requestAnimationFrame(() => {
    document
      .getElementById('essay-workspace')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
};

export function GrammarFeedbackApplication({
  editor,
  config = appConfig,
}: GrammarFeedbackApplicationProps) {
  const [editorValue, setEditorValue] = useState<Value>(initialEditorValue);
  const [feedbackList, setFeedbackList] = useState<FeedbackDiscussion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftNumber, setDraftNumber] = useState(1);
  const [pipelineIds, setPipelineIds] = useState<string[] | null>(config.demoMode ? [] : null);
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null);
  const [isLoadingPipelines, setIsLoadingPipelines] = useState(config.demoMode);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  useEffect(() => {
    if (!config.demoMode) return;

    const abortController = new AbortController();

    const loadPipelines = async () => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/pipelines`, {
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error(`Pipeline request failed with status ${response.status}.`);
        }

        const responseData: unknown = await response.json();
        if (!isPipelinesResponse(responseData)) {
          throw new Error('The pipeline list response was invalid.');
        }
        if (!responseData.pipelines.includes(responseData.default_pipeline)) {
          throw new Error('The pipeline list response was invalid.');
        }

        setPipelineIds(responseData.pipelines);
        setSelectedPipeline(responseData.default_pipeline);
      } catch (caught: unknown) {
        if (abortController.signal.aborted) return;

        setPipelineError(
          caught instanceof TypeError
            ? 'Could not load feedback pipelines.'
            : caught instanceof Error
              ? caught.message
              : 'Could not load feedback pipelines.',
        );
      } finally {
        if (!abortController.signal.aborted) setIsLoadingPipelines(false);
      }
    };

    void loadPipelines();
    return () => abortController.abort();
  }, [config.apiBaseUrl, config.demoMode]);

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
    const hasReachedDraftLimit = config.maxDrafts !== null && draftNumber > config.maxDrafts;

    if (hasReachedDraftLimit || !currentText.trim() || (config.demoMode && !selectedPipeline)) {
      if (hasReachedDraftLimit) {
        setError(`Maximum draft limit (${config.maxDrafts}) reached.`);
      }
      if (!currentText.trim()) {
        setError('Please enter some text before submitting.');
      }
      if (config.demoMode && !selectedPipeline) {
        setError('Please select a feedback pipeline before submitting.');
      }
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    deactivateFeedback(editor);

    const requestData: UserRequest = {
      user_id: userId,
      assignment_id: 'free-writing',
      draft_number: draftNumber,
      text: currentText,
    };
    if (selectedPipeline !== null) requestData.system_choice = selectedPipeline;

    try {
      const response = await fetch(`${config.apiBaseUrl}/grammar_feedback`, {
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
  }, [
    config.apiBaseUrl,
    config.demoMode,
    config.maxDrafts,
    draftNumber,
    editor,
    editorValue,
    selectedPipeline,
    userId,
  ]);

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
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-muted/35 text-foreground md:h-dvh md:min-h-128 md:overflow-hidden">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-1 px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Grammar Feedback Tool
          </h1>
          <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
            Submit your essay draft to see feedback on grammar, vocabulary, and spelling issues.
          </p>
        </div>
      </header>
      <Controls
        draftNumber={draftNumber}
        maxDrafts={config.maxDrafts}
        isLoading={isLoading}
        isLoadingPipelines={isLoadingPipelines}
        error={error ?? pipelineError}
        handleSubmit={handleSubmit}
        pipelineIds={pipelineIds}
        selectedPipeline={selectedPipeline}
        setSelectedPipeline={setSelectedPipeline}
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
  return <GrammarFeedbackApplication editor={editor} config={appConfig} />;
}

export default App;
