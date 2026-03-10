// app/validators/types.ts
// Central shared types for all validator components and hooks

export type ModelParam = {
    key: string;
    label: string;
    type?: "text" | "number" | "int" | "date" | "datetime" | "bool";
    placeholder?: string;
  
    /** Support both default & defaultValue for UI/Hooks compatibility */
    default?: any;
    defaultValue?: any;
    required?: boolean;
  };
  
  export type UiModel = {
    name: string;
    modelHash: `0x${string}`;
    verifierKind: "AIVM" | "ZK";
    providers?: Array<"steam">;
    params?: ModelParam[];
    notes?: string;
  };