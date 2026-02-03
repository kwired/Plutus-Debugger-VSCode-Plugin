import * as vscode from "vscode";
import { simulatePlutus } from "../simulator/simulator";
import { execFile } from "child_process";
import * as path from "path";

/**
 * Persistent workspace storage keys
 */
const STORAGE_KEYS = {
  plutus: "plutusSimulator.plutusFile",
  protocol: "plutusSimulator.protocolFile",
  address: "plutusSimulator.address",
  redeemer: "plutusSimulator.redeemer",
  datum: "plutusSimulator.datum",
  socket: "plutusSimulator.nodeSocket"
};

export class PlutusSimulatorView implements vscode.WebviewViewProvider {
  public static readonly viewType = "plutusSimulator.view";

  constructor(private readonly context: vscode.ExtensionContext) { }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    const styleUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "simulator.css")
    );

    const savedState = {
      plutusFile: this.context.workspaceState.get<string>(STORAGE_KEYS.plutus),
      protocolFile: this.context.workspaceState.get<string>(STORAGE_KEYS.protocol),
      socketFile: this.context.workspaceState.get<string>(STORAGE_KEYS.socket),
      address: this.context.workspaceState.get<string>(STORAGE_KEYS.address) ?? "",
      redeemer: this.context.workspaceState.get<string>(STORAGE_KEYS.redeemer) ?? "{}",
      datum: this.context.workspaceState.get<string>(STORAGE_KEYS.datum) ?? "{}"
    };

    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(styleUri);

    webviewView.webview.postMessage({
      type: "restoreState",
      state: savedState
    });

    let plutusFile: string | null = savedState.plutusFile ?? null;
    let protocolFile: string | null = savedState.protocolFile ?? null;
    let socketFile: string | null = savedState.socketFile ?? null;

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        /* ---------------- File Pickers ---------------- */

        if (msg.type === "pickSocket") {
          const file = await vscode.window.showOpenDialog({ canSelectMany: false });
          if (file) {
            socketFile = file[0].fsPath;
            await this.context.workspaceState.update(STORAGE_KEYS.socket, socketFile);
            webviewView.webview.postMessage({ type: "socketSelected", path: socketFile });
          }
        }

        if (msg.type === "pickPlutus") {
          const file = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { Plutus: ["plutus"] }
          });
          if (file) {
            plutusFile = file[0].fsPath;
            await this.context.workspaceState.update(STORAGE_KEYS.plutus, plutusFile);
            webviewView.webview.postMessage({ type: "plutusSelected", path: plutusFile });
          }
        }

        if (msg.type === "pickProtocol") {
          const file = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { JSON: ["json"] }
          });
          if (file) {
            protocolFile = file[0].fsPath;
            await this.context.workspaceState.update(STORAGE_KEYS.protocol, protocolFile);
            webviewView.webview.postMessage({ type: "protocolSelected", path: protocolFile });
          }
        }

        /* ---------------- Generate protocol.json ---------------- */

        if (msg.type === "generateProtocol") {
          if (!socketFile) {
            return webviewView.webview.postMessage({
              type: "protocolError",
              value: "node.socket must be selected first"
            });
          }

          if (typeof msg.magic !== "number") {
            return webviewView.webview.postMessage({
              type: "protocolError",
              value: "Invalid testnet magic"
            });
          }

          await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);

          const protocolPath = path.join(
            this.context.globalStorageUri.fsPath,
            "protocol.json"
          );

          execFile(
            "cardano-cli",
            [
              "query",
              "protocol-parameters",
              "--testnet-magic",
              String(msg.magic),
              "--out-file",
              protocolPath
            ],
            {
              env: {
                ...process.env,
                CARDANO_NODE_SOCKET_PATH: socketFile
              }
            },
            async (err, _stdout, stderr) => {
              if (err) {
                return webviewView.webview.postMessage({
                  type: "protocolError",
                  value: stderr || err.message
                });
              }

              protocolFile = protocolPath;
              await this.context.workspaceState.update(
                STORAGE_KEYS.protocol,
                protocolFile
              );

              webviewView.webview.postMessage({
                type: "protocolSelected",
                path: protocolFile
              });
            }
          );
        }

        /* ---------------- Simulation ---------------- */

        if (msg.type === "simulate") {
          if (!msg.assetName || typeof msg.assetName !== "string") {
            return webviewView.webview.postMessage({
              type: "simulateError",
              value: "Asset name is required"
            });
          }

          if (!plutusFile || !protocolFile || !socketFile) {
            return webviewView.webview.postMessage({
              type: "simulateError",
              value: "Plutus file, protocol.json and node.socket are required"
            });
          }

          await this.context.workspaceState.update(STORAGE_KEYS.address, msg.address);
          await this.context.workspaceState.update(STORAGE_KEYS.redeemer, msg.redeemer);
          await this.context.workspaceState.update(STORAGE_KEYS.datum, msg.datum);

          try {
            JSON.parse(msg.redeemer);
            JSON.parse(msg.datum);
          } catch {
            return webviewView.webview.postMessage({
              type: "simulateError",
              value: "Redeemer or Datum must be valid JSON"
            });
          }

          const result = await simulatePlutus({
            plutusFile,
            protocolFile,
            socketPath: socketFile,
            senderAddress: msg.address,
            redeemerJson: msg.redeemer,
            datumJson: msg.datum,
            testnetMagic: msg.magic ?? 1,
            assetName: msg.assetName
          });

          webviewView.webview.postMessage({ type: "result", value: result });
        }

        /* ---------------- Clear ---------------- */

        if (msg.type === "clearState") {
          plutusFile = null;
          protocolFile = null;
          socketFile = null;

          await this.context.workspaceState.update(STORAGE_KEYS.plutus, undefined);
          await this.context.workspaceState.update(STORAGE_KEYS.protocol, undefined);
          await this.context.workspaceState.update(STORAGE_KEYS.socket, undefined);
          await this.context.workspaceState.update(STORAGE_KEYS.address, "");
          await this.context.workspaceState.update(STORAGE_KEYS.redeemer, "{}");
          await this.context.workspaceState.update(STORAGE_KEYS.datum, "{}");

          webviewView.webview.postMessage({ type: "cleared" });
        }
      } catch (err: any) {
        webviewView.webview.postMessage({
          type: "simulateError",
          value: err?.message ?? String(err)
        });
      }
    });
  }

  /* ======================= WEBVIEW HTML ======================= */

  private getHtml(styleUri: vscode.Uri): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>

