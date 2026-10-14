import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
const seed = JSON.parse(
  readFileSync(new URL('../data/competition.json', import.meta.url), 'utf8'),
) as { submissions: { paragraphs: { text: string }[] }[] };

async function openEntry(page: Page) {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Review the evidence', exact: true }),
  ).toBeVisible();
}
async function freshEntry(page: Page) {
  const team = `Test team ${crypto.randomUUID().slice(0, 8)}`;
  const response = await page.request.post('/api/entries', {
    data: {
      team,
      title: 'A measured water-access pilot',
      body: seed.submissions[0].paragraphs.map((p) => p.text).join('\n\n'),
      expectedRevision: null,
    },
  });
  expect(response.ok()).toBeTruthy();
  const detail = await response.json();
  await openEntry(page);
  if (!(await page.getByLabel('Filter submissions').isVisible()))
    await page.getByRole('button', { name: 'Show review queue', exact: true }).click();
  const button = page.getByRole('button', { name: new RegExp(team) });
  await button.click();
  await expect(page.getByRole('heading', { name: detail.entry.title })).toBeVisible();
  return detail;
}
async function score(page: Page) {
  await page.getByRole('button', { name: /Score & recommend/ }).click();
  for (const name of ['Test evidence', 'Cost & resources', 'Pilot delivery', 'Community benefit']) {
    const criterion = page
      .locator('.score-criterion')
      .filter({ has: page.locator('summary', { hasText: name }) });
    if ((await criterion.getAttribute('open')) === null) await criterion.locator('summary').click();
    await criterion.getByRole('radio', { name: /2 — Preliminary/ }).check();
  }
  await page.getByRole('button', { name: '2 Recommendation', exact: true }).click();
  await page
    .getByLabel('Your rationale')
    .fill(
      'The trial establishes a preliminary signal, but field conditions, installed costs, and water quality need further evidence before deployment.',
    );
  await page.getByLabel('Recommendation', { exact: true }).selectOption('clarify');
  await page.getByRole('checkbox', { name: /independent assessment/ }).check();
}

test('source quotations reveal exact passages, preserve scores, and support repeated clicks', async ({
  page,
}) => {
  await openEntry(page);
  await page.getByRole('button', { name: 'Review the evidence', exact: true }).click();
  const quote = page.locator('.evidence-quote').first();
  await quote.click();
  await expect(page.locator('#passage-p2')).toBeFocused();
  await expect(page.locator('#passage-p2 mark')).toContainText('microbiological testing');
  await quote.click();
  await expect(page.locator('#passage-p2')).toBeFocused();
  await page.getByRole('button', { name: /Score & recommend/ }).click();
  await expect(page.getByText('No scores entered yet', { exact: true })).toBeVisible();
});

