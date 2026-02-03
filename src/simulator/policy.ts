import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function derivePolicyId(plutusFile: string): Promise<string> {
    const { stdout } = await execFileAsync(
        "cardano-cli",
        [
            "conway",
            "transaction",
            "policyid",
            "--script-file",
            plutusFile
        ]
    );

    return stdout.trim();
}
