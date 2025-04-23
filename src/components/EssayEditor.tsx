import React, { useMemo, useCallback } from 'react';
import { Descendant, Text, Range, Editor, Node as SlateNode, Path, BaseRange } from 'slate';
import { Slate, Editable, ReactEditor, RenderLeafProps } from 'slate-react';
import { ProcessedFeedback } from '../types/api';
import './EssayEditor.css';

interface EssayEditorProps {
    editorInstance: Editor & ReactEditor;
    value: Descendant[];
    onChange: (value: Descendant[]) => void;
    feedbackList: ProcessedFeedback[];
    onHighlightClick: (feedbackId: string, event: React.MouseEvent) => void;
    activeFeedbackId: string | null;
}

type CustomText = {
    text: string;
    feedbackId?: string;
    highlight?: boolean;
    activeHighlight?: boolean;
};
interface FeedbackRange extends BaseRange {
    highlight: boolean;
    feedbackId: string;
    activeHighlight: boolean;
}

const EssayEditor: React.FC<EssayEditorProps> = ({
    editorInstance,
    value,
    onChange,
    feedbackList,
    onHighlightClick,
    activeFeedbackId,
}) => {
    const editor = editorInstance;

    const decorate = useCallback(([node, path]: [SlateNode, Path]): Range[] => {
        const ranges: FeedbackRange[] = [];
        if (!Text.isText(node) || feedbackList.length === 0) {
            return ranges;
        }

        feedbackList.forEach(feedback => {
            const currentRange = feedback.rangeRef?.current;

            if (currentRange) {
                // Check if this text node intersects with the current feedback range
                const intersection = Range.intersection(currentRange, Editor.range(editor, path));

                if (intersection) {
                    // If there's an intersection, create a decoration range
                    ranges.push({
                        ...intersection,
                        highlight: true,
                        feedbackId: feedback.id,
                        activeHighlight: feedback.id === activeFeedbackId,
                    });
                }
            }
        });

        return ranges;
    }, [feedbackList, activeFeedbackId, editor]);

    const renderLeaf = useCallback(({ attributes, children, leaf }: RenderLeafProps) => {
        const customLeaf = leaf as CustomText;

        let styledChildren = children;
        if (customLeaf.highlight) {
            styledChildren = (
                <span
                    className={`highlight ${customLeaf.activeHighlight ? 'active' : ''}`}
                    onClick={(e) => {
                        e.preventDefault();
                        if (customLeaf.feedbackId) {
                            onHighlightClick(customLeaf.feedbackId, e);
                        }
                    }}
                >
                    {children}
                </span>
            );
        }

        return <span {...attributes}>{styledChildren}</span>;
    }, [onHighlightClick]);

    const handleSlateChange = (newValue: Descendant[]) => {
        onChange(newValue);
    };

    const safeInitialValue = useMemo(() => (Array.isArray(value) && value.length > 0 ? value : [{ type: 'paragraph', children: [{ text: '' }] }]), [value]);


    return (
        <Slate
            editor={editor}
            initialValue={safeInitialValue}
            onChange={handleSlateChange}
        >
            <Editable
                className="editable-area"
                decorate={decorate}
                renderLeaf={renderLeaf}
                placeholder="Enter your text..."
                spellCheck={false}
                role="textbox"
                aria-multiline="true"
            />
        </Slate>
    );
};

export default EssayEditor;