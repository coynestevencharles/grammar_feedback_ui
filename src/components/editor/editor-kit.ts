import type { Value } from 'platejs';

import { createPlateEditor, ParagraphPlugin, usePlateEditor } from 'platejs/react';

import { CommentKit } from '@/components/editor/plugins/comment-kit';

export const initialEditorValue: Value = [{ type: 'paragraph', children: [{ text: '' }] }];

export const grammarFeedbackPlugins = [
  ParagraphPlugin.configure({ node: { type: 'paragraph' } }),
  ...CommentKit,
];

export const createGrammarFeedbackEditor = (value: Value = initialEditorValue) =>
  createPlateEditor({ plugins: grammarFeedbackPlugins, value });

export const useGrammarFeedbackEditor = () =>
  usePlateEditor({ plugins: grammarFeedbackPlugins, value: initialEditorValue });

export type GrammarFeedbackEditor = ReturnType<typeof createGrammarFeedbackEditor>;
