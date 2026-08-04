import { expect, test, type Page } from '@playwright/test';

const feedbackResponse = {
  response_id: '00000000-0000-4000-8000-000000000000',
  feedback_list: [
    {
      index: 0,
      source: 'First line',
      corrected: 'Opening line',
      highlight_start: 0,
      highlight_end: 5,
      highlight_text: 'First',
      error_tag: 'Opening wording',
      feedback_explanation: 'This feedback belongs to the first highlight.',
      feedback_suggestion: 'Consider a more specific opening.',
      global_highlight_start: 0,
      global_highlight_end: 5,
    },
    {
      index: 1,
      source: 'Second line',
      corrected: 'Improved line',
      highlight_start: 0,
      highlight_end: 6,
      highlight_text: 'Second',
      error_tag: 'Synthetic feedback',
      feedback_explanation:
        'This deliberately long feedback explanation exercises the independently scrolling middle of the feedback holder. '.repeat(
          10,
        ),
      feedback_suggestion: 'Revise the highlighted text.',
      global_highlight_start: 11,
      global_highlight_end: 17,
    },
    {
      index: 2,
      source: 'Second line',
      corrected: 'Alternative line',
      highlight_start: 0,
      highlight_end: 6,
      highlight_text: 'Second',
      error_tag: 'Overlapping feedback',
      feedback_explanation: 'This second item deliberately overlaps the same highlight.',
      feedback_suggestion: 'Compare both observations before revising.',
      global_highlight_start: 11,
      global_highlight_end: 17,
    },
  ],
  metadata: { system_used: 'llm-based' },
};

const mockFeedbackRequest = async (page: Page) => {
  let requestBody: Record<string, unknown> | undefined;

  await page.route('http://localhost:8000/grammar_feedback', async (route) => {
    requestBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(feedbackResponse),
    });
  });

  return () => requestBody;
};

const enterAndSubmitDraft = async (page: Page) => {
  const editor = page.getByRole('textbox', { name: 'Essay text' });
  await editor.click();
  await page.keyboard.type('First line');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second line');
  await page.getByRole('radio', { name: 'LLM-based*' }).check();
  await page.getByRole('button', { name: 'Submit Draft 1' }).click();
  await expect(page.getByText('Draft: 2 / 3')).toBeVisible();
};

