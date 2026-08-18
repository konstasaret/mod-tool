import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const supportedCommands = new Set(['playtest', 'publish', 'upload']);
const command = process.argv[2];

if (!command || !supportedCommands.has(command)) {
  throw new Error(`Expected one of: ${[...supportedCommands].join(', ')}`);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const developerReadmePath = join(root, 'README.md');
const publicReadmePath = join(root, 'REDDIT_README.md');
const devvitBin = join(root, 'node_modules', 'devvit', 'bin', 'devvit.js');
const developerReadme = await readFile(developerReadmePath);
const publicReadme = await readFile(publicReadmePath);

let child;
let interruptedSignal;

const forwardSignal = (signal) => {
  interruptedSignal = signal;
  if (child && !child.killed) child.kill(signal);
};

process.once('SIGINT', () => forwardSignal('SIGINT'));
process.once('SIGTERM', () => forwardSignal('SIGTERM'));

try {
  await writeFile(developerReadmePath, publicReadme);
  child = spawn(process.execPath, [devvitBin, command, ...process.argv.slice(3)], {
    cwd: root,
    stdio: 'inherit',
  });

  const exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) resolveExit(signal === 'SIGINT' ? 130 : 143);
      else resolveExit(code ?? 1);
    });
  });

  process.exitCode = interruptedSignal === 'SIGINT' ? 130 : exitCode;
} finally {
  await writeFile(developerReadmePath, developerReadme);
}

