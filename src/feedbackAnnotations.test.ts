import type { Value } from 'platejs';

import { getCommentKey } from '@platejs/comment';
import { describe, expect, test, vi } from 'vitest';

import { createGrammarFeedbackEditor } from '@/components/editor/editor-kit';
import { commentPlugin } from '@/components/editor/plugins/comment-kit';
import {
  attachFeedbackResponse,
  clearFeedbackAnnotations,
  dismissFeedback,
} from '@/feedbackAnnotations';
import type { FeedbackComment, FeedbackResponse } from '@/types/api';

const paragraph = (text: string): Value[number] => ({
  type: 'paragraph',
  children: [{ text }],
});

const feedbackFor = (source: string, start: number, end: number, index = 0): FeedbackComment => ({
  index,
  source,
  corrected: source,
  highlight_start: start,
  highlight_end: end,
  highlight_text: Array.from(source).slice(start, end).join(''),
  error_tag: 'Synthetic feedback',
  feedback_explanation: 'Synthetic explanation.',
  feedback_suggestion: 'Synthetic suggestion.',
  global_highlight_start: start,
  global_highlight_end: end,
});

const responseFor = (feedbackList: FeedbackComment[]): FeedbackResponse => ({
  response_id: '00000000-0000-4000-8000-000000000000',
  feedback_list: feedbackList,
  metadata: {},
});

describe('feedback annotations', () => {
  test('attaches a stable Plate comment mark from API offsets', () => {
    const source = 'She go home.';
    const editor = createGrammarFeedbackEditor([paragraph(source)]);

    const discussions = attachFeedbackResponse(
      editor,
      source,
      responseFor([feedbackFor(source, 4, 6)]),
    );

    const id = '00000000-0000-4000-8000-000000000000:0';
    expect(discussions).toEqual([expect.objectContaining({ id, highlight_text: 'go' })]);
    expect(editor.getApi(commentPlugin).comment.has({ id })).toBe(true);
    expect(
      editor
        .getApi(commentPlugin)
        .comment.nodes({ at: [], id })
        .some(([node]) => node[getCommentKey(id)] === true),
    ).toBe(true);
  });

  test('keeps an overlapping annotation when another is dismissed', () => {
    const source = 'She go home.';
    const editor = createGrammarFeedbackEditor([paragraph(source)]);
    const response = responseFor([feedbackFor(source, 4, 6, 0), feedbackFor(source, 4, 11, 1)]);
    const [first, second] = attachFeedbackResponse(editor, source, response);

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    dismissFeedback(editor, first!.id);

    expect(editor.getApi(commentPlugin).comment.has({ id: first!.id })).toBe(false);
    expect(editor.getApi(commentPlugin).comment.has({ id: second!.id })).toBe(true);
  });

  test('clears all attached Plate comment marks', () => {
    const source = 'She go home.';
    const editor = createGrammarFeedbackEditor([paragraph(source)]);
    const discussions = attachFeedbackResponse(
      editor,
      source,
      responseFor([feedbackFor(source, 4, 6, 0), feedbackFor(source, 4, 11, 1)]),
    );

    clearFeedbackAnnotations(editor);

    expect(discussions).toHaveLength(2);
    for (const discussion of discussions) {
      expect(editor.getApi(commentPlugin).comment.has({ id: discussion.id })).toBe(false);
    }
  });

  test('skips mismatched and collapsed ranges with redacted diagnostics', () => {
    const source = 'She go home.';
    const editor = createGrammarFeedbackEditor([paragraph(source)]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mismatch = {
      ...feedbackFor(source, 4, 6, 0),
      highlight_text: 'private mismatch',
    };
    const collapsed = feedbackFor(source, 4, 4, 1);

    const discussions = attachFeedbackResponse(editor, source, responseFor([mismatch, collapsed]));

    expect(discussions).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    const diagnostics = JSON.stringify(warn.mock.calls);
    expect(diagnostics).not.toContain(source);
    expect(diagnostics).not.toContain('private mismatch');
    expect(diagnostics).toContain('highlight_mismatch');
    expect(diagnostics).toContain('collapsed_range');
    warn.mockRestore();
  });
});
