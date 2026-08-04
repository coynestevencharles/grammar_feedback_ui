import type { Value } from 'platejs';

import { describe, expect, test } from 'vitest';
import { createGrammarFeedbackEditor } from './components/editor/editor-kit';
import { apiOffsetsToRange, serializeEditorDocument } from './editorText';

const paragraph = (...texts: string[]): Value[number] => ({
  type: 'paragraph',
  children: texts.map((text) => ({ text })),
});

describe('editor text contract', () => {
  test('serializes adjacent leaves without separators and top-level blocks with newlines', () => {
    expect(
      serializeEditorDocument([paragraph('Café ', 'is busy.'), paragraph('Second ', 'line.')]),
    ).toBe('Café is busy.\nSecond line.');
  });

  test('maps API code-point offsets across accented and non-BMP text', () => {
    const editor = createGrammarFeedbackEditor([paragraph('😀 Café are busy.')]);
    const text = serializeEditorDocument(editor.children);

    expect(apiOffsetsToRange(editor, text, 7, 10)).toEqual({
      anchor: { path: [0, 0], offset: 8 },
      focus: { path: [0, 0], offset: 11 },
    });
  });

  test('maps offsets onto the second top-level block after the serialized newline', () => {
    const editor = createGrammarFeedbackEditor([paragraph('First line'), paragraph('Second line')]);
    const text = serializeEditorDocument(editor.children);

    expect(apiOffsetsToRange(editor, text, 11, 17)).toEqual({
      anchor: { path: [1, 0], offset: 0 },
      focus: { path: [1, 0], offset: 6 },
    });
  });

  test.each([
    [-1, 2],
    [3, 2],
    [0, 99],
  ])('rejects invalid API range %s..%s', (start, end) => {
    const editor = createGrammarFeedbackEditor([paragraph('Text')]);

    expect(apiOffsetsToRange(editor, 'Text', start, end)).toBeNull();
  });
});
