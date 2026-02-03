import { execFile } from "child_process";
import { promisify } from "util";
import { UTxO } from "./types";

const execFileAsync = promisify(execFile);

export async function queryUtxos(
    address: string,
    testnetMagic: number,
    socketPath: string
): Promise<UTxO[]> {
    console.log("Querying UTxOs for address:", address);
    const { stdout } = await execFileAsync(
        "cardano-cli",
        [
            "query",
            "utxo",
            "--address",
            address,
            "--testnet-magic",
            String(testnetMagic),
            "--output-json"
        ],
        {
            env: {
                ...process.env,
                CARDANO_NODE_SOCKET_PATH: socketPath
            }
        }
    );

    return parseUtxoJson(stdout);
}

/* -------- JSON parser (CORRECT) -------- */

function parseUtxoJson(json: string): UTxO[] {
    console.log("Parsing UTxOs from JSON:", json);
    const parsed = JSON.parse(json);
    const utxos: UTxO[] = [];

    for (const [key, entry] of Object.entries<any>(parsed)) {
        const [txHash, indexStr] = key.split("#");

        const lovelace = entry.value?.lovelace;
        if (!lovelace) continue;

        // skip reference scripts for now
        if (entry.referenceScript !== null) continue;

        utxos.push({
            txHash,
            index: Number(indexStr),
            lovelace: BigInt(lovelace)
        });
    }

    return utxos;
}

export function selectBestUtxo(utxos: UTxO[]): UTxO {
    console.log("Selecting best UTxO:", utxos);
    if (utxos.length === 0) {
        throw new Error(
            "No spendable UTxOs found.\n" +
            "Make sure the address has ADA and no reference scripts."
        );
    }

    return utxos.reduce((best, u) =>
        u.lovelace > best.lovelace ? u : best
    );
}
