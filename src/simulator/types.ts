export type SimulationRequest = {
    txBodyPath: string;
    protocolParamsPath: string;
    network: 'mainnet' | { testnetMagic: number };
};

export type SimulationEvent =
    | { type: 'start' }
    | { type: 'phase'; name: string }
    | { type: 'breakpoint'; location: string }
    | { type: 'end'; success: boolean; cost?: unknown };

export type SimulationListener = (event: SimulationEvent) => void;

export interface SimulationContext {
    plutusFile: string;
    protocolFile: string;
    socketPath: string;
    senderAddress: string;
    testnetMagic: number;
    redeemerJson: string;
    datumJson: string;
    assetName: string;
}

export interface UTxO {
    txHash: string;
    index: number;
    lovelace: bigint;
}
