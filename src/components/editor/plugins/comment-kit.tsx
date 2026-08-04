import type { ExtendConfig } from 'platejs';

import { type BaseCommentConfig, BaseCommentPlugin } from '@platejs/comment';
import { toTPlatePlugin } from 'platejs/react';

import { CommentLeaf } from '@/components/ui/comment-node';

type CommentConfig = ExtendConfig<
  BaseCommentConfig,
  {
    activeId: string | null;
    hoverId: string | null;
  }
>;

export const commentPlugin = toTPlatePlugin<CommentConfig>(BaseCommentPlugin, {
  options: {
    activeId: null,
    hoverId: null,
  },
}).configure({
  node: { component: CommentLeaf },
});

export const CommentKit = [commentPlugin];
