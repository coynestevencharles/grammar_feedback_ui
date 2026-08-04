import type { Value } from 'platejs';

import { getCommentKey } from '@platejs/comment';
import { describe, expect, test, vi } from 'vitest';

import { createGrammarFeedbackEditor } from '@/components/editor/editor-kit';
import { commentPlugin } from '@/components/editor/plugins/comment-kit';
import {
  attachFeedbackResponse,
  dismissFeedback,
  replaceFeedbackResponse,
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
    expect(editor.getOption(commentPlugin, 'feedbackSelectionMetadata')).toEqual({
      [id]: { index: 0, spanLength: 2 },
    });
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
    expect(editor.getOption(commentPlugin, 'feedbackSelectionMetadata')).toEqual({
      [second!.id]: { index: 1, spanLength: 7 },
    });
  });

  test('replaces all attached Plate comment marks after a later response', () => {
    const source = 'She go home.';
    const editor = createGrammarFeedbackEditor([paragraph(source)]);
    const previousDiscussions = attachFeedbackResponse(
      editor,
      source,
      responseFor([feedbackFor(source, 4, 6, 0), feedbackFor(source, 4, 11, 1)]),
    );

    const nextResponse = {
      ...responseFor([feedbackFor(source, 7, 11, 2)]),
      response_id: '11111111-1111-4111-8111-111111111111',
    };
    const nextDiscussions = replaceFeedbackResponse(editor, source, nextResponse);

    for (const discussion of previousDiscussions) {
      expect(editor.getApi(commentPlugin).comment.has({ id: discussion.id })).toBe(false);
    }
    expect(nextDiscussions).toHaveLength(1);
    expect(editor.getApi(commentPlugin).comment.has({ id: nextDiscussions[0]!.id })).toBe(true);
    expect(editor.getOption(commentPlugin, 'feedbackSelectionMetadata')).toEqual({
      [nextDiscussions[0]!.id]: { index: 2, spanLength: 4 },
    });
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

  test('propagates unexpected Plate transform failures with redacted diagnostics', () => {
    const source = 'Private synthetic source.';
    const editor = createGrammarFeedbackEditor([paragraph(source)]);
    const [existingDiscussion] = attachFeedbackResponse(
      editor,
      source,
      responseFor([feedbackFor(source, 8, 17, 0)]),
    );
    const existingMetadata = editor.getOption(commentPlugin, 'feedbackSelectionMetadata');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(editor.tf, 'setNodes').mockImplementation(() => {
      throw new Error(`transform failed for ${source}`);
    });

    expect(() =>
      attachFeedbackResponse(editor, source, {
        ...responseFor([feedbackFor(source, 0, 7)]),
        response_id: '11111111-1111-4111-8111-111111111111',
      }),
    ).toThrow('Feedback annotations could not be displayed.');

    expect(error).toHaveBeenCalledTimes(1);
    const diagnostics = JSON.stringify(error.mock.calls);
    expect(diagnostics).toContain('feedback_annotation_failed');
    expect(diagnostics).not.toContain(source);
    expect(editor.getOption(commentPlugin, 'feedbackSelectionMetadata')).toEqual(existingMetadata);
    expect(editor.getApi(commentPlugin).comment.has({ id: existingDiscussion!.id })).toBe(true);
    error.mockRestore();
  });

  test('maps a combining-character annotation across a multiline Plate document', () => {
    const firstLine = 'Cafe\u0301.';
    const secondLine = 'Next line.';
    const source = `${firstLine}\n${secondLine}`;
    const editor = createGrammarFeedbackEditor([paragraph(firstLine), paragraph(secondLine)]);

    const discussions = attachFeedbackResponse(
      editor,
      source,
      responseFor([feedbackFor(source, 3, 5)]),
    );

    expect(discussions).toEqual([expect.objectContaining({ highlight_text: 'e\u0301' })]);
    expect(editor.getApi(commentPlugin).comment.has({ id: discussions[0]!.id })).toBe(true);
  });
});
