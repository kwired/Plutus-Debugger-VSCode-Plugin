
import { derivePolicyId } from "../simulator/policy";
import { execFile } from "child_process";

jest.mock("child_process");

describe("Policy Derivation", () => {
    it("should return trimmed policy ID from cardano-cli", async () => {
        const mockStdout = "  a1b2c3d4  \n";
        (execFile as any as jest.Mock).mockImplementation((cmd, args, opts, cb) => {
            if (typeof opts === 'function') {
                cb = opts;
            }
            cb(null, { stdout: mockStdout, stderr: "" });
        });

        const pid = await derivePolicyId("script.plutus");
        expect(pid).toBe("a1b2c3d4");
        expect(execFile).toHaveBeenCalledWith(
            "cardano-cli",
            expect.arrayContaining(["transaction", "policyid", "--script-file", "script.plutus"]),
            expect.anything()
        );
    });

    it("should reject on error", async () => {
        (execFile as any as jest.Mock).mockImplementation((cmd, args, opts, cb) => {
            if (typeof opts === 'function') {
                cb = opts;
            }
            cb(new Error("CLI failed"), "", "stderr error");
        });

        await expect(derivePolicyId("script.plutus")).rejects.toThrow("CLI failed");
    });
});
