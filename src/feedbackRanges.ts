import { Editor, Range } from 'slate';
import { v4 as uuidv4 } from 'uuid';
import { apiOffsetsToRange } from './editorText';
import { FeedbackComment, ProcessedFeedback } from './types/api';

export const createFeedbackRanges = (
  editor: Editor,
  exactSubmittedText: string,
  feedbackList: FeedbackComment[],
): ProcessedFeedback[] => {
  const textLength = Array.from(exactSubmittedText).length;
  const processed: ProcessedFeedback[] = [];

  feedbackList.forEach((comment) => {
    const { global_highlight_start: start, global_highlight_end: end } = comment;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < 0 ||
      start > end ||
      start > textLength ||
      end > textLength
    ) {
      return;
    }

    const range = apiOffsetsToRange(editor, exactSubmittedText, start, end);
    if (!range) return;

    try {
      Editor.point(editor, range.anchor);
      Editor.point(editor, range.focus);
      const isCollapsed = Range.isCollapsed(range);
      if ((start < end && isCollapsed) || (start === end && !isCollapsed)) return;

      processed.push({
        ...comment,
        id: uuidv4(),
        rangeRef: Editor.rangeRef(editor, range),
        original_global_highlight_start: start,
        original_global_highlight_end: end,
      });
    } catch {
      return;
    }
  });

  return processed.sort(
    (first, second) => first.global_highlight_start - second.global_highlight_start,
  );
};
