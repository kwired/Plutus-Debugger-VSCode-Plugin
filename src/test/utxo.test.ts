
import { selectBestUtxo, queryUtxos } from '../simulator/utxo';
import { UTxO } from '../simulator/types';
import { execFile } from 'child_process';
import { promisify } from 'util';

// Mock child_process for queryUtxos
jest.mock("child_process");

describe("UTxO Module", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("selectBestUtxo", () => {
        it("should return the UTxO with the highest lovelace amount", () => {
            const utxos: UTxO[] = [
                { txHash: "abc", index: 0, lovelace: BigInt(1000) },
                { txHash: "def", index: 1, lovelace: BigInt(5000000) },
                { txHash: "ghi", index: 2, lovelace: BigInt(2000) }
            ];

            const result = selectBestUtxo(utxos);
            expect(result).toEqual(utxos[1]);
        });

        it("should throw error if utxo list is empty", () => {
            expect(() => selectBestUtxo([])).toThrow("No spendable UTxOs found");
        });
    });

    describe("queryUtxos", () => {
        it("should parse cardano-cli JSON output correctly", async () => {
            const mockStdout = JSON.stringify({
                "tx1#0": {
                    value: { lovelace: 1000000 },
                    referenceScript: null
                },
                "tx2#1": {
                    value: { lovelace: 5000000 },
                    referenceScript: null
                },
                "txWithRef#0": {
                    value: { lovelace: 2000000 },
                    referenceScript: {}
                }
            });

            // Mock execFile to return the JSON
            // Note: Promisify behavior requires callback to be called with object
            const mockExecFile = execFile as unknown as jest.Mock;
            mockExecFile.mockImplementation((file, args, options, cb) => {
                cb(null, { stdout: mockStdout, stderr: "" });
            });

            const result = await queryUtxos("addr_test1", 1, "/tmp/node.socket");

            expect(result).toHaveLength(2); // Should skip referenceScript one
            expect(result).toContainEqual({ txHash: "tx1", index: 0, lovelace: BigInt(1000000) });
            expect(result).toContainEqual({ txHash: "tx2", index: 1, lovelace: BigInt(5000000) });
            expect(mockExecFile).toHaveBeenCalledWith(
                "cardano-cli",
                expect.arrayContaining(["query", "utxo", "--address", "addr_test1"]),
                expect.anything(),
                expect.anything()
            );
        });
    });
});
