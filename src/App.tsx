import axios from 'axios';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createEditor, Descendant, Editor } from 'slate';
import { ReactEditor, withReact } from 'slate-react';
import { v4 as uuidv4 } from 'uuid';
import './App.css';
import EssayEditor from './components/EssayEditor';
import FeedbackCard from './components/FeedbackCard';
import Controls from './components/controls';
import { serializeEditorDocument } from './editorText';
import { createFeedbackRanges } from './feedbackRanges';
import { FeedbackResponse, FeedbackSystem, ProcessedFeedback, UserRequest } from './types/api';
import { apiBaseUrl, maxDrafts, defaultSystem } from './utils/constants';

const initialValue = [{ type: 'paragraph', children: [{ text: '' }] }];

type GrammarFeedbackApplicationProps = {
  editor: Editor & ReactEditor;
};

export function GrammarFeedbackApplication({ editor }: GrammarFeedbackApplicationProps) {
  const [editorValue, setEditorValue] = useState<Descendant[]>(initialValue);
  const [feedbackList, setFeedbackList] = useState<ProcessedFeedback[]>([]);
  const [activeFeedbackId, setActiveFeedbackId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [draftNumber, setDraftNumber] = useState<number>(1);
  const [referenceElement, setReferenceElement] = useState<HTMLElement | null>(null);
  const [systemChoice, setSystemChoice] = useState<FeedbackSystem>(defaultSystem);

  const editorRef = useRef<HTMLDivElement>(null);
  // Initialize user ID and system choice
  const userId = useMemo(() => {
    // TODO: More robust user identification for rate limiting, etc.
    const storedUserId = localStorage.getItem('user_id');
    if (storedUserId) {
      return storedUserId;
    } else {
      const newUserId = uuidv4();
      localStorage.setItem('user_id', newUserId);
      return newUserId;
    }
  }, []);

  // Callback to update editor value
  const handleEditorChange = useCallback((newValue: Descendant[]) => {
    setEditorValue(newValue);
  }, []);

  const handleSubmit = useCallback(async () => {
    const currentText = serializeEditorDocument(editorValue);

    if (draftNumber > maxDrafts || !currentText.trim()) {
      if (draftNumber > maxDrafts) setError(`Maximum draft limit (${maxDrafts}) reached.`);
      if (!currentText.trim()) setError('Please enter some text before submitting.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setActiveFeedbackId(null);
    setReferenceElement(null);

    // Clear existing highlight rangeRefs before fetching new feedback
    feedbackList.forEach((f) => f.rangeRef?.unref());
    setFeedbackList([]);

    const requestData: UserRequest = {
      user_id: userId,
      system_choice: systemChoice,
      draft_number: draftNumber,
      text: currentText,
    };

    try {
      const apiUrl = `${apiBaseUrl}/grammar_feedback`;
      const response = await axios.post<FeedbackResponse>(apiUrl, requestData);

      if (response.data && response.data.feedback_list) {
        const processed = createFeedbackRanges(editor, currentText, response.data.feedback_list);
        setFeedbackList(processed);
        setDraftNumber((prev) => prev + 1);
      } else {
        setFeedbackList([]);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError<{ detail?: string }>(err)) {
        setError(err.response?.data?.detail || err.message || 'An unknown error occurred.');
      } else {
        setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      }
      setFeedbackList([]);
    } finally {
      setIsLoading(false);
    }
  }, [editorValue, userId, draftNumber, editor, feedbackList, systemChoice]);

  const handleHighlightClick = useCallback(
    (feedbackId: string, event: React.SyntheticEvent) => {
      const target = event.target as HTMLElement;
      const feedback = feedbackList.find((f) => f.id === feedbackId);

      if (!feedback || !feedback.rangeRef?.current) {
        setActiveFeedbackId(null);
        setReferenceElement(null);
        return;
      }

      // If clicking the same highlight that's already active, hide it
      if (activeFeedbackId === feedbackId) {
        setActiveFeedbackId(null);
        setReferenceElement(null);
        return;
      }

      // Set the clicked highlight as active
      setActiveFeedbackId(feedbackId);
      setReferenceElement(target);
    },
    [feedbackList, activeFeedbackId],
  );

  const handleDismissFeedback = useCallback(
    (feedbackIdToDismiss: string) => {
      const feedbackToDismiss = feedbackList.find((f) => f.id === feedbackIdToDismiss);

      if (feedbackToDismiss) {
        feedbackToDismiss.rangeRef?.unref();
      }

      setFeedbackList((currentFeedback) =>
        currentFeedback.filter((f) => f.id !== feedbackIdToDismiss),
      );

      // If the dismissed card was the active one, hide the card
      if (activeFeedbackId === feedbackIdToDismiss) {
        setActiveFeedbackId(null);
        setReferenceElement(null);
      }
    },
    [activeFeedbackId, feedbackList],
  );

  // Handle clicking outside the card to hide it (but not dismiss)
  const handleClickOutside = useCallback(() => {
    setActiveFeedbackId(null);
    setReferenceElement(null);
  }, []);

  const activeFeedback = useMemo(() => {
    if (!activeFeedbackId) return null;
    return feedbackList.find((f) => f.id === activeFeedbackId) || null;
  }, [activeFeedbackId, feedbackList]);

  return (
    <div className="app-container">
      <h1>Grammar Feedback Tool</h1>
      <div className="app-description">
        Submit your essay draft, choose a feedback system, and click submit to see feedback on
        grammar, vocabulary, and spelling issues.
      </div>
      <div className="editor-area" ref={editorRef}>
        <EssayEditor
          editorInstance={editor}
          value={editorValue}
          onChange={handleEditorChange}
          feedbackList={feedbackList}
          onHighlightClick={handleHighlightClick}
          activeFeedbackId={activeFeedbackId}
        />
      </div>
      {activeFeedback && referenceElement && (
        <FeedbackCard
          feedback={activeFeedback}
          onDismiss={() => handleDismissFeedback(activeFeedback.id)}
          referenceElement={referenceElement}
          onClickOutside={handleClickOutside}
        />
      )}
      <Controls
        draftNumber={draftNumber}
        maxDrafts={maxDrafts}
        isLoading={isLoading}
        error={error}
        handleSubmit={handleSubmit}
        systemChoice={systemChoice}
        setSystemChoice={setSystemChoice}
      />
    </div>
  );
}

function App() {
  const editor = useMemo(() => withReact(createEditor()), []);
  return <GrammarFeedbackApplication editor={editor} />;
}

export default App;
