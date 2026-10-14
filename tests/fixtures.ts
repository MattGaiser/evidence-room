import { test as base } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Each test gets real storage without sharing autosaved seed scorecards.
export const test = base.extend({
  baseURL: async ({ browserName }, use, testInfo) => {
    const parent = resolve(tmpdir());
    const directory = await mkdtemp(join(parent, `evidence-room-e2e-${browserName}-`));
    if (dirname(directory) !== parent || !basename(directory).startsWith('evidence-room-e2e-'))
      throw new Error('Unexpected test storage directory.');
    const baseURL = `http://127.0.0.1:${5195 + testInfo.workerIndex}`;
    const launcher = '../scripts/dotnet.mjs';
    const { dotnet } = await import(launcher);
    const child = spawn(
      dotnet,
      [resolve('server/EvidenceRoom.Api/bin/Release/net10.0/EvidenceRoom.Api.dll')],
      {
        stdio: 'ignore',
        env: {
          ...process.env,
          EVIDENCE_ROOT: resolve('.'),
          EVIDENCE_DB: join(directory, 'test.sqlite'),
          EVIDENCE_DISABLE_AI: '1',
          OPENAI_API_KEY: '',
          ASPNETCORE_URLS: baseURL,
        },
      },
    );
    let startupError: Error | null = null;
    child.on('error', (error) => {
      startupError = error;
    });
    const closed = new Promise<void>((done) => child.once('close', () => done()));
    try {
      const deadline = Date.now() + 10000;
      while (true) {
        if (startupError) throw startupError;
        if (child.exitCode !== null) throw new Error('The test API stopped before it was ready.');
        if (
          await fetch(`${baseURL}/api/workspace`)
            .then((response) => response.ok)
            .catch(() => false)
        )
          break;
        if (Date.now() > deadline) throw new Error('The isolated test API did not start.');
        await delay(50);
      }
      await use(baseURL);
    } finally {
      if (child.exitCode === null) child.kill();
      await closed;
      await rm(directory, { recursive: true, force: true });
    }
  },
});
export { expect } from '@playwright/test';
