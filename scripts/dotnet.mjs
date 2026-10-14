import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
export const dotnet =
  process.platform === 'win32' && existsSync('C:/Program Files/dotnet/dotnet.exe')
    ? 'C:/Program Files/dotnet/dotnet.exe'
    : 'dotnet';
if (process.argv[1]?.endsWith('dotnet.mjs')) {
  const child = spawn(dotnet, process.argv.slice(2), { stdio: 'inherit' });
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}
