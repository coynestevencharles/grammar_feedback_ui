import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, test, vi } from 'vitest';
import { GrammarFeedbackApplication } from './App';
import {
  createGrammarFeedbackEditor,
  type GrammarFeedbackEditor,
} from './components/editor/editor-kit';
import { appConfig, type AppConfig } from './config';
import { server } from './test/server';
import type { FeedbackComment, FeedbackResponse, UserRequest } from './types/api';

const apiUrl = `${appConfig.apiBaseUrl}/grammar_feedback`;
const pipelinesUrl = `${appConfig.apiBaseUrl}/pipelines`;
const normalConfig: AppConfig = { ...appConfig, demoMode: false };

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

const successfulResponse = (
  feedbackList: FeedbackComment[] = [],
  responseId = '00000000-0000-4000-8000-000000000000',
): FeedbackResponse => ({
  response_id: responseId,
  feedback_list: feedbackList,
  metadata: { system_used: 'errant_templates_v1' },
});

const renderApplication = (config: AppConfig = normalConfig) => {
  const editor = createGrammarFeedbackEditor();
  render(<GrammarFeedbackApplication editor={editor} config={config} />);
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

  test('submits without a pipeline override and turns feedback into a dismissible sidebar item', async () => {
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

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));

    await waitFor(() => {
      expect(receivedRequest).toEqual({
        user_id: 'stable-synthetic-user',
        assignment_id: 'free-writing',
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

  test('leaves pipeline selection to the backend default', async () => {
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

    await waitFor(() => expect(receivedRequest).toBeDefined());
    expect(receivedRequest).not.toHaveProperty('system_choice');
  });

  test('discovers deployed pipelines in demo mode and submits with the chosen pipeline', async () => {
    let receivedRequest: UserRequest | undefined;
    server.use(
      http.get(pipelinesUrl, () =>
        HttpResponse.json({
          default_pipeline: 'errant_templates_v1',
          pipelines: ['errant_templates_v1', 'refine_with_dual_cls_fb_v1'],
        }),
      ),
      http.post(apiUrl, async ({ request }) => {
        receivedRequest = (await request.json()) as UserRequest;
        return HttpResponse.json(successfulResponse());
      }),
    );
    const editor = renderApplication({ ...appConfig, demoMode: true });
    const user = await enterText(editor, 'Synthetic text.');

    const defaultPipeline = await screen.findByRole('radio', {
      name: 'errant_templates_v1',
    });
    const alternatePipeline = screen.getByRole('radio', {
      name: 'refine_with_dual_cls_fb_v1',
    });
    expect(defaultPipeline).toBeChecked();
    expect(alternatePipeline).not.toBeChecked();

    await user.click(alternatePipeline);
    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));

    await waitFor(() => {
      expect(receivedRequest?.system_choice).toBe('refine_with_dual_cls_fb_v1');
    });
    expect(alternatePipeline).toBeChecked();
  });

  test('shows a pipeline discovery error in demo mode', async () => {
    server.use(http.get(pipelinesUrl, () => new HttpResponse(null, { status: 503 })));

    renderApplication({ ...appConfig, demoMode: true });

    expect(
      await screen.findByText('Error: Pipeline request failed with status 503.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit Draft 1' })).toBeDisabled();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  test('shows overlapping feedback one item at a time in backend order', async () => {
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
    expect(screen.getByText('1 of 2')).toBeVisible();
    expect(screen.queryByText('Second synthetic feedback')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next feedback' }));

    expect(await screen.findByText('Second synthetic feedback')).toBeVisible();
    expect(screen.getByText('2 of 2')).toBeVisible();
    expect(screen.queryByText('Synthetic feedback')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous feedback' }));
    expect(await screen.findByText('Synthetic feedback')).toBeVisible();
  });

  test('prioritizes a nested comment over identical broad comments on click and keyboard', async () => {
    const source = 'A B C';
    const firstBroad = {
      ...feedbackFor(source, 0, 5),
      error_tag: 'First broad feedback',
    };
    const secondBroad = {
      ...feedbackFor(source, 0, 5),
      index: 1,
      error_tag: 'Second broad feedback',
    };
    const narrow = {
      ...feedbackFor(source, 2, 3),
      index: 4,
      error_tag: 'Narrow B feedback',
    };
    server.use(
      http.post(apiUrl, () =>
        HttpResponse.json(successfulResponse([firstBroad, secondBroad, narrow])),
      ),
    );
    const editor = renderApplication();
    const user = await enterText(editor, source);

    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));
    expect(await screen.findByText('First broad feedback')).toBeVisible();

    const narrowHighlight = screen.getByRole('button', {
      name: 'Open grammar feedback for "B"',
    });
    await user.click(narrowHighlight);
    expect(await screen.findByText('Narrow B feedback')).toBeVisible();
    expect(screen.getByText('3 of 3')).toBeVisible();

    await user.click(
      screen.getByRole('button', {
        name: 'Open grammar feedback for "A "',
      }),
    );
    expect(await screen.findByText('First broad feedback')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Next feedback' }));
    expect(await screen.findByText('Second broad feedback')).toBeVisible();

    narrowHighlight.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Narrow B feedback')).toBeVisible();
  });

  test('uses response index for partial-overlap ties and sole comments outside the overlap', async () => {
    const source = 'A B C';
    const left = {
      ...feedbackFor(source, 0, 3),
      index: 4,
      error_tag: 'Left feedback',
    };
    const right = {
      ...feedbackFor(source, 2, 5),
      index: 1,
      error_tag: 'Right feedback',
    };
    server.use(http.post(apiUrl, () => HttpResponse.json(successfulResponse([left, right]))));
    const editor = renderApplication();
    const user = await enterText(editor, source);

    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));
    expect(await screen.findByText('Left feedback')).toBeVisible();

    await user.click(
      screen.getByRole('button', {
        name: 'Open grammar feedback for "B"',
      }),
    );
    expect(await screen.findByText('Right feedback')).toBeVisible();

    await user.click(
      screen.getByRole('button', {
        name: 'Open grammar feedback for "A "',
      }),
    );
    expect(await screen.findByText('Left feedback')).toBeVisible();

    await user.click(
      screen.getByRole('button', {
        name: 'Open grammar feedback for " C"',
      }),
    );
    expect(await screen.findByText('Right feedback')).toBeVisible();
  });

  test('selects the matching feedback when a highlight is clicked', async () => {
    const source = 'She go home.';
    const first = feedbackFor(source, 4, 6);
    const second = {
      ...feedbackFor(source, 7, 11),
      index: 1,
      error_tag: 'Home feedback',
      feedback_explanation: 'Feedback for the second highlight.',
    };
    server.use(http.post(apiUrl, () => HttpResponse.json(successfulResponse([first, second]))));
    const editor = renderApplication();
    const user = await enterText(editor, source);

    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));
    expect(await screen.findByText('Synthetic feedback')).toBeVisible();

    await user.click(
      screen.getByRole('button', {
        name: 'Open grammar feedback for "home"',
      }),
    );

    expect(await screen.findByText('Home feedback')).toBeVisible();
    expect(screen.getByText('Feedback for the second highlight.')).toBeVisible();
    expect(screen.getByText('2 of 2')).toBeVisible();
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

  test('replaces existing annotations after a later successful submission', async () => {
    const source = 'She go home.';
    const firstFeedback = feedbackFor(source, 4, 6);
    const secondFeedback = {
      ...feedbackFor(source, 7, 11),
      error_tag: 'Replacement feedback',
      index: 1,
    };
    let requestCount = 0;
    server.use(
      http.post(apiUrl, () => {
        requestCount += 1;
        return requestCount === 1
          ? HttpResponse.json(
              successfulResponse([firstFeedback], '11111111-1111-4111-8111-111111111111'),
            )
          : HttpResponse.json(
              successfulResponse([secondFeedback], '22222222-2222-4222-8222-222222222222'),
            );
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
      await screen.findByRole('button', {
        name: 'Open grammar feedback for "home"',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Open grammar feedback for "go"' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Replacement feedback')).toBeVisible();
  });

  test('retains existing feedback when a later response cannot be annotated', async () => {
    const source = 'She go home.';
    let requestCount = 0;
    server.use(
      http.post(apiUrl, () => {
        requestCount += 1;
        const feedback =
          requestCount === 1 ? feedbackFor(source, 4, 6) : feedbackFor(source, 7, 11);
        return HttpResponse.json(
          successfulResponse(
            [feedback],
            requestCount === 1
              ? '11111111-1111-4111-8111-111111111111'
              : '22222222-2222-4222-8222-222222222222',
          ),
        );
      }),
    );
    const editor = renderApplication();
    const user = await enterText(editor, source);

    await user.click(screen.getByRole('button', { name: 'Submit Draft 1' }));
    const originalHighlight = await screen.findByRole('button', {
      name: 'Open grammar feedback for "go"',
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(editor.tf, 'setNodes').mockImplementation(() => {
      throw new Error('synthetic Plate failure');
    });

    await user.click(screen.getByRole('button', { name: 'Submit Draft 2' }));

    expect(
      await screen.findByText(
        (_, element) =>
          element?.textContent === 'Error: Feedback annotations could not be displayed.',
      ),
    ).toBeVisible();
    expect(originalHighlight).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: 'Open grammar feedback for "home"',
      }),
    ).toBeNull();
    error.mockRestore();
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

    const pendingButton = await screen.findByRole('button', {
      name: 'Checking...',
    });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByLabelText('Essay text')).toHaveAttribute('contenteditable', 'false');
    await user.click(pendingButton);
    expect(requestReceived).toHaveBeenCalledTimes(1);

    releaseRequest();
    expect(
      await screen.findByText((_, element) => element?.textContent === 'Draft: 2 / 3'),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByLabelText('Essay text')).toHaveAttribute('contenteditable', 'true'),
    );
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

  test('allows unlimited submissions without showing draft controls', async () => {
    const submittedDrafts: number[] = [];
    server.use(
      http.post(apiUrl, async ({ request }) => {
        submittedDrafts.push(((await request.json()) as UserRequest).draft_number);
        return HttpResponse.json(successfulResponse());
      }),
    );
    const editor = renderApplication({ ...normalConfig, maxDrafts: null });
    const user = await enterText(editor, 'Synthetic text.');

    expect(screen.queryByText(/Draft:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(submittedDrafts).toEqual([1]));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(submittedDrafts).toEqual([1, 2]));
    expect(screen.queryByText(/Draft:/)).not.toBeInTheDocument();
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
