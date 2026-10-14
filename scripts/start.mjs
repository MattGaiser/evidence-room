import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { dotnet } from './dotnet.mjs';
const child = spawn(dotnet, ['server/EvidenceRoom.Api/bin/Release/net10.0/EvidenceRoom.Api.dll'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    EVIDENCE_ROOT: resolve('.'),
    ASPNETCORE_URLS: process.env.ASPNETCORE_URLS || 'http://127.0.0.1:5194',
  },
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
