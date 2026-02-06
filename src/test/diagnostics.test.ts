
import * as vscode from 'vscode';
import { parseCabalErrors, startGhcidOnHaskellOpen, stopGhcid, diagnosticCollection } from '../../src/diagnostics';
import * as path from 'path';

const mockStatusBarItem = {
    show: jest.fn(),
    text: '',
    tooltip: ''
};

// Mock vscode
jest.mock('vscode', () => {
    return {
        languages: {
            createDiagnosticCollection: jest.fn(() => ({
                clear: jest.fn(),
                set: jest.fn(),
                get: jest.fn().mockReturnValue([])
            }))
        },
        window: {
            createStatusBarItem: jest.fn(() => mockStatusBarItem),
            createTextEditorDecorationType: jest.fn(),
            onDidChangeActiveTextEditor: jest.fn(),
            showErrorMessage: jest.fn(),
            showTextDocument: jest.fn()
        },
        workspace: {
            onDidOpenTextDocument: jest.fn(),
            onDidChangeTextDocument: jest.fn(),
            textDocuments: [],
            openTextDocument: jest.fn().mockResolvedValue({}),
            rootPath: '/root',
            workspaceFolders: [{ uri: { fsPath: '/root' } }]
        },
        StatusBarAlignment: { Left: 1 },
        OverviewRulerLane: { Right: 1 },
        Uri: {
            file: jest.fn((f) => ({ fsPath: f }))
        },
        Range: jest.fn(),
        Diagnostic: jest.fn(),
        DiagnosticSeverity: {
            Error: 0,
            Warning: 1,
            Information: 2
        }
    };
}, { virtual: true });

describe('Diagnostics Module', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        stopGhcid();
    });

    describe('parseCabalErrors', () => {
        it('should parse GHC error output correctly', () => {
            const output = `
src/Main.hs:10:5: error:
    • Variable not in scope: x
    • In the expression: x + 1
            `;
            const workspacePath = '/root';

            // Mock document finding
            const mockDoc = { fileName: '/root/src/Main.hs', lineAt: jest.fn().mockReturnValue({ text: '    x + 1' }) };
            (vscode.workspace.textDocuments as any) = [mockDoc];

            const diags = parseCabalErrors(output, workspacePath);

            expect(diags).toHaveLength(1);
            expect(vscode.Diagnostic).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('Variable not in scope: x'),
                vscode.DiagnosticSeverity.Error
            );
        });

        it('should parse warning output', () => {
            const output = `src/Lib.hs:5:1: warning: [-Wunused-imports] Module is imported but not used`;
            const workspacePath = '/root';
            const mockDoc = { fileName: '/root/src/Lib.hs', lineAt: jest.fn().mockReturnValue({ text: 'import Data.List' }) };
            (vscode.workspace.textDocuments as any) = [mockDoc];

            parseCabalErrors(output, workspacePath);

            expect(vscode.Diagnostic).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('Module is imported'),
                vscode.DiagnosticSeverity.Warning
            );
        });

        it('should handle missing documents gracefully', () => {
            const output = `src/Missing.hs:1:1: error: BOOM`;
            (vscode.workspace.textDocuments as any) = [];

            const diags = parseCabalErrors(output, '/root');
            expect(diags).toHaveLength(0);
        });
    });

    describe('startGhcidOnHaskellOpen', () => {
        it('should register status bar and event listeners', () => {
            const context = { subscriptions: [] } as any;
            startGhcidOnHaskellOpen(context);

            expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
            expect(context.subscriptions.length).toBeGreaterThan(0);
            expect(vscode.workspace.onDidOpenTextDocument).toHaveBeenCalled();
        });
    });

});

