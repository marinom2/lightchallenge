export interface CanonicalRecord { [k: string]: any }

export interface AdapterResult {
  records: CanonicalRecord[];
  publicSignals: bigint[];
  dataHash: `0x${string}`;
}

export interface AdapterContext {
  challengeId: bigint;
  subject: `0x${string}`;
  modelHash: `0x${string}`;
  params: Record<string, any>;
}

export interface Adapter {
  name: string;
  /** Category: "fitness" | "gaming" — used for provider selection */
  category?: "fitness" | "gaming";
  supports(modelHash: string): boolean;
  ingest(input: { file?: Buffer; json?: any; context: AdapterContext }): Promise<AdapterResult>;
}
