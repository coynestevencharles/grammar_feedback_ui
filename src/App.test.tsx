import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, test, vi } from 'vitest';
import { GrammarFeedbackApplication } from './App';
import {
  createGrammarFeedbackEditor,
  type GrammarFeedbackEditor,
} from './components/editor/editor-kit';
import { server } from './test/server';
import { FeedbackComment, FeedbackResponse, UserRequest } from './types/api';
import { apiBaseUrl } from './utils/constants';

const apiUrl = `${apiBaseUrl}/grammar_feedback`;

const feedbackFor = (
  source: string,
  highlightStart: number,
  highlightEnd: number,
): FeedbackComment => ({
  index: 0,
  source,
  corrected: source,
  highlight_start: highlightStart,
  highlight_end: highlightEnd,
  highlight_text: Array.from(source).slice(highlightStart, highlightEnd).join(''),
  error_tag: 'Synthetic feedback',
  feedback_explanation: 'This is a synthetic explanation.',
  feedback_suggestion: 'This is a synthetic suggestion.',
  global_highlight_start: highlightStart,
  global_highlight_end: highlightEnd,
});

const successfulResponse = (feedbackList: FeedbackComment[] = []): FeedbackResponse => ({
  response_id: '00000000-0000-4000-8000-000000000000',
  feedback_list: feedbackList,
  metadata: { system_used: 'rule-based' },
});

const renderApplication = () => {
  const editor = createGrammarFeedbackEditor();
  render(<GrammarFeedbackApplication editor={editor} />);
  return editor;
};

const enterText = async (editor: GrammarFeedbackEditor, text: string) => {
  const user = userEvent.setup();

  await act(async () => {
    editor.tf.select(editor.api.start([]));
    const lines = text.split('{Enter}');
    for (const [index, line] of lines.entries()) {
      editor.tf.insertText(line);
      if (index < lines.length - 1) {
        editor.tf.insertBreak();
      }
    }
  });
  return user;
};

