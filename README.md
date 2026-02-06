# Plutus Debugger for VSCode

![Coverage](https://img.shields.io/badge/coverage-90%25-brightgreen)

This is a VSCode extension designed to make life easier when working with Plutus smart contracts on Cardano. It combines a standard GHCi-based Haskell debugger with a custom simulator so you can build and test transactions without leaving your editor.

## What it actually does

There are two main parts to this:

1.  **Haskell Debugger**: Standard debugging stuff. You can set breakpoints in your `.hs` files, step through code, and check variables. It uses GHCi under the hood but speaks the DAP protocol so it feels native to VSCode.
2.  **Plutus Simulator**: A visual tool where you can pick UTxOs, handle policy IDs, and simulate transactions to see if they'll actually run (and how much they'll cost) before you try to deploy anything.

It also runs `ghcid` in the background to highlight errors and warnings as you type, so you catch issues early.

## Getting Setup

You'll need a few things installed on your machine for this to work:

*   **Node.js**: The extension runs on this.
*   **GHC & Cabal**: Standard Haskell toolchain.
*   **ghcid**: If you want the live error checking.
*   **cardano-cli**: Needed if you're using the simulator to query UTxOs.

## How to build it

If you want to run this from source:

1.  Clone this repo.
2.  Run `npm install` to grab the dependencies.
3.  Run `npm run compile` to build the extension.

To test it out, just hit `F5` in VSCode to launch a new window with the extension loaded.

## How to use it

### Debugging Haskell
Open up your Haskell project (make sure it's a Cabal project). Go to the **Run and Debug** tab in VSCode and choose **"Debug Cabal Project"**. Hit start, and once it loads (give it a second to spin up GHCi), you should be able to hit your breakpoints.

### Using the Simulator
You'll see a little Plutus icon in the Activity Bar. Click that to open the simulator view.
From there you can use the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) to trigger things like `Simulate Plutus Transaction` or `Get latest UTXO Details` if you have a local node running.

## Running Tests

We've got a pretty decent test suite set up with Jest.

*   Run everything: `npm test`
*   Check coverage: `npm test -- --coverage`

(We're currently aiming for >90% coverage on core modules, and we're hitting that target.)

## Contributing

If you find a bug or want to add something, feel free to open a PR. Just fork the repo, create a branch, and send it over.

## License

MIT
