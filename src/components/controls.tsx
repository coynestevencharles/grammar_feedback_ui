import type { FeedbackSystem } from '@/types/api';

import { Button } from '@/components/ui/button';

type ControlsProps = {
  draftNumber: number;
  maxDrafts: number;
  isLoading: boolean;
  error: string | null;
  handleSubmit: () => void;
  systemChoice: FeedbackSystem;
  setSystemChoice: (value: FeedbackSystem) => void;
};

const Controls = ({
  draftNumber,
  maxDrafts,
  isLoading,
  error,
  handleSubmit,
  systemChoice,
  setSystemChoice,
}: ControlsProps) => {
  return (
    <section className="border-b bg-background" aria-label="Draft controls">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          {draftNumber > maxDrafts ? (
            <p className="min-w-28 text-sm font-medium text-brand">
              Final Draft: No further feedback will be generated.
            </p>
          ) : (
            <p className="min-w-28 text-sm font-medium">
              Draft: {draftNumber} / {maxDrafts}
            </p>
          )}
          <Button
            type="button"
            size="lg"
            className="min-h-11"
            onClick={handleSubmit}
            disabled={isLoading || draftNumber > maxDrafts}
          >
            {isLoading
              ? 'Checking...'
              : draftNumber > maxDrafts
                ? 'Submit'
                : `Submit Draft ${draftNumber}`}
          </Button>
        </div>

        <fieldset className="flex min-w-0 flex-wrap items-center gap-2">
          <legend className="mb-1 w-full text-xs font-medium text-muted-foreground sm:mr-1 sm:mb-0 sm:w-auto">
            Feedback system
          </legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition-colors has-checked:border-brand has-checked:bg-brand/10">
            <input
              type="radio"
              name="system_choice"
              value="rule-based"
              checked={systemChoice === 'rule-based'}
              onChange={() => setSystemChoice('rule-based')}
              className="size-4 accent-brand"
            />
            Rule-based
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition-colors has-checked:border-brand has-checked:bg-brand/10">
            <input
              type="radio"
              name="system_choice"
              value="llm-based"
              checked={systemChoice === 'llm-based'}
              onChange={() => setSystemChoice('llm-based')}
              className="size-4 accent-brand"
            />
            LLM-based*
          </label>
          <span className="text-xs text-muted-foreground">* Usage limits apply.</span>
        </fieldset>

        {error && (
          <p
            className="w-full rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm font-medium text-destructive lg:order-last"
            role="alert"
          >
            Error: {error}
          </p>
        )}
      </div>
    </section>
  );
};

export default Controls;