<div class="section">
  <div class="section-title">Scripts</div>

  <button id="pickSocket">Select node.socket</button>
  <div id="socketPath" class="file-path"></div>

  <button id="pickPlutus">Select .plutus</button>
  <div id="plutusPath" class="file-path"></div>

  <div class="sub-section">
    <div class="section-title">Network</div>

    <div class="network-row">
      <select id="network">
        <option value="preprod">Preprod (magic 1)</option>
        <option value="preview">Preview (magic 2)</option>
        <option value="custom">Custom</option>
      </select>
      <input id="customMagic" placeholder="magic" style="display:none"/>
    </div>

    <button id="generateProtocol" class="primary">Generate protocol.json</button>
    <div id="protocolStatus" class="status" style="display:none"></div>
  </div>

  <button id="pickProtocol">Select protocol.json</button>
  <div id="protocolPath" class="file-path"></div>
</div>

<div class="section">
  <div class="section-title">Context</div>
  <label>Sender Address</label>
  <input id="address" placeholder="addr_test1..." />
</div>
<label style="margin-top:6px">Asset Name (NFT)</label>
  <input
    id="assetName"
    placeholder="MyNFT"
    title="Human-readable asset name (will be hex-encoded)"
  />
<div class="section">
  <div class="section-title">Redeemer</div>
  <textarea id="redeemer">{}</textarea>
</div>

<div class="section">
  <div class="section-title">Datum</div>
  <textarea id="datum">{}</textarea>
</div>

<div class="actions">
  <button id="simulate" disabled>Simulate</button>
  <button id="clear" class="secondary">Clear</button>
</div>

<div class="section">
  <div class="section-title">Output</div>
  <pre id="out" class="output"></pre>
</div>

<script>
const vscode = acquireVsCodeApi();