test('draft survives reload, finalization locks the version, and export contains the full case', async ({
  page,
}) => {
  const entry = await freshEntry(page);
  await score(page);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
  const persisted = await (await page.request.get(`/api/entries/${entry.entry.id}`)).json();
  expect(persisted.assessment.total).toBe(50);
  expect(persisted.assessment.finalized).toBe(false);
  await page.reload();
  await page.getByRole('button', { name: /Score & recommend/ }).click();
  await page.getByRole('button', { name: '2 Recommendation', exact: true }).click();
  await expect(page.getByLabel('Your rationale')).toHaveValue(/field conditions/);
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.getByRole('button', { name: 'Finalize', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.getByRole('button', { name: 'Finalize', exact: true }).click();
  await page.getByRole('button', { name: 'Record recommendation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recommendation recorded' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recommendation recorded' })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Recommendation recorded' })).toBeInViewport({
    ratio: 1,
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export case packet', exact: true }).last().click();
  const file = await download;
  expect(file.suggestedFilename()).toContain(entry.entry.id);
  const packet = await (await page.request.get(`/api/entries/${entry.entry.id}/export`)).json();
  expect(packet.current.assessment.finalized).toBe(true);
  expect(packet.current.assessment.total).toBe(50);
  expect(packet.competition.version).toBe(1);
  expect(packet.current.events.some((e: { kind: string }) => e.kind === 'finalized')).toBe(true);
  const denied = await page.request.put(`/api/entries/${entry.entry.id}/assessment`, {
    data: {
      expectedRevision: 1,
      expectedVersion: 2,
      reviewId: null,
      scores: persisted.assessment.scores,
      rationale: persisted.assessment.rationale,
      outcome: 'decline',
      confirmed: true,
      finalize: true,
    },
  });
  expect(denied.status()).toBe(409);
});

test('new submission, cancellation, revision, and missing analysis give visible feedback', async ({
  page,
}) => {
  await openEntry(page);
  await page.getByRole('button', { name: 'Add submission', exact: true }).click();
  await page.getByLabel('Team name').fill('Interface intake team');
  await page.getByLabel('Submission title').fill('A field pilot with a revised test protocol');
  await page
    .getByLabel('Submission narrative')
    .fill(seed.submissions[1].paragraphs.map((p) => p.text).join('\n\n'));
  await page.getByRole('button', { name: 'Add to review queue' }).click();
  await expect(
    page.getByRole('heading', { name: 'A field pilot with a revised test protocol' }),
  ).toBeVisible();
  await expect(page.locator('.toast')).toContainText('Submission added.');
  await expect(page.locator('.toast')).toBeVisible();
  await page.getByRole('button', { name: 'Review the evidence', exact: true }).click();
  await expect(page.getByText('No analysis for this version yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run AI analysis', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '1 Read submission', exact: true }).click();
  await page.getByRole('button', { name: 'Submit revision', exact: true }).click();
  await page
    .getByLabel('Submission narrative')
    .fill(
      seed.submissions[1].paragraphs.map((p) => p.text).join('\n\n') +
        '\n\nNew independent results are scheduled for the next stage.',
    );
  await page.getByRole('button', { name: 'Save new version' }).click();
  await expect(page.locator('.team-name')).toContainText('Submission v2');
  await expect(page.getByRole('status').filter({ hasText: 'Submission v2 saved.' })).toContainText(
    'Submission v2 saved.',
  );
  await expect(page.locator('.toast')).toBeVisible();
});

test('scorecard conflict preserves typed work and does not replace saved evidence', async ({
  page,
}) => {
  const entry = await freshEntry(page);
  await score(page);
  const original = await (await page.request.get(`/api/entries/${entry.entry.id}`)).json();
  const saved = await page.request.put(`/api/entries/${entry.entry.id}/assessment`, {
    data: {
      expectedRevision: 1,
      expectedVersion: 0,
      reviewId: null,
      scores: { evidence: 1, resources: 1, delivery: 1, impact: 1 },
      rationale: 'A second reviewer tab saved this rationale first.',
      outcome: 'clarify',
      confirmed: false,
      finalize: false,
    },
  });
  expect(saved.ok()).toBeTruthy();
  expect(original.assessment).toBeNull();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'changed in another tab' })).toBeVisible();
  await expect(page.getByLabel('Your rationale')).toHaveValue(/field conditions/);
  const final = await (await page.request.get(`/api/entries/${entry.entry.id}`)).json();
  expect(final.assessment.rationale).toBe('A second reviewer tab saved this rationale first.');
});

