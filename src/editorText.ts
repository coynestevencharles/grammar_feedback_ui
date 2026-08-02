import { Descendant, Editor, Node as SlateNode, Path, Point, Range } from 'slate';

export const serializeEditorDocument = (nodes: Descendant[]): string =>
  nodes.map((node) => SlateNode.string(node)).join('\n');

const codePointOffsetToCodeUnitOffset = (text: string, offset: number): number | null => {
  if (!Number.isInteger(offset) || offset < 0) return null;
  const codePoints = Array.from(text);
  if (offset > codePoints.length) return null;
  return codePoints.slice(0, offset).join('').length;
};

const codeUnitOffsetToPoint = (editor: Editor, offset: number): Point | null => {
  let currentOffset = 0;

  for (let blockIndex = 0; blockIndex < editor.children.length; blockIndex += 1) {
    const block = editor.children[blockIndex];
    const textEntries = Array.from(SlateNode.texts(block));

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
        return Editor.start(editor, [blockIndex + 1]);
      }
    }
  }

  return null;
};

export const apiOffsetsToRange = (
  editor: Editor,
  exactSubmittedText: string,
  start: number,
  end: number,
): Range | null => {
  if (start > end) return null;

  const startCodeUnit = codePointOffsetToCodeUnitOffset(exactSubmittedText, start);
  const endCodeUnit = codePointOffsetToCodeUnitOffset(exactSubmittedText, end);
  if (startCodeUnit === null || endCodeUnit === null) return null;

  const anchor = codeUnitOffsetToPoint(editor, startCodeUnit);
  const focus = codeUnitOffsetToPoint(editor, endCodeUnit);
  if (!anchor || !focus) return null;

  const range = { anchor, focus };
  if (Range.isBackward(range)) return null;
  if (start < end && Range.isCollapsed(range)) return null;
  if (start === end && !Range.isCollapsed(range)) return null;
  return range;
};
