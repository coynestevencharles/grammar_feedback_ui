'use client';

import type { ExtendConfig, Path } from 'platejs';

import { type BaseCommentConfig, BaseCommentPlugin, getDraftCommentKey } from '@platejs/comment';
import { toTPlatePlugin } from 'platejs/react';

import { CommentLeaf } from '@/components/ui/comment-node';

type CommentConfig = ExtendConfig<
  BaseCommentConfig,
  {
    activeElement: HTMLElement | null;
    activeId: string | null;
    activeIds: string[];
    commentingBlock: Path | null;
    hoverId: string | null;
  }
>;

const getCommentTarget = (target: EventTarget | null, selector: string) => {
  const element =
    target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null;

  return element?.closest(selector) ?? null;
};

export const commentPlugin = toTPlatePlugin<CommentConfig>(BaseCommentPlugin, {
  handlers: {
    onClick: ({ api, event, setOption, type }) => {
      if (!getCommentTarget(event.target, `.slate-${type}`)) {
        setOption('activeElement', null);
        setOption('activeId', null);
        setOption('activeIds', []);
        return;
      }

      const commentEntry = api.comment?.node();
      setOption('activeId', commentEntry ? (api.comment?.nodeId(commentEntry[0]) ?? null) : null);
    },
  },
  options: {
    activeElement: null,
    activeId: null,
    activeIds: [],
    commentingBlock: null,
    hoverId: null,
  },
})
  .extendTransforms(
    ({
      editor,
      setOption,
      tf: {
        comment: { setDraft },
      },
    }) => ({
      setDraft: () => {
        if (editor.api.isCollapsed()) {
          const block = editor.api.block();
          if (!block) return;

          editor.tf.select(block[1]);
        }

        setDraft();
        editor.tf.collapse();
        setOption('activeId', getDraftCommentKey());
        setOption('commentingBlock', editor.selection?.focus.path.slice(0, 1) ?? null);
      },
    }),
  )
  .configure({
    node: { component: CommentLeaf },
  });

export const CommentKit = [commentPlugin];
