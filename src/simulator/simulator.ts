import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { performance } from "perf_hooks";
import { SimulationContext } from "./types";
import { queryUtxos, selectBestUtxo } from "./utxo";
import { derivePolicyId } from "./policy";

const execFileAsync = promisify(execFile);

function toHex(str: string): string {
    return Buffer.from(str, "utf8").toString("hex");
}

export async function simulatePlutus(
    ctx: SimulationContext
): Promise<string> {

    const workDir = path.dirname(ctx.plutusFile);
    const txRawPath = path.join(workDir, "tx.raw");

    /* ---------- STEP 1: select real UTxO ---------- */

    const utxos = await queryUtxos(
        ctx.senderAddress,
        ctx.testnetMagic,
        ctx.socketPath
    );

    const utxo = selectBestUtxo(utxos);

    /* ---------- STEP 2: derive policy id ---------- */

    const policyId = await derivePolicyId(ctx.plutusFile);

    /* ---------- STEP 3: asset name from UI ---------- */

    const assetNameHex = toHex(ctx.assetName);
    const asset = `${policyId}.${assetNameHex}`;

    /* ---------- STEP 4: build minting tx ---------- */

    await execFileAsync(
        "cardano-cli",
        [
            "conway",
            "transaction",
            "build-raw",

            "--script-valid",

            "--tx-in",
            `${utxo.txHash}#${utxo.index}`,

            "--mint",
            `1 ${asset}`,

            "--mint-script-file",
            ctx.plutusFile,

            "--mint-redeemer-value",
            ctx.redeemerJson,

            "--mint-execution-units",
            "(0,0)",

            "--tx-out",
            `${ctx.senderAddress}+2000000+1 ${asset}`,

            "--fee",
            "0",

            "--out-file",
            txRawPath
        ],
        {
            env: {
                ...process.env,
                CARDANO_NODE_SOCKET_PATH: ctx.socketPath
            }
        }
    );

    /* ---------- STEP 5: calculate Plutus cost (ONLINE) ---------- */

    const start = performance.now();

    const { stdout } = await execFileAsync(
        "cardano-cli",
        [
            "conway",
            "transaction",
            "calculate-plutus-script-cost",
            "online",
            "--tx-file",
            txRawPath,
            "--testnet-magic",
            String(ctx.testnetMagic)
        ],
        {
            env: {
                ...process.env,
                CARDANO_NODE_SOCKET_PATH: ctx.socketPath
            }
        }
    );

    const end = performance.now();
    const durationMs = (end - start).toFixed(3);

    /* ---------- STEP 6: attach timing info ---------- */

    return JSON.stringify(
        {
            result: JSON.parse(stdout),
            timingMs: Number(durationMs)
        },
        null,
        2
    );
}