test('canceled and failed AI requests preserve the existing analysis and unsaved scorecard', async ({
  page,
}) => {
  await page.route('**/api/workspace', async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    value.ai.available = true;
    await route.fulfill({ response, json: value });
  });
  await openEntry(page);
  await page.getByRole('button', { name: /Score & recommend/ }).click();
  await page.getByRole('button', { name: '2 Recommendation', exact: true }).click();
  await page
    .getByLabel('Your rationale')
    .fill('Keep this independent reasoning while the analysis request is canceled or fails.');
  await page.getByRole('button', { name: /Review evidence/ }).click();
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/analysis', async (route) => {
    await pending;
    await route
      .fulfill({ status: 502, json: { error: 'Citation verification failed. Nothing was saved.' } })
      .catch(() => {});
  });
  await page.getByRole('button', { name: 'Run AI analysis', exact: true }).click();
  await expect(page.getByText('Reading the rubric and checking source passages…')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel analysis', exact: true }).click();
  release?.();
  await expect(page.locator('.analysis-source')).toContainText('Example analysis');
  await page.getByRole('button', { name: /Score & recommend/ }).click();
  await expect(page.getByLabel('Your rationale')).toHaveValue(/Keep this independent/);
  await page.getByRole('button', { name: /Review evidence/ }).click();
  await page.unroute('**/analysis');
  await page.route('**/analysis', (route) =>
    route.fulfill({
      status: 502,
      json: { error: 'Citation verification failed. Nothing was saved.' },
    }),
  );
  await page.getByRole('button', { name: 'Run AI analysis', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Citation verification failed' }),
  ).toBeVisible();
});

test('pending scorecard save locks inputs and prevents context or analysis races', async ({
  page,
}) => {
  await page.route('**/api/workspace', async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    value.ai.available = true;
    await route.fulfill({ response, json: value });
  });
  const entry = await freshEntry(page);
  await score(page);
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/assessment', async (route) => {
    const response = await route.fetch();
    await pending;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByLabel('Your rationale')).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Recommendation', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Show review queue', exact: true }).click();
  await page.getByRole('button', { name: /Commons Water Lab/ }).click();
  await expect(page.getByRole('heading', { name: entry.entry.title })).toBeVisible();
  await expect(page.locator('.toast')).toContainText('Wait for the scorecard save');
  await page.getByRole('button', { name: /Review evidence/ }).click();
  await page.getByRole('button', { name: 'Run AI analysis', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('before running an analysis');
  release();
  await page.getByRole('button', { name: /Score & recommend/ }).click();
  await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Your rationale')).toBeEnabled();
});