test('desktop keeps one selected comment in a sidebar and navigates its highlights', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  const getRequestBody = await mockFeedbackRequest(page);
  await page.goto('/');
  await enterAndSubmitDraft(page);

  expect(getRequestBody()).toMatchObject({
    system_choice: 'llm-based',
    draft_number: 1,
    text: 'First line\nSecond line',
  });
  expect(getRequestBody()?.user_id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );

  const editor = page.getByRole('textbox', { name: 'Essay text' });
  const editorContainer = page.locator('[data-feedback-scroll-container]');
  const sidebar = page.getByRole('complementary', { name: 'Feedback details' });
  await expect(sidebar).toBeVisible();
  await expect(page.getByText('Opening wording')).toBeVisible();
  await expect(page.getByText('1 of 3')).toBeVisible();
  await expect(page.getByText('Synthetic feedback')).not.toBeVisible();
  expect(await sidebar.evaluate((element) => getComputedStyle(element).position)).toBe('static');

  const editorBox = await editor.boundingBox();
  const sidebarBox = await sidebar.boundingBox();
  expect(editorBox).not.toBeNull();
  expect(sidebarBox).not.toBeNull();
  expect(sidebarBox!.x).toBeGreaterThan(editorBox!.x + editorBox!.width);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(640);

  const containerBox = await editorContainer.boundingBox();
  const firstHighlightBox = await page
    .getByRole('button', { name: 'Open grammar feedback for "First"' })
    .boundingBox();
  expect(containerBox).not.toBeNull();
  expect(firstHighlightBox).not.toBeNull();
  expect(firstHighlightBox!.x - containerBox!.x).toBeLessThanOrEqual(56);

  const dismissBox = await page.getByRole('button', { name: 'Dismiss' }).boundingBox();
  expect(dismissBox).not.toBeNull();
  expect(dismissBox!.y + dismissBox!.height).toBeLessThanOrEqual(640);

  const secondHighlight = page.getByRole('button', {
    name: 'Open grammar feedback for "Second"',
  });
  const inactiveOverlapStyle = await secondHighlight.evaluate((element) => ({
    backgroundColor: getComputedStyle(element).backgroundColor,
    borderTopWidth: getComputedStyle(element).borderTopWidth,
    outlineStyle: getComputedStyle(element).outlineStyle,
  }));
  const pageScrollBeforeNavigation = await page.evaluate(() => window.scrollY);
  await page.getByRole('button', { name: 'Next feedback' }).click();
  await expect(page.getByText('Synthetic feedback')).toBeVisible();
  await expect(page.getByText('2 of 3')).toBeVisible();
  await expect(secondHighlight).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() => secondHighlight.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(inactiveOverlapStyle.backgroundColor);
  const selectedOverlapStyle = await secondHighlight.evaluate((element) => ({
    borderTopWidth: getComputedStyle(element).borderTopWidth,
    outlineStyle: getComputedStyle(element).outlineStyle,
  }));
  expect(selectedOverlapStyle.borderTopWidth).toBe('2px');
  expect(inactiveOverlapStyle.borderTopWidth).toBe('0px');
  expect(selectedOverlapStyle.outlineStyle).toBe('none');
  expect(inactiveOverlapStyle.outlineStyle).toBe('none');
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBeforeNavigation);

  await page.getByRole('button', { name: 'Open grammar feedback for "First"' }).click();
  await expect(page.getByText('Opening wording')).toBeVisible();
  await expect(page.getByText('1 of 3')).toBeVisible();
});

test('joins an active broad highlight across leaves split by narrower comments', async ({
  page,
}) => {
  const source = 'I love my dog who she is name Nancy. Nancy is the most best dog in the world.';
  await page.route('http://localhost:8000/grammar_feedback', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        response_id: '11111111-1111-4111-8111-111111111111',
        feedback_list: [
          {
            index: 0,
            source,
            corrected: source,
            highlight_start: 14,
            highlight_end: 35,
            highlight_text: 'who she is name Nancy',
            error_tag: 'Broad feedback',
            feedback_explanation: 'The broad feedback spans several narrower comments.',
            feedback_suggestion: 'Revise the full phrase.',
            global_highlight_start: 14,
            global_highlight_end: 35,
          },
          {
            index: 1,
            source,
            corrected: source,
            highlight_start: 14,
            highlight_end: 17,
            highlight_text: 'who',
            error_tag: 'Who feedback',
            feedback_explanation: 'Narrow feedback for who.',
            feedback_suggestion: 'Revise who.',
            global_highlight_start: 14,
            global_highlight_end: 17,
          },
          {
            index: 2,
            source,
            corrected: source,
            highlight_start: 18,
            highlight_end: 21,
            highlight_text: 'she',
            error_tag: 'She feedback',
            feedback_explanation: 'Narrow feedback for she.',
            feedback_suggestion: 'Revise she.',
            global_highlight_start: 18,
            global_highlight_end: 21,
          },
        ],
        metadata: { system_used: 'rule-based' },
      }),
    });
  });
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Essay text' });
  await editor.click();
  await page.keyboard.insertText(source);
  await page.getByRole('button', { name: 'Submit Draft 1' }).click();
  await expect(page.getByText('Broad feedback', { exact: true })).toBeVisible();

  const broadFragments = page.locator(
    '[data-feedback-ids*="11111111-1111-4111-8111-111111111111:0"][aria-pressed="true"]',
  );
  await expect.poll(() => broadFragments.count()).toBeGreaterThan(1);
  const fragmentStyles = await broadFragments.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        borderLeftWidth: style.borderLeftWidth,
        borderRightWidth: style.borderRightWidth,
        outlineStyle: style.outlineStyle,
      };
    }),
  );
  expect(fragmentStyles[0].borderLeftWidth).toBe('2px');
  expect(fragmentStyles[0].borderRightWidth).toBe('0px');
  expect(fragmentStyles.at(-1)?.borderLeftWidth).toBe('0px');
  expect(fragmentStyles.at(-1)?.borderRightWidth).toBe('2px');
  expect(fragmentStyles.slice(1, -1)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ borderLeftWidth: '0px', borderRightWidth: '0px' }),
    ]),
  );
  expect(fragmentStyles.every((style) => style.outlineStyle === 'none')).toBe(true);

  await page.getByRole('button', { name: 'Open grammar feedback for "who"' }).click();
  await expect(page.getByText('Who feedback', { exact: true })).toBeVisible();
  await expect(page.getByText('2 of 3')).toBeVisible();

  await page.getByRole('button', { name: 'Open grammar feedback for "she"' }).click();
  await expect(page.getByText('She feedback', { exact: true })).toBeVisible();
  await expect(page.getByText('3 of 3')).toBeVisible();

  await page.getByRole('button', { name: 'Open grammar feedback for " is name Nancy"' }).click();
  await expect(page.getByText('Broad feedback', { exact: true })).toBeVisible();
  await expect(page.getByText('1 of 3')).toBeVisible();
});

