import { Button } from '@/components/ui/button';

type ControlsProps = {
  draftNumber: number;
  maxDrafts: number | null;
  isLoading: boolean;
  isLoadingPipelines: boolean;
  error: string | null;
  handleSubmit: () => void;
  pipelineIds: readonly string[] | null;
  selectedPipeline: string | null;
  setSelectedPipeline: (pipelineId: string) => void;
};

const Controls = ({
  draftNumber,
  maxDrafts,
  isLoading,
  isLoadingPipelines,
  error,
  handleSubmit,
  pipelineIds,
  selectedPipeline,
  setSelectedPipeline,
}: ControlsProps) => {
  const hasReachedDraftLimit = maxDrafts !== null && draftNumber > maxDrafts;
  const isPipelineUnavailable =
    pipelineIds !== null && (isLoadingPipelines || selectedPipeline === null);
  const submitLabel =
    maxDrafts === null ? 'Submit' : hasReachedDraftLimit ? 'Submit' : `Submit Draft ${draftNumber}`;

  return (
    <section className="border-b bg-background" aria-label="Draft controls">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          {hasReachedDraftLimit ? (
            <p className="min-w-28 text-sm font-medium text-brand">
              Final Draft: No further feedback will be generated.
            </p>
          ) : maxDrafts !== null ? (
            <p className="min-w-28 text-sm font-medium">
              Draft: {draftNumber} / {maxDrafts}
            </p>
          ) : null}

          <Button
            type="button"
            size="lg"
            className="min-h-11"
            onClick={handleSubmit}
            disabled={isLoading || hasReachedDraftLimit || isPipelineUnavailable}
          >
            {isLoading ? 'Checking...' : submitLabel}
          </Button>
        </div>

        {pipelineIds !== null && (
          <fieldset className="flex min-w-0 flex-wrap items-center gap-2">
            <legend className="mb-1 w-full text-xs font-medium text-muted-foreground sm:mr-1 sm:mb-0 sm:w-auto">
              Feedback pipeline
            </legend>
            {isLoadingPipelines ? (
              <p className="text-sm text-muted-foreground">Loading pipelines…</p>
            ) : (
              pipelineIds.map((pipelineId) => (
                <label
                  key={pipelineId}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition-colors has-checked:border-brand has-checked:bg-brand/10"
                >
                  <input
                    type="radio"
                    name="system_choice"
                    value={pipelineId}
                    checked={selectedPipeline === pipelineId}
                    onChange={() => setSelectedPipeline(pipelineId)}
                    disabled={isLoading || hasReachedDraftLimit}
                    className="size-4 accent-brand"
                  />
                  {pipelineId}
                </label>
              ))
            )}
          </fieldset>
        )}

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