const socketPath = document.getElementById("socketPath");
const plutusPath = document.getElementById("plutusPath");
const protocolPath = document.getElementById("protocolPath");
const addressInput = document.getElementById("address");
const redeemerInput = document.getElementById("redeemer");
const datumInput = document.getElementById("datum");
const simulateBtn = document.getElementById("simulate");
const out = document.getElementById("out");
const networkSelect = document.getElementById("network");
const customMagic = document.getElementById("customMagic");
const protocolStatus = document.getElementById("protocolStatus");
const assetNameInput = document.getElementById("assetName");

let hasSocket = false;
let hasPlutus = false;
let hasProtocol = false;

networkSelect.onchange = () => {
  customMagic.style.display =
    networkSelect.value === "custom" ? "block" : "none";
};

document.getElementById("generateProtocol").onclick = () => {
  let magic =
    networkSelect.value === "preprod" ? 1 :
      networkSelect.value === "preview" ? 2 :
        Number(customMagic.value);

  if (!magic || isNaN(magic)) {
    protocolStatus.style.display = "block";
    protocolStatus.className = "status error";
    protocolStatus.textContent = "Invalid testnet magic";
    return;
  }

  protocolStatus.style.display = "block";
  protocolStatus.className = "status";
  protocolStatus.textContent = "Generating protocol.json...";

  vscode.postMessage({ type: "generateProtocol", magic });
};

document.getElementById("pickSocket").onclick =
  () => vscode.postMessage({ type: "pickSocket" });
document.getElementById("pickPlutus").onclick =
  () => vscode.postMessage({ type: "pickPlutus" });
document.getElementById("pickProtocol").onclick =
  () => vscode.postMessage({ type: "pickProtocol" });

document.getElementById("simulate").onclick = () => {
  protocolStatus.style.display = "none";
  if (!assetNameInput.value.trim()) {
    out.textContent = "Asset name is required";
    out.className = "output error";
    return;
  }
  vscode.postMessage({
    type: "simulate",
    address: addressInput.value,
    redeemer: redeemerInput.value,
    datum: datumInput.value,
    assetName: assetNameInput.value
  });
};

document.getElementById("clear").onclick = () => {
  addressInput.value = "";
  redeemerInput.value = "{}";
  datumInput.value = "{}";
  vscode.postMessage({ type: "clearState" });
};

window.addEventListener("message", e => {
  const m = e.data;

  if (m.type === "restoreState") {
    if (m.state.socketFile) {
      hasSocket = true;
      socketPath.textContent = m.state.socketFile;
    }
    if (m.state.plutusFile) {
      hasPlutus = true;
      plutusPath.textContent = m.state.plutusFile;
    }
    if (m.state.protocolFile) {
      hasProtocol = true;
      protocolPath.textContent = m.state.protocolFile;
    }
    addressInput.value = m.state.address || "";
    redeemerInput.value = m.state.redeemer || "{}";
    datumInput.value = m.state.datum || "{}";
  }

  if (m.type === "socketSelected") {
    hasSocket = true;
    socketPath.textContent = m.path;
  }

  if (m.type === "plutusSelected") {
    hasPlutus = true;
    plutusPath.textContent = m.path;
  }

  if (m.type === "protocolSelected") {
    hasProtocol = true;
    protocolPath.textContent = m.path;
    protocolStatus.style.display = "block";
    protocolStatus.className = "status success";
    protocolStatus.textContent = "protocol.json generated\\n" + m.path;
  }

  if (m.type === "protocolError") {
    protocolStatus.style.display = "block";
    protocolStatus.className = "status error";
    protocolStatus.textContent = m.value;
  }

  if (m.type === "simulateError") {
    out.textContent = m.value;
    out.className = "output error";
  }

  if (m.type === "result") {
    out.textContent = m.value;
    out.className = "output success";
  }

  if (m.type === "cleared") {
    hasSocket = hasPlutus = hasProtocol = false;
    socketPath.textContent = plutusPath.textContent = protocolPath.textContent = "";
    protocolStatus.style.display = "none";
    out.textContent = "";
    out.className = "output";
  }

  simulateBtn.disabled = !(hasSocket && hasPlutus && hasProtocol);
});
</script>

</body>
</html>`;
  }
}
