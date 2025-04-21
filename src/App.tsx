import axios from 'axios';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BaseElement,
  createEditor,
  Descendant,
  Editor,
  Element,
  Path,
  Point,
  Range,
  RangeRef,
  Node as SlateNode,
  Text,
} from 'slate';
import { ReactEditor, withReact } from 'slate-react';
import { v4 as uuidv4 } from 'uuid';
import './App.css';
import EssayEditor from './components/EssayEditor';
import FeedbackCard from './components/FeedbackCard';
import Controls from './components/controls';
import { FeedbackComment, FeedbackResponse, ProcessedFeedback, UserRequest } from './types/api';
import { apiBaseUrl, maxDrafts, validSystems, defaultSystem } from './utils/constants';


const getPlainText = (nodes: Descendant[]): string => {
  // DEBUG: Log the nodes being processed
  // console.log("getPlainText called with nodes:", JSON.stringify(nodes, null, 2));

  // Return the plain text by joining the text of each node and accounting for newlines
  const plainText = nodes
    .map(node => {
      if (Text.isText(node)) {
        return node.text;
      } else if (Element.isElement(node)) {
        // For elements, join their text children with a newline
        return node.children.map(child => Text.isText(child) ? child.text : '').join('\n');
      }
      return '';
    })
    .join('\n');
  // DEBUG: Log the generated plain text (verbose)
  // console.log("Plain text generated:", plainText);
  return plainText;
};

const initialValue: Descendant[] = [{ type: 'paragraph', children: [{ text: '' }] }];

const offsetToPoint = (editor: Editor, offset: number): Point | null => {
  try {
    // Get all block nodes from the editor
    const blockEntries = Array.from(Editor.nodes(editor, {
      at: [],
      match: n => Editor.isBlock(editor, n),
    }));

    if (blockEntries.length === 0) return null;

    if (offset === 0) {
      return Editor.start(editor, blockEntries[0][1]);
    }

    // Calculate the cumulative length of each block plus newlines
    let currentOffset = 0;

    for (let blockIdx = 0; blockIdx < blockEntries.length; blockIdx++) {
      const [blockNode, blockPath] = blockEntries[blockIdx];

      // Get text nodes within this block
      const textEntries = Array.from(
        SlateNode.texts(blockNode as BaseElement)
      ).map(([node, path]) => {
        // Make the path absolute from the editor root
        return [node, [...blockPath, ...path.slice(blockPath.length)]];
      });

      // Process each text node in this block
      for (const [textNode, textPath] of textEntries) {
        const textLength = textNode.text.length;

        // If the offset is within this text node
        if (offset > currentOffset && offset <= currentOffset + textLength) {
          const localOffset = offset - currentOffset;

          return {
            path: textPath,
            offset: localOffset
          };
        }

        // Add newline if this is not the last text node in the block
        // NOTE: This is critical to match with the backend's text length
        if (textEntries.length > 1 && textNode !== textEntries[textEntries.length - 1][0]) {
          currentOffset += textLength + 1;
        }

        if (offset === currentOffset) {
          if (textEntries.length > 0) {
            const lastTextPath = textEntries[textEntries.length - 1][1];
            const lastTextNode = textEntries[textEntries.length - 1][0];
            return {
              path: lastTextPath,
              offset: lastTextNode.text.length
            };
          } else {
            // Block with no text nodes
            return Editor.end(editor, blockPath);
          }
        }
      }
    }

    const lastBlock = blockEntries[blockEntries.length - 1];
    return Editor.end(editor, lastBlock[1]);

  } catch (error) {
    console.error("Error converting offset to point:", offset, error);
    return null;
  }
};

