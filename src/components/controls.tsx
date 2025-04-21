import React from 'react';
import './controls.css';

type ControlsProps = {
    draftNumber: number;
    maxDrafts: number;
    isLoading: boolean;
    error: string | null;
    handleSubmit: () => void;
    systemChoice: string;
    setSystemChoice: (value: string) => void;
};

const Controls: React.FC<ControlsProps> = ({
    draftNumber,
    maxDrafts,
    isLoading,
    error,
    handleSubmit,
    systemChoice,
    setSystemChoice,
}) => {
    return (
        <div className="controls-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '2rem' }}>
            <div className="submission-controls" style={{ flex: 1 }}>
                {draftNumber > maxDrafts ? (
                    <p className="final-draft-notice">Final Draft: No further feedback will be generated.</p>
                ) : (
                    <p>Draft: {draftNumber} / {maxDrafts}</p>
                )}
                <button
                    onClick={handleSubmit}
                    disabled={isLoading || draftNumber > maxDrafts}
                >
                    {isLoading
                        ? 'Checking...'
                        : draftNumber > maxDrafts
                            ? 'Submit'
                            : `Submit Draft ${draftNumber}`}
                </button>
                {error && <p className="error-message">Error: {error}</p>}
            </div>
            <div className="system-controls" style={{ flex: 1 }}>
                <fieldset>
                    <legend>Choose Feedback System:</legend>
                    <label style={{ marginRight: '1em' }}>
                        <input
                            type="radio"
                            name="system_choice"
                            value="rule-based"
                            checked={systemChoice === 'rule-based'}
                            onChange={() => {
                                setSystemChoice('rule-based');
                                console.log("rule-based selected; current systemChoice:", 'rule-based');
                            }}
                        />
                        Rule-based
                    </label>
                    <label>
                        <input
                            type="radio"
                            name="system_choice"
                            value="llm-based"
                            checked={systemChoice === 'llm-based'}
                            onChange={() => {
                                setSystemChoice('llm-based');
                                console.log("llm-based selected; current systemChoice:", 'llm-based');
                            }}
                        />
                        LLM-based*
                    </label>
                    <p className="note">* Usage limits apply.</p>
                </fieldset>
            </div>
        </div>
    );
};

export default Controls;
