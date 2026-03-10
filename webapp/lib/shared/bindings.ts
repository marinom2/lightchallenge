export type Binding = { subject: `0x${string}`; provider: string; external_id: string };

export const BINDINGS_PATH = "webapp/data/bindings.json"; // relative to repo root