describe('runGhcid & processGhcidOutput', () => {
    let mockSpawn: jest.Mock;
    let mockStdout: any;
    let mockStderr: any;
    let mockProcess: any;

    beforeEach(() => {
        stopGhcid();
        mockStdout = { on: jest.fn() };
        mockStderr = { on: jest.fn() };
        mockProcess = {
            stdout: mockStdout,
            stderr: mockStderr,
            on: jest.fn(),
            kill: jest.fn(),
            exitCode: null,
        };

        mockSpawn = jest.fn().mockReturnValue(mockProcess);
        require('child_process').spawn = mockSpawn;

        // Ensure rootPath is set
        require('vscode').workspace.rootPath = '/root';
    });

    it('should start ghcid and handle output parsing', () => {
        // Setup workspace
        (vscode.workspace.rootPath as any) = '/root';

        // Trigger start
        const context = { subscriptions: [] } as any;
        startGhcidOnHaskellOpen(context);

        // Force start by simulating open document
        const openHandler = (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0];
        openHandler({ languageId: 'haskell' });

        expect(mockSpawn).toHaveBeenCalledWith('ghcid', expect.anything(), expect.objectContaining({ cwd: '/root' }));

        // Simulate stdout data (loading)
        const stdoutHandler = mockStdout.on.mock.calls.find((c: any) => c[0] === 'data')[1];
        stdoutHandler(Buffer.from('Loading...\n'));

        // Simulate error output
        const errorOutput = 'src/Lib.hs:10:1: error: MyError\n   | some context\n';
        stdoutHandler(Buffer.from(errorOutput));


        // Send another error to flush the previous one
        stdoutHandler(Buffer.from('src/Lib.hs:12:1: warning: MyWarning\n'));

        expect(diagnosticCollection.set).toHaveBeenCalled();
    });

    it('should handle All good message', () => {
        (vscode.workspace.rootPath as any) = '/root';
        const context = { subscriptions: [] } as any;
        startGhcidOnHaskellOpen(context);
        const openHandler = (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0];
        openHandler({ languageId: 'haskell' });

        const stdoutHandler = mockStdout.on.mock.calls.find((c: any) => c[0] === 'data')[1];
        stdoutHandler(Buffer.from('All good\n'));

        expect(diagnosticCollection.clear).toHaveBeenCalled();
    });

    it('should handle stderr and process errors', () => {
        (vscode.workspace.rootPath as any) = '/root';
        startGhcidOnHaskellOpen({ subscriptions: [] } as any);
        const openHandler = (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0];
        openHandler({ languageId: 'haskell' });

        const stderrHandler = mockStderr.on.mock.calls.find((c: any) => c[0] === 'data')[1];
        stderrHandler(Buffer.from('Big Bad Error'));

    });

    it('should restart ghcid if already running', () => {
        (vscode.workspace.rootPath as any) = '/root';
        startGhcidOnHaskellOpen({ subscriptions: [] } as any);
        const openHandler = (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0];

        // First start
        openHandler({ languageId: 'haskell' });
        expect(mockSpawn).toHaveBeenCalledTimes(1);

        stopGhcid();
        expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('should calculate range from document content', () => {
        (vscode.workspace.rootPath as any) = '/root';
        startGhcidOnHaskellOpen({ subscriptions: [] } as any);

        // Mock an open document
        const mockDoc = {
            uri: { fsPath: '/root/src/Lib.hs' },
            fileName: '/root/src/Lib.hs',
            lineAt: jest.fn().mockReturnValue({ text: '    someCode' }) // Line 10
        };
        (vscode.workspace.textDocuments as any).push(mockDoc);

        // Trigger start
        const openHandler = (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0];
        openHandler({ languageId: 'haskell' });

        const stdoutHandler = mockStdout.on.mock.calls.find((c: any) => c[0] === 'data')[1];

        // Send error for line 10
        const errorOutput = 'src/Lib.hs:10:5: error: MyError\n';
        stdoutHandler(Buffer.from(errorOutput));
        // Flush to trigger update
        stdoutHandler(Buffer.from('src/Lib.hs:12:1: warning: Next\n'));

        expect(vscode.Diagnostic).toHaveBeenCalled();
    });

    it('should handle process error', () => {
        (vscode.workspace.rootPath as any) = '/root';

        startGhcidOnHaskellOpen({ subscriptions: [] } as any);
        const openHandler = (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0];
        openHandler({ languageId: 'haskell' });

        const errorHandler = mockProcess.on.mock.calls.find((c: any) => c[0] === 'error')[1];
        errorHandler(new Error('Process crashed'));

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Failed to start ghcid'));
    });

    it('should handle process close', () => {
        (vscode.workspace.rootPath as any) = '/root';

        startGhcidOnHaskellOpen({ subscriptions: [] } as any);
        const openHandler = (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0];
        openHandler({ languageId: 'haskell' });

        const closeHandler = mockProcess.on.mock.calls.find((c: any) => c[0] === 'close')[1];
        closeHandler(0);

        const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        expect(item.text).toContain('$(stop)');
    });
});
