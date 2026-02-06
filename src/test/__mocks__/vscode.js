
// Minimal mock for vscode so tests don't crash on import
module.exports = {
    window: {
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        createOutputChannel: jest.fn(() => ({ appendLine: jest.fn() })),
    },
    workspace: {
        getConfiguration: jest.fn(),
        workspaceFolders: [],
    },
    commands: {
        registerCommand: jest.fn(),
        executeCommand: jest.fn(),
    },
    languages: {
        createDiagnosticCollection: jest.fn(() => ({
            clear: jest.fn(),
            set: jest.fn(),
            delete: jest.fn(),
            dispose: jest.fn(),
        })),
    },
    Uri: {
        file: (path) => ({ fsPath: path }),
        parse: (path) => ({ fsPath: path }),
    },
    Range: jest.fn(),
    Position: jest.fn(),
    TextEditorRevealType: {
        Default: 0,
        InCenter: 1,
        InCenterIfOutsideViewport: 2,
        AtTop: 3,
    },
    // Add more mocks as needed
};
