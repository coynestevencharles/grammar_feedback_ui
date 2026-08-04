import type { TCommentText } from 'platejs';
import type { PlateLeafProps } from 'platejs/react';

import { getCommentCount, getCommentKeyId, getCommentKeys } from '@platejs/comment';
import { PathApi, TextApi } from 'platejs';
import { PlateLeaf, useEditorPlugin, usePluginOption } from 'platejs/react';

import { cn } from '@/lib/utils';
import { commentPlugin } from '@/components/editor/plugins/comment-kit';
import { selectFeedbackId } from '@/feedbackSelection';

export function CommentLeaf(props: PlateLeafProps<TCommentText>) {
  const { children, leaf } = props;

  const { api, editor, setOption } = useEditorPlugin(commentPlugin);
  const hoverId = usePluginOption(commentPlugin, 'hoverId');
  const activeId = usePluginOption(commentPlugin, 'activeId');
  const feedbackSelectionMetadata = usePluginOption(commentPlugin, 'feedbackSelectionMetadata');

  const isOverlapping = getCommentCount(leaf) > 1;
  const currentId = api.comment.nodeId(leaf);
  const ids = getCommentKeys(leaf).map(getCommentKeyId);
  const isActive = activeId !== null && ids.includes(activeId);
  const isHover = hoverId === currentId;
  const path = editor.api.findPath(props.text);
  const previousText = path
    ? editor.api.previous<TCommentText>({ at: path, match: TextApi.isText })
    : undefined;
  const nextText = path
    ? editor.api.next<TCommentText>({ at: path, match: TextApi.isText })
    : undefined;

  const continuesActiveHighlight = (entry: typeof previousText) =>
    activeId !== null &&
    path !== undefined &&
    entry !== undefined &&
    PathApi.equals(path.slice(0, -1), entry[1].slice(0, -1)) &&
    getCommentKeys(entry[0]).map(getCommentKeyId).includes(activeId);

  const activate = () => {
    setOption('activeId', selectFeedbackId(ids, feedbackSelectionMetadata));
  };

  return (
    <PlateLeaf
      {...props}
      className={cn(
        'box-decoration-clone rounded-[0.18em] border-b-2 border-b-highlight/[.36] bg-highlight/[.13] transition-[background-color,border-color,outline-color] duration-200',
        isHover && 'border-b-highlight bg-highlight/25',
        isOverlapping && 'border-b-2 border-b-highlight/[.7] bg-highlight/25',
        isHover && isOverlapping && 'border-b-highlight bg-highlight/45',
        isActive && 'feedback-highlight-active relative z-10',
      )}
      attributes={{
        ...props.attributes,
        'aria-controls': 'feedback-panel',
        'aria-label': `Open grammar feedback for "${leaf.text}"`,
        'aria-pressed': isActive,
        'data-feedback-ids': ids.join(' '),
        'data-feedback-segment-end':
          isActive && !continuesActiveHighlight(nextText) ? 'true' : undefined,
        'data-feedback-segment-start':
          isActive && !continuesActiveHighlight(previousText) ? 'true' : undefined,
        onClick: activate,
        onKeyDown: (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;

          event.preventDefault();
          event.stopPropagation();
          activate();
        },
        onMouseEnter: () => setOption('hoverId', currentId ?? null),
        onMouseLeave: () => setOption('hoverId', null),
        role: 'button',
        tabIndex: 0,
      }}
    >
      {children}
    </PlateLeaf>
  );
}
