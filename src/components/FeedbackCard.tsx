import React, { useRef, useEffect } from 'react';
import { ProcessedFeedback } from '../types/api';
import {
    offset,
    flip,
    shift,
    autoUpdate,
    computePosition,
    Placement
} from '@floating-ui/react-dom';
import './FeedbackCard.css';

interface FeedbackCardProps {
    feedback: ProcessedFeedback;
    onDismiss: () => void;
    referenceElement: HTMLElement | null;
    onClickOutside: () => void;
}

const FeedbackCard: React.FC<FeedbackCardProps> = ({
    feedback,
    onDismiss,
    referenceElement,
    onClickOutside
}) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = React.useState({ x: 0, y: 0 });
    const [strategy, setStrategy] = React.useState<'absolute' | 'fixed'>('absolute');

    useEffect(() => {
        if (!referenceElement || !cardRef.current) return;

        const updatePosition = async () => {
            const placement: Placement = 'bottom-start';

            const computedPosition = await computePosition(referenceElement, cardRef.current!, {
                placement,
                middleware: [
                    offset(10),
                    flip(),
                    shift({ padding: 10 })
                ]
            });

            setPosition({ x: computedPosition.x, y: computedPosition.y });
            setStrategy(computedPosition.strategy);
        };

        updatePosition();

        const cleanup = autoUpdate(
            referenceElement,
            cardRef.current!,
            updatePosition
        );

        return cleanup;
    }, [referenceElement]);

    // Handle click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                cardRef.current &&
                !cardRef.current.contains(event.target as Node) &&
                // Prevent triggering when clicking the highlight itself
                referenceElement && !referenceElement.contains(event.target as Node)
            ) {
                onClickOutside();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClickOutside, referenceElement]);

    return (
        <div
            ref={cardRef}
            className="feedback-card"
            style={{
                position: strategy,
                top: position.y,
                left: position.x,
                zIndex: 10,
                width: '300px'
            }}
        >
            <div className="feedback-tag">{feedback.error_tag}</div>
            <div className="feedback-section">
                <strong>What's Wrong?</strong>
                <p>{feedback.feedback_explanation}</p>
            </div>
            <div className="feedback-section">
                <strong>What to do:</strong>
                <p>{feedback.feedback_suggestion}</p>
            </div>
            <button className="dismiss-button" onClick={onDismiss}>
                Dismiss
            </button>
        </div>
    );
};

export default FeedbackCard;