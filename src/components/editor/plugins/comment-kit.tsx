import type { ExtendConfig } from 'platejs';

import { type BaseCommentConfig, BaseCommentPlugin } from '@platejs/comment';
import { toTPlatePlugin } from 'platejs/react';

import { CommentLeaf } from '@/components/ui/comment-node';
import type { FeedbackSelectionMetadataById } from '@/feedbackSelection';

type CommentConfig = ExtendConfig<
  BaseCommentConfig,
  {
    activeId: string | null;
    feedbackSelectionMetadata: FeedbackSelectionMetadataById;
    hoverId: string | null;
  }
>;

export const commentPlugin = toTPlatePlugin<CommentConfig>(BaseCommentPlugin, {
  options: {
    activeId: null,
    feedbackSelectionMetadata: {},
    hoverId: null,
  },
}).configure({
  node: { component: CommentLeaf },
});

export const CommentKit = [commentPlugin];
