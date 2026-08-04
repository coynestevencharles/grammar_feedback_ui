import { describe, expect, test } from 'vitest';

import { selectFeedbackId, type FeedbackSelectionMetadataById } from '@/feedbackSelection';

const metadata = (
  entries: Array<[id: string, spanLength: number, index: number]>,
): FeedbackSelectionMetadataById =>
  Object.fromEntries(entries.map(([id, spanLength, index]) => [id, { index, spanLength }]));

describe('feedback click selection', () => {
  test('prioritizes the narrowest span regardless of response index', () => {
    expect(
      selectFeedbackId(
        ['broad', 'narrow'],
        metadata([
          ['broad', 5, 0],
          ['narrow', 1, 4],
        ]),
      ),
    ).toBe('narrow');
  });

  test('uses numeric response index for identical and partial-overlap ties', () => {
    const candidates = metadata([
      ['left', 3, 4],
      ['right', 3, 1],
      ['later-gap', 3, 7],
    ]);

    expect(selectFeedbackId(['left', 'right'], candidates)).toBe('right');
    expect(selectFeedbackId(['later-gap', 'left', 'right'], candidates)).toBe('right');
  });

  test('does not require response indices to be contiguous', () => {
    expect(
      selectFeedbackId(
        ['four', 'zero'],
        metadata([
          ['four', 3, 4],
          ['zero', 3, 0],
        ]),
      ),
    ).toBe('zero');
  });

  test('preserves leaf mark order for duplicate indices or missing metadata', () => {
    expect(
      selectFeedbackId(
        ['first', 'second'],
        metadata([
          ['first', 3, 1],
          ['second', 3, 1],
        ]),
      ),
    ).toBe('first');
    expect(selectFeedbackId(['unregistered', 'registered'], metadata([['registered', 1, 0]]))).toBe(
      'unregistered',
    );
  });
});