const processFeedbackAndCreateRefs = (
  editor: Editor,
  fullText: string, // Exact string sent to the backend
  feedbackList: FeedbackComment[]
): ProcessedFeedback[] => {

  const processedFeedback: ProcessedFeedback[] = [];
  const textLength = fullText.length;

  feedbackList.forEach((comment, idx) => {
    const { global_highlight_start, global_highlight_end } = comment;

    if (typeof global_highlight_start !== 'number' || typeof global_highlight_end !== 'number') {
      console.warn(`Invalid index types for feedback (item ${idx}): start=${global_highlight_start}, end=${global_highlight_end}`);
      return;
    }
    if (global_highlight_start < 0 || global_highlight_end < 0) {
      console.warn(`Negative indices received for feedback (item ${idx}): start=${global_highlight_start}, end=${global_highlight_end}`);
      return;
    }
    if (global_highlight_start > global_highlight_end) {
      console.warn(`Invalid range (start > end) for feedback (item ${idx}): [${global_highlight_start}-${global_highlight_end}]`);
      return;
    }
    // Allow zero-length highlights if start === end
    // This is discouraged on the back end, but may happen and is not entirely illegal
    if (global_highlight_start === global_highlight_end) {
      console.log(`Zero-length highlight detected (item ${idx}): [${global_highlight_start}-${global_highlight_end}]. Processing as insertion point.`);
    }

    if (global_highlight_start > textLength || global_highlight_end > textLength) {
      console.warn(`Indices out of bounds for feedback (item ${idx}): [${global_highlight_start}-${global_highlight_end}]. Text length: ${textLength}`);
      return;
    }

    const anchorPoint = offsetToPoint(editor, global_highlight_start);
    const focusPoint = offsetToPoint(editor, global_highlight_end);

    if (anchorPoint && focusPoint) {
      const range = { anchor: anchorPoint, focus: focusPoint };

      try {
        // Debug logging
        // console.log(`Creating rangeRef for feedback (item ${idx}) with global indices [${global_highlight_start}-${global_highlight_end}]`);
        Editor.point(editor, anchorPoint);
        Editor.point(editor, focusPoint);

        // Allow collapsed ranges if start === end, otherwise check
        const isCollapsedRange = Range.isCollapsed(range);
        const isValidRange = (global_highlight_start < global_highlight_end && !isCollapsedRange) || (global_highlight_start === global_highlight_end && isCollapsedRange)

        if (isValidRange && !Range.isBackward(range)) {
          const rangeRef = Editor.rangeRef(editor, range);
          processedFeedback.push({
            ...comment,
            id: uuidv4(),
            rangeRef: rangeRef,
            original_global_highlight_start: global_highlight_start,
            original_global_highlight_end: global_highlight_end,
          });
          // Debug: Logging each comment as we attempt to process a highlight for it
          // console.log(`Feedback item ${idx} processed successfully. Range:`, range, `Global: [${global_highlight_start}-${global_highlight_end}]`);
        } else {
          console.warn(`Mapped Slate range invalid, collapsed incorrectly, or backward for feedback (item ${idx}). Range:`, JSON.stringify(range), `Global: [${global_highlight_start}-${global_highlight_end}]`);
        }
      } catch (e) {
        console.error(`Error validating points/rangeRef for feedback (item ${idx}). Global: [${global_highlight_start}-${global_highlight_end}]. Anchor: ${JSON.stringify(anchorPoint)}, Focus: ${JSON.stringify(focusPoint)}`, e);
      }

    } else {
      console.warn(`Failed to create Slate points for feedback (item ${idx}) with global indices [${global_highlight_start}-${global_highlight_end}]. Anchor success: ${!!anchorPoint}, Focus success: ${!!focusPoint}. Check offsetToPoint logs.`);
    }
  });

  console.log(`Successfully processed ${processedFeedback.length} / ${feedbackList.length} feedback items into RangeRefs using global indices.`);

  processedFeedback.sort((a, b) => {
    const startA = a.global_highlight_start ?? Infinity;
    const startB = b.global_highlight_start ?? Infinity;
    return startA - startB;
  });

  return processedFeedback;
};

