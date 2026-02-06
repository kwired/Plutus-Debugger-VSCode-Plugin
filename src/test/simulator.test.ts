
import { simulatePlutus } from "../simulator/simulator";
import { execFile } from "child_process";
import * as utxoModule from "../simulator/utxo";
import * as policyModule from "../simulator/policy";

// Mock dependencies
jest.mock("child_process");
jest.mock("../simulator/utxo");
jest.mock("../simulator/policy");

describe("Simulator", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should orchestrate the simulation steps correctly", async () => {
        // Setup execFile mock to work with util.promisify
        // Since we are mocking execFile, util.promisify treats it as a standard async-callback function.
        // It resolves to the 2nd argument of the callback.
        // We pass an object { stdout, stderr } as the 2nd argument so the destructuring in the code works.
        const mockExecFile = execFile as unknown as jest.Mock;

        mockExecFile.mockImplementation((file, args, options, callback) => {
            // Check args to decide response
            if (args.includes("calculate-plutus-script-cost")) {
                callback(null, { stdout: '{"executionUnits": 100}', stderr: "" });
            } else {
                // build-raw or others
                callback(null, { stdout: "", stderr: "" });
            }
        });

        // Mock UTXO selection
        (utxoModule.queryUtxos as jest.Mock).mockResolvedValue([]);
        (utxoModule.selectBestUtxo as jest.Mock).mockReturnValue({ txHash: "tx1", index: 0, lovelace: BigInt(1000) });

        // Mock Policy ID
        (policyModule.derivePolicyId as jest.Mock).mockResolvedValue("policy123");

        const ctx = {
            plutusFile: "/path/script.plutus",
            protocolFile: "/path/protocol.json",
            socketPath: "/tmp/node.socket",
            senderAddress: "addr_test1",
            redeemerJson: "{}",
            datumJson: "{}",
            testnetMagic: 1,
            assetName: "TOKEN" // hex: 544f4b454e
        };

        const resultJson = await simulatePlutus(ctx);
        const result = JSON.parse(resultJson);

        // Verify Output
        expect(result.result).toEqual({ executionUnits: 100 });
        expect(result.timingMs).toBeDefined();

        // Verify Steps
        expect(utxoModule.queryUtxos).toHaveBeenCalled();
        expect(policyModule.derivePolicyId).toHaveBeenCalled();

        // Verify Build Transaction Call
        expect(mockExecFile).toHaveBeenCalledWith(
            "cardano-cli",
            expect.arrayContaining([
                "transaction", "build-raw",
                "--mint-script-file", "/path/script.plutus"
            ]),
            expect.anything(),
            expect.anything()
        );

        // Verify Calculate Cost Call
        expect(mockExecFile).toHaveBeenCalledWith(
            "cardano-cli",
            expect.arrayContaining([
                "transaction", "calculate-plutus-script-cost"
            ]),
            expect.anything(),
            expect.anything()
        );
    });
});
