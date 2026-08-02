import { expect, test } from '@playwright/test';

test('a browser user can type multiline Slate content and submit the exact text', async ({
  page,
}) => {
  let requestBody: Record<string, unknown> | undefined;
  await page.route('http://localhost:8000/grammar_feedback', async (route) => {
    requestBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        response_id: '00000000-0000-4000-8000-000000000000',
        feedback_list: [],
        metadata: { system_used: 'llm-based' },
      }),
    });
  });
  await page.goto('/');

  const editor = page.getByRole('textbox');
  await editor.click();
  await page.keyboard.type('First line');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second line');
  await page.getByRole('radio', { name: 'LLM-based*' }).check();
  await page.getByRole('button', { name: 'Submit Draft 1' }).click();

  await expect(page.getByText('Draft: 2 / 3')).toBeVisible();
  expect(requestBody).toMatchObject({
    system_choice: 'llm-based',
    draft_number: 1,
    text: 'First line\nSecond line',
  });
  expect(requestBody?.user_id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});
