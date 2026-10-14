import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { dotnet } from './dotnet.mjs';
const directory = await mkdtemp(join(tmpdir(), 'evidence-room-e2e-'));
const child = spawn(dotnet, ['server/EvidenceRoom.Api/bin/Release/net10.0/EvidenceRoom.Api.dll'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    EVIDENCE_ROOT: resolve('.'),
    EVIDENCE_DB: join(directory, 'test.sqlite'),
    EVIDENCE_DISABLE_AI: '1',
    OPENAI_API_KEY: '',
    ASPNETCORE_URLS: 'http://127.0.0.1:5195',
  },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', async (code) => {
  await rm(directory, { recursive: true, force: true });
  process.exitCode = code ?? 0;
});
