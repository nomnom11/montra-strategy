import {
  createPublicClient,
  defineChain,
  http,
  stringToHex,
  type Abi,
  type Address,
  type Hex
} from "viem";

import factoryAbiJson from "./abis/LaunchFactory.json";

const REGISTRY = "0xF1E2FA75422F889e565F3142bdbf60B28dce2aa7" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const registryAbi = [{
  type: "function",
  name: "get",
  stateMutability: "view",
  inputs: [{ name: "key", type: "bytes32" }],
  outputs: [{ name: "", type: "address" }]
}] as const;

const factoryAbi = factoryAbiJson as Abi;

const elysium = defineChain({
  id: 99901,
  name: "Elysium",
  nativeCurrency: {
    name: "HYPE",
    symbol: "HYPE",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.montramarkets.xyz"]
    }
  }
});

const publicClient = createPublicClient({
  chain: elysium,
  transport: http()
});

export type LaunchParams = {
  name: string;
  symbol: string;
  metadataURI: string;
  profile: {
    logo: string;
    description: string;
    socials: {
      telegram: string;
      twitter: string;
      discord: string;
      website: string;
      extra: string;
    };
  };
  configId: bigint;
  supply: bigint;
  salt: Hex;
  feeRecipients: Address[];
  feeShares: number[];
  firstBuyAmount: bigint;
  firstBuyMinOut: bigint;
  permit: {
    deadline: bigint;
    v: number;
    r: Hex;
    s: Hex;
  };
};

export async function runLaunchPreflight(
  account: Address,
  params: LaunchParams,
  expectedConfig: { baseSupply: bigint; totalFeePips: bigint; quoteAddress: Address }
) {
  if (params.feeRecipients.length !== params.feeShares.length) {
    throw new Error("Fee recipients and fee shares must have equal lengths.");
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(params.salt)) {
    throw new Error("Invalid launch salt.");
  }

  const factoryAddress = await publicClient.readContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: "get",
    args: [stringToHex("factory", { size: 32 })]
  });

  if (factoryAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    throw new Error("Registry returned a zero Factory address.");
  }

  const factoryCode = await publicClient.getBytecode({ address: factoryAddress });
  if (!factoryCode || factoryCode === "0x") {
    throw new Error("Factory address from Registry has no contract bytecode.");
  }

  const [enabled, launchFeeRaw, configRaw] = await Promise.all([
    publicClient.readContract({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "launchEnabled"
    }),
    publicClient.readContract({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "launchFee"
    }),
    publicClient.readContract({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "getConfig",
      args: [params.configId]
    })
  ]);

  const launchFee = launchFeeRaw as bigint;
  const config = configRaw as {
    moduleSetId: bigint;
    exists: boolean;
    enabled: boolean;
    quote: Address;
    baseSupply: bigint;
    totalFeePips: bigint;
  };

  const moduleSet = await publicClient.readContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: "getModuleSet",
    args: [config.moduleSetId]
  }) as {
    hook: Address;
    tokenMaster: Address;
    splitterMaster: Address;
    exists: boolean;
  };

  if (!moduleSet.exists) {
    throw new Error("Selected Module Set does not exist.");
  }

  const moduleAddresses = [
    moduleSet.hook,
    moduleSet.tokenMaster,
    moduleSet.splitterMaster
  ];

  for (const moduleAddress of moduleAddresses) {
    if (moduleAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
      throw new Error("Module Set contains a zero module address.");
    }

    const moduleCode = await publicClient.getBytecode({
      address: moduleAddress
    });

    if (!moduleCode || moduleCode === "0x") {
      throw new Error("A Module Set contract has no bytecode.");
    }
  }

  if (!enabled) {
    throw new Error("Factory launch is currently disabled.");
  }

  if (!config.exists || !config.enabled) {
    throw new Error("Selected launch configuration is unavailable.");
  }

  if (config.baseSupply !== expectedConfig.baseSupply) {
    throw new Error("Factory base supply differs from the selected configuration.");
  }

  if (config.totalFeePips !== expectedConfig.totalFeePips) {
    throw new Error("Factory fee differs from the selected configuration.");
  }

  if (config.quote.toLowerCase() !== expectedConfig.quoteAddress.toLowerCase()) {
    throw new Error("Factory quote asset differs from the selected configuration.");
  }

  if (config.quote.toLowerCase() !== ZERO_ADDRESS.toLowerCase()) {
    throw new Error(
      "This preflight currently supports native HYPE quote configurations only."
    );
  }

  const value = launchFee + params.firstBuyAmount;

  const predictedToken = await publicClient.readContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: "predictTokenAddress",
    args: [account, params.salt, params.configId]
  });

  const simulation = await publicClient.simulateContract({
    account,
    address: factoryAddress,
    abi: factoryAbi,
    functionName: "launch",
    args: [params],
    value
  });

  const [estimatedGas, gasPrice] = await Promise.all([publicClient.estimateContractGas({ account, address: factoryAddress, abi: factoryAbi, functionName: "launch", args: [params], value }), publicClient.getGasPrice()]);
  const estimatedGasCost = estimatedGas * gasPrice;

  return {
    factoryAddress,
    success: true as const,
    predictedToken,
    value,
    launchFee,
    firstBuyAmount: params.firstBuyAmount,
    configId: params.configId,
    estimatedGas,
    gasPrice,
    estimatedGasCost,
    simulationResult: simulation.result
  };
}
