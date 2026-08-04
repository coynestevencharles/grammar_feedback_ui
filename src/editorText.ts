import type { Path, Point, TRange, Value } from 'platejs';
import type { PlateEditor } from 'platejs/react';

import { NodeApi, RangeApi } from 'platejs';

export const serializeEditorDocument = (nodes: Value): string =>
  nodes.map((node) => NodeApi.string(node)).join('\n');

const codePointOffsetToCodeUnitOffset = (text: string, offset: number): number | null => {
  if (!Number.isInteger(offset) || offset < 0) return null;
  const codePoints = Array.from(text);
  if (offset > codePoints.length) return null;
  return codePoints.slice(0, offset).join('').length;
};

const codeUnitOffsetToPoint = (editor: PlateEditor, offset: number): Point | null => {
  let currentOffset = 0;

  for (let blockIndex = 0; blockIndex < editor.children.length; blockIndex += 1) {
    const block = editor.children[blockIndex];
    const textEntries = Array.from(NodeApi.texts(block));

    for (const [textNode, relativePath] of textEntries) {
      const textEnd = currentOffset + textNode.text.length;
      if (offset <= textEnd) {
        return {
          path: [blockIndex, ...relativePath] as Path,
          offset: offset - currentOffset,
        };
      }
      currentOffset = textEnd;
    }

    if (blockIndex < editor.children.length - 1) {
      currentOffset += 1;
      if (offset === currentOffset) {
        return editor.api.start([blockIndex + 1]) ?? null;
      }
    }
  }

  return null;
};

export const apiOffsetsToRange = (
  editor: PlateEditor,
  exactSubmittedText: string,
  start: number,
  end: number,
): TRange | null => {
  if (start > end) return null;

  const startCodeUnit = codePointOffsetToCodeUnitOffset(exactSubmittedText, start);
  const endCodeUnit = codePointOffsetToCodeUnitOffset(exactSubmittedText, end);
  if (startCodeUnit === null || endCodeUnit === null) return null;

  const anchor = codeUnitOffsetToPoint(editor, startCodeUnit);
  const focus = codeUnitOffsetToPoint(editor, endCodeUnit);
  if (!anchor || !focus) return null;

  const range = { anchor, focus };
  if (RangeApi.isBackward(range)) return null;
  if (start < end && RangeApi.isCollapsed(range)) return null;
  if (start === end && !RangeApi.isCollapsed(range)) return null;
  return range;
};
