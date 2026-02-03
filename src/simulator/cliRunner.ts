import { spawn } from 'child_process';

export function runCardanoCli(
    cliPath: string,
    args: string[],
    onStdout: (data: string) => void,
    onStderr: (data: string) => void
): Promise<number> {
    return new Promise((resolve, reject) => {
        const proc = spawn(cliPath, args);

        proc.stdout.on('data', d => onStdout(d.toString()));
        proc.stderr.on('data', d => onStderr(d.toString()));

        proc.on('error', reject);
        proc.on('close', code => resolve(code ?? 0));
    });
}