test('analysis preserves scores, requires a fresh confirmation, and blocks overlapping mutations', async ({
  page,
}) => {
  await page.route('**/api/workspace', async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    value.ai.available = true;
    await route.fulfill({ response, json: value });
  });
  await openEntry(page);
  await score(page);
  const detail = await (await page.request.get('/api/entries/tidewell')).json();
  detail.review.id = 'unpaid-browser-fixture';
  detail.review.source = 'openai';
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/analysis', async (route) => {
    await pending;
    await route.fulfill({ json: detail });
  });
  await page.getByRole('button', { name: /Review evidence/ }).click();
  await page.getByRole('button', { name: 'Run AI analysis', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add submission', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /Score & recommend/ }).click();
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  release();
  await expect(page.locator('.analysis-source')).toContainText('AI analysis');
  await page.getByRole('button', { name: /Score & recommend/ }).click();
  await expect(page.getByLabel('Your rationale')).toHaveValue(/field conditions/);
  await expect(page.getByRole('checkbox', { name: /independent assessment/ })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Finalize', exact: true })).toBeDisabled();
});

test('submission save prevents edits and warns before discarding typed intake', async ({
  page,
}) => {
  await openEntry(page);
  await page.getByRole('button', { name: 'Add submission', exact: true }).click();
  await page.getByLabel('Team name').fill(`Pending intake ${crypto.randomUUID().slice(0, 8)}`);
  await page.getByLabel('Submission title').fill('An intake operation with observable progress');
  await page
    .getByLabel('Submission narrative')
    .fill(seed.submissions[0].paragraphs.map((p) => p.text).join('\n\n'));
  expect(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/entries', async (route) => {
    const response = await route.fetch();
    await pending;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Add to review queue' }).click();
  await expect(page.getByLabel('Submission narrative')).toBeDisabled();
  await expect(page.getByLabel('Submission title')).toBeDisabled();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  release();
  await expect(
    page.getByRole('heading', { name: 'An intake operation with observable progress' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('queue filtering remains available and open after narrowing the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEntry(page);
  const filter = page.getByLabel('Filter submissions');
  await filter.selectOption('reviewed');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(filter).toBeVisible();
  await filter.selectOption('all');
  await expect(filter).toBeVisible();
  await expect(
    page.locator('.queue-entry').filter({ hasText: 'Tidewell Collective' }),
  ).toBeVisible();
});

test('a delayed queue refresh cannot replace a newer saved scorecard status', async ({ page }) => {
  await openEntry(page);
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let refreshes = 0;
  let finish = () => {};
  const fulfilled = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/api/workspace', async (route) => {
    const read = ++refreshes;
    const response = await route.fetch();
    if (read === 1) {
      await pending;
      await route.fulfill({ response });
      finish();
    } else await route.fulfill({ response });
  });
  const title = `Delayed refresh ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByRole('button', { name: 'Add submission', exact: true }).click();
  await page.getByLabel('Team name').fill(title);
  await page.getByLabel('Submission title').fill(title);
  await page
    .getByLabel('Submission narrative')
    .fill(seed.submissions[0].paragraphs.map((p) => p.text).join('\n\n'));
  await page.getByRole('button', { name: 'Add to review queue' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await score(page);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('button', { name: 'Show review queue', exact: true }).click();
  const row = page.locator('.queue-entry').filter({ hasText: title });
  await expect(row).toContainText('Draft scorecard');
  release();
  await fulfilled;
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(row).toContainText('Draft scorecard');
  await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`review hides the queue and reopening preserves work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openEntry(page);
    if (width === 390) await page.getByRole('button', { name: 'Show review queue' }).click();
    await page.getByLabel('Filter submissions').selectOption('pending');
    await page.getByRole('button', { name: 'Review the evidence', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Submission queue' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Show review queue' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const bounds = await page.locator('.review-workspace').boundingBox();
    expect(bounds?.x).toBeLessThan(50);
    expect(bounds?.width).toBeGreaterThan(width - 90);
    await page.getByRole('button', { name: /Score & recommend/ }).click();
    await page
      .locator('#score-criterion-evidence')
      .getByRole('radio', { name: /2 — Preliminary/ })
      .check();
    await page.getByRole('button', { name: '2 Recommendation', exact: true }).click();
    await page
      .getByLabel('Your rationale')
      .fill('Keep this reasoning while checking the submission queue.');
    await page.getByRole('button', { name: 'Show review queue' }).click();
    await expect(page.getByLabel('Filter submissions')).toBeFocused();
    await expect(page.getByLabel('Filter submissions')).toHaveValue('pending');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: /Commons Water Lab/ }).click();
    await expect(page.getByLabel('Your rationale')).toHaveValue(/Keep this reasoning/);
    await page.getByRole('button', { name: 'Hide review queue' }).click();
    await expect(page.getByRole('button', { name: 'Show review queue' })).toBeFocused();
    await page.getByRole('button', { name: 'Back to scores', exact: true }).click();
    await expect(
      page.locator('#score-criterion-evidence').getByRole('radio', { name: /2 — Preliminary/ }),
    ).toBeChecked();
  });

  test(`source inspection returns to the finding and clears outdated highlights at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await openEntry(page);
    await page.getByRole('button', { name: 'Review the evidence', exact: true }).click();
    const quote = page.locator('.evidence-quote').first();
    await quote.click();
    await expect(page.locator('#passage-p2')).toBeFocused();
    await page.getByRole('button', { name: 'Back to finding', exact: true }).click();
    await expect(quote).toBeFocused();
    await expect(quote).toBeInViewport({ ratio: 1 });
    if (width === 390) await expect(page.locator('.source-content')).toBeHidden();
    await page.getByRole('button', { name: 'Next criterion', exact: true }).click();
    await expect(page.locator('mark')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Back to finding', exact: true })).toHaveCount(0);
    await quote.click();
    await page.getByLabel('Choose a criterion').selectOption('3');
    await expect(page.locator('mark')).toHaveCount(0);
    await quote.click();
    await page.getByRole('button', { name: 'Continue to your assessment', exact: true }).click();
    await expect(page.locator('mark')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Back to finding', exact: true })).toHaveCount(0);
  });
}

test('scoring reveals the next section without disrupting radio keyboard navigation', async ({
  page,
}) => {
  await openEntry(page);
  await page.getByRole('button', { name: /Score & recommend/ }).click();
  const sections = page.locator('.score-criterion');
  await expect(sections.nth(1).locator('summary')).toContainText('Choose score');
  await expect(sections.nth(1)).not.toHaveAttribute('open');
  const evidence = sections.nth(0);
  await evidence.getByRole('radio', { name: /2 — Preliminary/ }).check();
  await expect(sections.nth(1)).toHaveAttribute('open');
  await expect(evidence).toHaveAttribute('open');
  await expect(evidence.locator('.selected-score')).toContainText('2 of 4 — Preliminary evidence');
  await evidence.getByRole('radio', { name: /2 — Preliminary/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(evidence.getByRole('radio', { name: /3 — Measured/ })).toBeChecked();
  await expect(evidence.getByRole('radio', { name: /3 — Measured/ })).toBeFocused();
  await sections
    .nth(1)
    .getByRole('radio', { name: /2 — Preliminary/ })
    .check();
  await expect(sections.nth(2)).toHaveAttribute('open');
  await sections
    .nth(2)
    .getByRole('radio', { name: /1 — Claim only/ })
    .check();
  await expect(sections.nth(3)).toHaveAttribute('open');
  await sections
    .nth(3)
    .getByRole('radio', { name: /2 — Preliminary/ })
    .check();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Next: recommendation', exact: true }).click();
  await page.getByRole('button', { name: 'Back to scores', exact: true }).click();
  await expect(evidence.getByRole('radio', { name: /3 — Measured/ })).toBeChecked();
});

test('criterion pagination supports keyboard focus, direct selection, and backtracking', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.route('**/api/entries/tidewell', async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.review.content.summary =
      'The trial reports measured output, with field performance and cost questions still open. '.repeat(
        15,
      );
    await route.fulfill({ response, json: detail });
  });
  await openEntry(page);
  await page.getByRole('button', { name: 'Review the evidence', exact: true }).click();
  await page.getByText('Submission summary', { exact: true }).click();
  const selector = page.getByLabel('Choose a criterion');
  await selector.focus();
  await page.keyboard.press('ArrowDown');
  await expect(selector).toHaveValue('1');
  await expect(selector).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(selector).toHaveValue('2');
  await expect(selector).toBeFocused();
  await selector.selectOption('0');
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  for (const name of ['Cost & resources', 'Pilot delivery', 'Community benefit']) {
    await page.getByRole('button', { name: 'Next criterion', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name, exact: true })).toBeFocused();
    await expect(page.getByRole('heading', { name, exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.finding')).toHaveCount(1);
  }
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pilot delivery', exact: true })).toBeFocused();
  await page.getByLabel('Choose a criterion').selectOption('0');
  await page.locator('.evidence-quote').first().click();
  await expect(page.locator('#passage-p2 mark')).toBeVisible();
  await page.getByRole('button', { name: /Score & recommend/ }).click();
  await page.getByRole('button', { name: 'Next: recommendation', exact: true }).click();
  await page
    .getByLabel('Your rationale')
    .fill('Keep this reasoning while returning to an unfinished score.');
  await page.getByRole('button', { name: 'Complete missing scores', exact: true }).click();
  await expect(page.locator('#score-criterion-evidence input').first()).toBeFocused();
  await page.getByRole('radio', { name: /2 — Preliminary/ }).check();
  await page.getByRole('button', { name: '2 Recommendation', exact: true }).click();
  await expect(page.getByLabel('Your rationale')).toHaveValue(/Keep this reasoning/);
  await page.getByRole('button', { name: 'Back to scores', exact: true }).click();
  await expect(
    page.locator('#score-criterion-evidence').getByRole('radio', { name: /2 — Preliminary/ }),
  ).toBeChecked();
});

test('status badges and yellow quotations have AA text contrast and non-color labels', async ({
  page,
}) => {
  const backgrounds = [];
  const contrast = (foreground: string, background: string) => {
    const luminance = (value: string) => {
      const channels = (value.match(/[\d.]+/g) ?? [])
        .slice(0, 3)
        .map(Number)
        .map((n) => n / 255)
        .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const a = luminance(foreground),
      b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  for (const [entry, index, label] of [
    ['tidewell', '0', 'Needs detail'],
    ['commons', '2', 'Evidence described'],
    ['clearcurrent', '1', 'Not provided'],
  ]) {
    await page.goto(`/?entry=${entry}`);
    await page.getByRole('button', { name: 'Review the evidence', exact: true }).click();
    await page.getByLabel('Choose a criterion').selectOption(index);
    const badge = page.locator('.coverage');
    await expect(badge).toHaveText(label);
    await expect(badge.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    const colors = await badge.evaluate((element) => {
      const css = getComputedStyle(element);
      return { foreground: css.color, background: css.backgroundColor };
    });
    expect(contrast(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5);
    backgrounds.push(colors.background);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    if (entry === 'tidewell') {
      await page.locator('.evidence-quote').first().click();
      const colors = await page.locator('mark').evaluate((element) => {
        const css = getComputedStyle(element);
        return { foreground: css.color, background: css.backgroundColor };
      });
      expect(colors.background).toBe('rgb(255, 235, 128)');
      expect(contrast(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(new Set(backgrounds).size).toBe(3);
});

test('walkthrough is paginated, optional, replayable, and restores keyboard focus', async ({
  page,
}) => {
  await openEntry(page);
  const trigger = page.getByRole('button', { name: 'How it works', exact: true });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start with the submission.' })).toBeFocused();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Start reviewing', exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

for (const width of [320, 1440])
  test(`reflow, evidence links, score controls, and accessibility at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await openEntry(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const start = page.getByRole('button', { name: 'Review the evidence', exact: true });
    const bounds = await start.boundingBox();
    expect(bounds?.y).toBeLessThan(900);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await start.click();
    await expect(page.getByRole('heading', { name: 'Evidence review' })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Evidence review' })).toBeInViewport({
      ratio: 1,
    });
    await page.locator('.evidence-quote').first().click();
    await expect(page.locator('#passage-p2 mark')).toBeVisible();
    await page.getByLabel('Choose a criterion').selectOption('3');
    await page.getByRole('button', { name: 'Continue to your assessment' }).click();
    await expect(
      page.getByRole('heading', { name: 'Score and recommend', exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole('heading', { name: 'Score and recommend', exact: true }),
    ).toBeInViewport({
      ratio: 1,
    });
    await page.getByRole('button', { name: '2 Recommendation', exact: true }).click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 320) {
      await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter(
          (element) => !(element instanceof SVGElement),
        );
        const sizes = elements.map((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize),
        );
        elements.forEach((element, index) => {
          element.style.fontSize = `${sizes[index] * 2}px`;
        });
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const title = await page.locator('#scorecard-title').boundingBox();
      const total = await page.locator('.score-total').boundingBox();
      expect(title).not.toBeNull();
      expect(total).not.toBeNull();
      expect(total?.y).toBeGreaterThanOrEqual((title?.y ?? 0) + (title?.height ?? 0));
      for (const button of [
        page.getByRole('button', { name: 'How it works', exact: true }),
        page.getByRole('button', { name: 'Finalize', exact: true }),
      ]) {
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        expect(box?.x).toBeGreaterThanOrEqual(0);
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      }
    }
  });

test('HTTP boundary rejects bad origins, unknown routes, invalid scores, and source exposure', async ({
  request,
}) => {
  expect(
    (
      await request.post('/api/entries', {
        headers: { Origin: 'https://foreign.invalid' },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect((await request.get('/api/missing')).status()).toBe(404);
  const source = await request.get('/worker/review.py');
  expect(await source.text()).not.toContain('INSTRUCTIONS =');
  expect(
    (
      await request.post('/api/entries', {
        data: { team: '', title: '', body: '', expectedRevision: null },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post('/api/entries/tidewell/analysis', { data: { expectedRevision: 1 } })
    ).status(),
  ).toBe(503);
});