function App() {
  const [editorValue, setEditorValue] = useState<Descendant[]>(initialValue);
  const [feedbackList, setFeedbackList] = useState<ProcessedFeedback[]>([]);
  const [activeFeedbackId, setActiveFeedbackId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [draftNumber, setDraftNumber] = useState<number>(1);
  const [referenceElement, setReferenceElement] = useState<HTMLElement | null>(null);
  const [systemChoice, setSystemChoice] = useState(defaultSystem);


  const editorRef = useRef<HTMLDivElement>(null);
  const editor = useMemo(() => withReact(createEditor()), []);

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

    // Unref ranges when text is cleared
    // const currentPlainText = getPlainText(newValue);
    // if (currentPlainText.length === 0 && feedbackList.length > 0) {
    //   console.log("Clearing feedback refs due to empty editor");
    //   feedbackList.forEach(f => f.rangeRef?.unref());
    //   setFeedbackList([]);
    //   setActiveFeedbackId(null);
    //   setReferenceElement(null);
    // }
  }, [feedbackList]);

  const handleSubmit = useCallback(async () => {
    const currentText = getPlainText(editorValue);
    console.log("handleSubmit triggered. Draft:", draftNumber, "Text:", currentText);

    if (draftNumber > maxDrafts || !currentText.trim()) {
      if (draftNumber > maxDrafts) setError(`Maximum draft limit (${maxDrafts}) reached.`);
      if (!currentText.trim()) setError("Please enter some text before submitting.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setActiveFeedbackId(null);
    setReferenceElement(null);

    // Clear existing highlight rangeRefs before fetching new feedback
    feedbackList.forEach(f => f.rangeRef?.unref());
    setFeedbackList([]);

    const requestData: UserRequest = {
      user_id: userId,
      system_choice: systemChoice,
      draft_number: draftNumber,
      text: currentText,
    };

    try {
      const apiUrl = `${apiBaseUrl}/grammar_feedback`;
      console.log(`Attempting POST request to: ${apiUrl}`);
      const response = await axios.post<FeedbackResponse>(apiUrl, requestData);
      console.log("API Response received:", response);

      if (response.data && response.data.feedback_list) {
        const processed = processFeedbackAndCreateRefs(editor, currentText, response.data.feedback_list);
        setFeedbackList(processed);
        setDraftNumber(prev => prev + 1);
      } else {
        setFeedbackList([]);
        console.log("No feedback items received.");
      }
    } catch (err: any) {
      console.error("API Error encountered in handleSubmit:", err);
      console.error("API Error Response:", err.response);
      setError(err.response?.data?.detail || err.message || "An unknown error occurred.");
      setFeedbackList([]);
    } finally {
      setIsLoading(false);
    }
  }, [editorValue, userId, draftNumber, apiBaseUrl, maxDrafts, editor, feedbackList]);

  const handleHighlightClick = useCallback((feedbackId: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    const feedback = feedbackList.find(f => f.id === feedbackId);

    if (!feedback || !feedback.rangeRef?.current) {
      console.warn("Could not find feedback or range for positioning:", feedbackId);
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

    try {
      // Get bounding box of the current Slate Range
      const domRange = ReactEditor.toDOMRange(editor, feedback.rangeRef.current);
    } catch (error) {
      console.error("Error calculating DOM range:", error);
    }
  }, [editor, feedbackList, activeFeedbackId]);

  const handleDismissFeedback = useCallback((feedbackIdToDismiss: string) => {

    const feedbackToDismiss = feedbackList.find(f => f.id === feedbackIdToDismiss);

    if (feedbackToDismiss) {
      feedbackToDismiss.rangeRef?.unref();
    }

    setFeedbackList(currentFeedback =>
      currentFeedback.filter(f => f.id !== feedbackIdToDismiss)
    );

    // If the dismissed card was the active one, hide the card
    if (activeFeedbackId === feedbackIdToDismiss) {
      setActiveFeedbackId(null);
      setReferenceElement(null);
    }
  }, [activeFeedbackId, feedbackList]);

  // Handle clicking outside the card to hide it (but not dismiss)
  const handleClickOutside = useCallback(() => {
    setActiveFeedbackId(null);
    setReferenceElement(null);
  }, []);

  const activeFeedback = useMemo(() => {
    if (!activeFeedbackId) return null;
    return feedbackList.find(f => f.id === activeFeedbackId) || null;
  }, [activeFeedbackId, feedbackList]);

  return (
    <div className="app-container">
      <h1>Grammar Feedback Tool</h1>
      <div className="app-description">
      Submit your essay draft, choose a feedback system, and click submit to see feedback on grammar, vocabulary, and spelling issues.
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

export default App;