export type FeedbackSelectionMetadata = {
  index: number;
  spanLength: number;
};

export type FeedbackSelectionMetadataById = Readonly<Record<string, FeedbackSelectionMetadata>>;

export const selectFeedbackId = (
  ids: readonly string[],
  metadataById: FeedbackSelectionMetadataById,
): string | null => {
  if (ids.length === 0) return null;

  const candidates = ids.map((id, markOrder) => ({
    id,
    markOrder,
    metadata: metadataById[id],
  }));

  if (
    candidates.some(
      ({ metadata }) =>
        metadata === undefined ||
        !Number.isFinite(metadata.index) ||
        !Number.isFinite(metadata.spanLength),
    )
  ) {
    return ids[0] ?? null;
  }

  candidates.sort((left, right) => {
    const spanDifference = left.metadata!.spanLength - right.metadata!.spanLength;
    if (spanDifference !== 0) return spanDifference;

    const indexDifference = left.metadata!.index - right.metadata!.index;
    if (indexDifference !== 0) return indexDifference;

    return left.markOrder - right.markOrder;
  });

  return candidates[0]?.id ?? null;
};
