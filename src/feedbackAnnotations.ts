import type { TCommentText } from 'platejs';
import type { PlateEditor } from 'platejs/react';

import { getCommentKey, getCommentKeyId, getCommentKeys } from '@platejs/comment';
import { KEYS, TextApi } from 'platejs';

import { commentPlugin } from '@/components/editor/plugins/comment-kit';
import { apiOffsetsToRange } from '@/editorText';
import type { FeedbackSelectionMetadataById } from '@/feedbackSelection';
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

const getFeedbackIds = (editor: PlateEditor) => {
  const commentNodes = editor.getApi(commentPlugin).comment.nodes({ at: [] });
  return new Set(commentNodes.flatMap(([node]) => getCommentKeys(node).map(getCommentKeyId)));
};

export const deactivateFeedback = (editor: PlateEditor) => {
  editor.setOption(commentPlugin, 'activeId', null);
};

export const dismissFeedback = (editor: PlateEditor, feedbackId: string) => {
  editor.getTransforms(commentPlugin).comment.unsetMark({ id: feedbackId });

  const currentMetadata = editor.getOption(commentPlugin, 'feedbackSelectionMetadata');
  const remainingMetadata = { ...currentMetadata };
  delete remainingMetadata[feedbackId];
  editor.setOption(commentPlugin, 'feedbackSelectionMetadata', remainingMetadata);
};

export const attachFeedbackResponse = (
  editor: PlateEditor,
  submittedText: string,
  response: FeedbackResponse,
): FeedbackDiscussion[] => {
  const discussions: FeedbackDiscussion[] = [];
  const appliedIds: string[] = [];

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
      appliedIds.push(id);
      discussions.push({ ...feedback, id });
    } catch {
      for (const appliedId of [...appliedIds, id]) {
        try {
          dismissFeedback(editor, appliedId);
        } catch {
          // Preserve the original failure while making a best-effort rollback.
        }
      }

      console.error('feedback_annotation_failed', {
        feedbackIndex: feedback.index,
        responseId: response.response_id,
      });
      throw new Error('Feedback annotations could not be displayed.');
    }
  }

  const currentMetadata = editor.getOption(commentPlugin, 'feedbackSelectionMetadata');
  const attachedMetadata = Object.fromEntries(
    discussions.map((discussion) => [
      discussion.id,
      {
        index: discussion.index,
        spanLength: discussion.global_highlight_end - discussion.global_highlight_start,
      },
    ]),
  ) as FeedbackSelectionMetadataById;
  editor.setOption(commentPlugin, 'feedbackSelectionMetadata', {
    ...currentMetadata,
    ...attachedMetadata,
  });

  return discussions;
};

export const replaceFeedbackResponse = (
  editor: PlateEditor,
  submittedText: string,
  response: FeedbackResponse,
): FeedbackDiscussion[] => {
  const previousIds = getFeedbackIds(editor);
  const discussions = attachFeedbackResponse(editor, submittedText, response);

  for (const previousId of previousIds) {
    dismissFeedback(editor, previousId);
  }

  return discussions;
};
