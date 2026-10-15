import { test, expect } from './fixtures';

for (const boundary of ['workspace', 'entry'] as const) {
  test(`an incompatible ${boundary} response offers recovery instead of entering the workflow`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const route = boundary === 'workspace' ? '**/api/workspace' : '**/api/entries/tidewell';
    await page.route(route, async (intercepted) => {
      const response = await intercepted.fetch();
      const body = await response.json();
      if (boundary === 'workspace') body.ai.available = 'yes';
      else body.submission.entryId = 'another-entry';
      await intercepted.fulfill({ response, json: body });
    });
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('incomplete or unexpected response');
    await expect(
      page.getByRole('button', { name: 'Review the evidence', exact: true }),
    ).toHaveCount(0);
    await page.unroute(route);
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.locator('#start-title')).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test('a malformed successful save preserves text and cannot acknowledge the draft', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '3 Recommendation', exact: true }).click();
  let fail = true;
  await page.route('**/api/entries/tidewell/assessment', async (route) => {
    if (!fail) return route.continue();
    const response = await page.request.get('/api/entries/tidewell');
    const body = await response.json();
    body.assessment = { version: 'not-a-version' };
    await route.fulfill({ status: 200, json: body });
  });
  const rationale =
    'These provisional observations require independent field validation before any pilot recommendation.';
  await page.getByLabel('Your rationale').fill(rationale);
  await expect(page.locator('#draft-save-error')).toContainText(
    'incomplete or unexpected response',
  );
  await expect(page.locator('#autosave-state')).toHaveText('Not saved');
  await expect(page.getByLabel('Your rationale')).toHaveValue(rationale);
  fail = false;
  await page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await expect(page.locator('#autosave-state')).toHaveText('All changes saved');
  const stored = await (await page.request.get('/api/entries/tidewell')).json();
  expect(stored.assessment.rationale).toBe(rationale);
});
