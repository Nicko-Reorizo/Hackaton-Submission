import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));

export function npm(args, cwd) {
  return new Promise((resolve, reject) => {
    // npm_execpath is populated by npm scripts and avoids shell quoting differences.
    const executable = process.env.npm_execpath;
    const command = executable ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
    const child = spawn(command, executable ? [executable, ...args] : args, {
      cwd,
      stdio: 'inherit',
      shell: !executable && process.platform === 'win32',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`npm ${args.join(' ')} failed (${signal || code}).`));
    });
  });
}