test('mobile docks one comment above the visual keyboard without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { configurable: true, value: window.innerHeight },
      offsetTop: { value: 0 },
      width: { value: 390 },
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });
  });
  await mockFeedbackRequest(page);
  await page.goto('/');
  await enterAndSubmitDraft(page);

  await expect
    .poll(() =>
      page.locator('#essay-workspace').evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeLessThanOrEqual(2);
  await expect
    .poll(() =>
      page.locator('#essay-workspace').evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeGreaterThanOrEqual(-2);

  const feedbackBar = page.getByRole('complementary', { name: 'Feedback details' });
  await expect(feedbackBar).toBeVisible();
  expect(await feedbackBar.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');

  const feedbackBox = await feedbackBar.boundingBox();
  expect(feedbackBox).not.toBeNull();
  expect(feedbackBox!.x).toBeGreaterThanOrEqual(0);
  expect(feedbackBox!.x + feedbackBox!.width).toBeLessThanOrEqual(390);
  expect(feedbackBox!.y + feedbackBox!.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.getByRole('button', { name: 'Open grammar feedback for "Second"' }).click();
  await expect(page.getByText('Synthetic feedback')).toBeVisible();
  await expect(page.getByText('2 of 3')).toBeVisible();

  const feedbackBody = feedbackBar.locator('[data-feedback-body]');
  const bodyDimensions = await feedbackBody.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(bodyDimensions.scrollHeight).toBeGreaterThan(bodyDimensions.clientHeight);
  await expect(feedbackBar.locator('[data-feedback-header]')).toBeVisible();
  await expect(feedbackBar.locator('[data-feedback-footer]')).toBeVisible();

  await page.getByRole('button', { name: 'Open grammar feedback for "First"' }).click();
  await expect(page.getByText('Opening wording')).toBeVisible();
  await expect(page.getByText('1 of 3')).toBeVisible();

  await page.getByRole('button', { name: 'Next feedback' }).click();
  await expect(page.getByText('Synthetic feedback')).toBeVisible();
  const selectedHighlight = page.getByRole('button', {
    name: 'Open grammar feedback for "Second"',
  });
  await expect
    .poll(() => selectedHighlight.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThanOrEqual(48);
  await expect
    .poll(() => selectedHighlight.evaluate((element) => element.getBoundingClientRect().top))
    .toBeGreaterThanOrEqual(-2);

  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', {
      configurable: true,
      value: 500,
    });
    window.visualViewport?.dispatchEvent(new Event('resize'));
  });

  await expect
    .poll(async () => {
      const box = await feedbackBar.boundingBox();
      return box ? box.y + box.height : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(501);
  await expect
    .poll(async () => (await feedbackBar.boundingBox())?.height ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(241);
});
