import "hardhat";

declare module "hardhat/types/runtime" {
  interface HardhatRuntimeEnvironment {
    ethers: typeof import("ethers");
    deployments: import("hardhat-deploy/types").DeploymentsExtension;
    getNamedAccounts: () => Promise<Record<string, string>>;
  }
}