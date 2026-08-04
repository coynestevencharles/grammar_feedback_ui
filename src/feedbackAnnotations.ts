import type { TCommentText } from 'platejs';
import type { PlateEditor } from 'platejs/react';

import { getCommentKey, getCommentKeyId, getCommentKeys } from '@platejs/comment';
import { KEYS, TextApi } from 'platejs';

import { commentPlugin } from '@/components/editor/plugins/comment-kit';
import { apiOffsetsToRange } from '@/editorText';
import type { FeedbackComment, FeedbackDiscussion, FeedbackResponse } from '@/types/api';

type AnnotationSkipReason =
  'collapsed_range' | 'highlight_mismatch' | 'invalid_bounds' | 'unmappable_range';

const warnSkippedAnnotation = (
  responseId: string,
  feedback: FeedbackComment,
  reason: AnnotationSkipReason,
) => {
  console.warn('feedback_annotation_skipped', {
    end: feedback.global_highlight_end,
    expectedLength: Array.from(feedback.highlight_text).length,
    feedbackIndex: feedback.index,
    reason,
    responseId,
    start: feedback.global_highlight_start,
  });
};

const validateFeedbackRange = (
  submittedText: string,
  feedback: FeedbackComment,
): AnnotationSkipReason | null => {
  const start = feedback.global_highlight_start;
  const end = feedback.global_highlight_end;
  const codePoints = Array.from(submittedText);

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < 0 ||
    start > end ||
    end > codePoints.length
  ) {
    return 'invalid_bounds';
  }

  if (start === end) return 'collapsed_range';
  if (codePoints.slice(start, end).join('') !== feedback.highlight_text) {
    return 'highlight_mismatch';
  }

  return null;
};

export const clearFeedbackAnnotations = (editor: PlateEditor) => {
  const commentNodes = editor.getApi(commentPlugin).comment.nodes({ at: [] });
  const feedbackIds = new Set(
    commentNodes.flatMap(([node]) => getCommentKeys(node).map(getCommentKeyId)),
  );

  for (const feedbackId of feedbackIds) {
    editor.getTransforms(commentPlugin).comment.unsetMark({ id: feedbackId });
  }
};

export const deactivateFeedback = (editor: PlateEditor) => {
  editor.setOption(commentPlugin, 'activeElement', null);
  editor.setOption(commentPlugin, 'activeId', null);
  editor.setOption(commentPlugin, 'activeIds', []);
};

export const dismissFeedback = (editor: PlateEditor, feedbackId: string) => {
  editor.getTransforms(commentPlugin).comment.unsetMark({ id: feedbackId });
};

export const attachFeedbackResponse = (
  editor: PlateEditor,
  submittedText: string,
  response: FeedbackResponse,
): FeedbackDiscussion[] => {
  const discussions: FeedbackDiscussion[] = [];

  for (const feedback of response.feedback_list) {
    const validationFailure = validateFeedbackRange(submittedText, feedback);
    if (validationFailure) {
      warnSkippedAnnotation(response.response_id, feedback, validationFailure);
      continue;
    }

    const range = apiOffsetsToRange(
      editor,
      submittedText,
      feedback.global_highlight_start,
      feedback.global_highlight_end,
    );
    if (!range) {
      warnSkippedAnnotation(response.response_id, feedback, 'unmappable_range');
      continue;
    }

    const id = `${response.response_id}:${feedback.index}`;

    try {
      editor.tf.setNodes<TCommentText>(
        {
          [KEYS.comment]: true,
          [getCommentKey(id)]: true,
        },
        {
          at: range,
          match: TextApi.isText,
          split: true,
        },
      );
      discussions.push({ ...feedback, id });
    } catch {
      warnSkippedAnnotation(response.response_id, feedback, 'unmappable_range');
    }
  }

  return discussions;
};