describe('grammar feedback application', () => {
  test('rejects an empty submission without making an HTTP request', async () => {
    const requestReceived = vi.fn();
    server.use(
      http.post(apiUrl, () => {
        requestReceived();
        return HttpResponse.json(successfulResponse());
      }),
    );
    const user = userEvent.setup();
    renderApplication();

    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));

    expect(
      await screen.findByText('Error: Please enter some text before submitting.'),
    ).toBeVisible();
    expect(requestReceived).not.toHaveBeenCalled();
  });

  test('submits the selected system and turns returned feedback into a dismissible card', async () => {
    localStorage.setItem('user_id', 'stable-synthetic-user');
    let receivedRequest: UserRequest | undefined;
    const source = 'She go home.';
    server.use(
      http.post(apiUrl, async ({ request }) => {
        receivedRequest = (await request.json()) as UserRequest;
        return HttpResponse.json(successfulResponse([feedbackFor(source, 4, 6)]));
      }),
    );
    const editor = renderApplication();
    const user = await enterText(editor, source);

    await user.click(screen.getByRole('radio', { name: 'LLM-based*' }));
    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));

    await waitFor(() => {
      expect(receivedRequest).toEqual({
        user_id: 'stable-synthetic-user',
        system_choice: 'llm-based',
        draft_number: 1,
        text: source,
      });
    });
    expect(
      await screen.findByText((_, element) => element?.textContent === 'Draft: 2 / 3'),
    ).toBeVisible();

    const highlight = await screen.findByRole('button', {
      name: 'Open grammar feedback for "go"',
    });
    highlight.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('This is a synthetic explanation.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('This is a synthetic explanation.')).not.toBeInTheDocument();
  });

  test('submits with the rule-based system by default', async () => {
    let receivedRequest: UserRequest | undefined;
    server.use(
      http.post(apiUrl, async ({ request }) => {
        receivedRequest = (await request.json()) as UserRequest;
        return HttpResponse.json(successfulResponse());
      }),
    );
    const editor = renderApplication();
    const user = await enterText(editor, 'Synthetic text.');

    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));

    await waitFor(() => expect(receivedRequest?.system_choice).toBe('rule-based'));
  });

  test('shows every feedback item attached to an overlapping highlight', async () => {
    const source = 'She go home.';
    const first = feedbackFor(source, 4, 6);
    const second = {
      ...feedbackFor(source, 4, 6),
      index: 1,
      error_tag: 'Second synthetic feedback',
    };
    server.use(http.post(apiUrl, () => HttpResponse.json(successfulResponse([first, second]))));
    const editor = renderApplication();
    const user = await enterText(editor, source);

    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));
    await user.click(
      await screen.findByRole('button', {
        name: 'Open grammar feedback for "go"',
      }),
    );

    expect(await screen.findByText('Synthetic feedback')).toBeVisible();
    expect(screen.getByText('Second synthetic feedback')).toBeVisible();
  });

  test('shows a server detail error and restores the submit button', async () => {
    server.use(
      http.post(apiUrl, () =>
        HttpResponse.json({ detail: 'Synthetic request was rejected.' }, { status: 400 }),
      ),
    );
    const editor = renderApplication();
    const user = await enterText(editor, 'Synthetic text.');

    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));

    expect(
      await screen.findByText(
        (_, element) => element?.textContent === 'Error: Synthetic request was rejected.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit Draft 1' })).toBeEnabled();
  });

  test('shows the HTTP status when a server error is not JSON', async () => {
    server.use(http.post(apiUrl, () => new HttpResponse('Service unavailable', { status: 503 })));
    const editor = renderApplication();
    const user = await enterText(editor, 'Synthetic text.');

    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));

    expect(
      await screen.findByText(
        (_, element) => element?.textContent === 'Error: Request failed with status 503.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit Draft 1' })).toBeEnabled();
  });

  test('shows a network error and restores the submit button', async () => {
    server.use(http.post(apiUrl, () => HttpResponse.error()));
    const editor = renderApplication();
    const user = await enterText(editor, 'Synthetic text.');

    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));

    expect(
      await screen.findByText((_, element) => element?.textContent === 'Error: Network Error'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit Draft 1' })).toBeEnabled();
  });

  test('retains existing feedback when a later submission fails', async () => {
    const source = 'She go home.';
    let requestCount = 0;
    server.use(
      http.post(apiUrl, () => {
        requestCount += 1;
        if (requestCount === 1) {
          return HttpResponse.json(successfulResponse([feedbackFor(source, 4, 6)]));
        }

        return HttpResponse.json({ detail: 'Synthetic request was rejected.' }, { status: 400 });
      }),
    );
    const editor = renderApplication();
    const user = await enterText(editor, source);

    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));
    expect(
      await screen.findByRole('button', {
        name: 'Open grammar feedback for "go"',
      }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Submit Draft 2' }));

    expect(
      await screen.findByText(
        (_, element) => element?.textContent === 'Error: Synthetic request was rejected.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Open grammar feedback for "go"',
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit Draft 2' })).toBeEnabled();
  });

  test('prevents duplicate submissions while feedback is loading', async () => {
    let releaseRequest!: () => void;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    const requestReceived = vi.fn();
    server.use(
      http.post(apiUrl, async () => {
        requestReceived();
        await requestGate;
        return HttpResponse.json(successfulResponse());
      }),
    );
    const editor = renderApplication();
    const user = await enterText(editor, 'Synthetic text.');

    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));

    const pendingButton = await screen.findByRole('button', { name: 'Checking...' });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByLabelText('Essay text')).toHaveAttribute('contenteditable', 'false');
    await user.click(pendingButton);
    expect(requestReceived).toHaveBeenCalledTimes(1);

    releaseRequest();
    expect(
      await screen.findByText((_, element) => element?.textContent === 'Draft: 2 / 3'),
    ).toBeVisible();
    expect(screen.getByLabelText('Essay text')).toHaveAttribute('contenteditable', 'true');
  });

  test('stops accepting submissions after three successful drafts', async () => {
    const submittedDrafts: number[] = [];
    server.use(
      http.post(apiUrl, async ({ request }) => {
        submittedDrafts.push(((await request.json()) as UserRequest).draft_number);
        return HttpResponse.json(successfulResponse());
      }),
    );
    const editor = renderApplication();
    const user = await enterText(editor, 'Synthetic text.');

    for (const draftNumber of [1, 2, 3]) {
      await user.click(screen.getByRole('button', { name: `Submit Draft ${draftNumber}` }));
      if (draftNumber < 3) {
        expect(
          await screen.findByText(
            (_, element) => element?.textContent === `Draft: ${draftNumber + 1} / 3`,
          ),
        ).toBeVisible();
      }
    }

    expect(
      await screen.findByText('Final Draft: No further feedback will be generated.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(submittedDrafts).toEqual([1, 2, 3]);
  });

  test('generates and persists a user ID when none exists', async () => {
    let submittedUserId: string | undefined;
    server.use(
      http.post(apiUrl, async ({ request }) => {
        submittedUserId = ((await request.json()) as UserRequest).user_id;
        return HttpResponse.json(successfulResponse());
      }),
    );
    const editor = renderApplication();
    const user = await enterText(editor, 'Synthetic text.');

    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));

    await waitFor(() => {
      expect(submittedUserId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });
    expect(localStorage.getItem('user_id')).toBe(submittedUserId);
  });

  test('serializes separate editor lines with a newline', async () => {
    let submittedText: string | undefined;
    server.use(
      http.post(apiUrl, async ({ request }) => {
        submittedText = ((await request.json()) as UserRequest).text;
        return HttpResponse.json(successfulResponse());
      }),
    );
    const editor = renderApplication();
    const user = await enterText(editor, 'First line{Enter}Second line');

    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));

    await waitFor(() => expect(submittedText).toBe('First line\nSecond line'));
  });

  test('maps accented-text offsets and ignores invalid feedback ranges', async () => {
    const source = '😀 Café are busy.';
    const validFeedback = feedbackFor(source, 7, 10);
    const invalidFeedback = [
      { ...feedbackFor(source, 11, 15), global_highlight_start: -1 },
      {
        ...feedbackFor(source, 11, 15),
        global_highlight_start: 15,
        global_highlight_end: 11,
      },
      {
        ...feedbackFor(source, 11, 15),
        global_highlight_start: 11,
        global_highlight_end: 99,
      },
    ];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    server.use(
      http.post(apiUrl, () =>
        HttpResponse.json(successfulResponse([validFeedback, ...invalidFeedback])),
      ),
    );
    const editorModel = renderApplication();
    const user = await enterText(editorModel, source);

    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));

    const editor = screen.getByRole('textbox');
    const highlight = await within(editor).findByRole('button', {
      name: 'Open grammar feedback for "are"',
    });
    await user.click(highlight);
    expect(await screen.findByText('This is a synthetic explanation.')).toBeVisible();
    expect(within(editor).getAllByRole('button', { name: /Open grammar feedback/ })).toHaveLength(
      1,
    );
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});
