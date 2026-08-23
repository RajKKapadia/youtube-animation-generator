import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  supertonicJobSchema,
  supertonicResultSchema,
  type SupertonicJob,
  type SupertonicResult,
} from './protocol.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const workerCommand = (): {args: string[]; executable: string} => {
  const compiledWorker = resolve(currentDirectory, 'worker.js');
  if (existsSync(compiledWorker)) {
    return {executable: process.execPath, args: [compiledWorker]};
  }
  const sourceWorker = resolve(currentDirectory, 'worker.ts');
  if (existsSync(sourceWorker)) {
    return {executable: process.execPath, args: ['--import', 'tsx', sourceWorker]};
  }
  throw new Error('Could not locate the embedded Supertonic worker.');
};

export const runSupertonicWorker = async (
  rawJob: SupertonicJob,
): Promise<SupertonicResult> => {
  const job = supertonicJobSchema.parse(rawJob);
  const command = workerCommand();
  return await new Promise<SupertonicResult>((resolvePromise, reject) => {
    const child = spawn(command.executable, command.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Supertonic worker exited with code ${code ?? 'unknown'}.` +
              (stderr ? `\n${stderr.trim()}` : ''),
          ),
        );
        return;
      }
      try {
        resolvePromise(supertonicResultSchema.parse(JSON.parse(stdout)));
      } catch (error) {
        reject(new Error('Supertonic worker returned invalid JSON.', {cause: error}));
      }
    });
    child.stdin.end(JSON.stringify(job));
  });
};
