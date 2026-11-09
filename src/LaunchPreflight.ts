import {
  createPublicClient,
  defineChain,
  http,
  type Abi,
  type Address,
  type Hex
} from "viem";

import factoryAbiJson from "./abis/LaunchFactory.json";

const FACTORY = "0x38D3ef3A06D18fA3286Fb5dEAfe611be725fcD15" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

  const [enabled, launchFeeRaw, configRaw] = await Promise.all([
    publicClient.readContract({
      address: FACTORY,
      abi: factoryAbi,
      functionName: "launchEnabled"
    }),
    publicClient.readContract({
      address: FACTORY,
      abi: factoryAbi,
      functionName: "launchFee"
    }),
    publicClient.readContract({
      address: FACTORY,
      abi: factoryAbi,
      functionName: "getConfig",
      args: [params.configId]
    })
  ]);

  const launchFee = launchFeeRaw as bigint;
  const config = configRaw as {
    exists: boolean;
    enabled: boolean;
    quote: Address;
    baseSupply: bigint;
    totalFeePips: bigint;
  };

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
    address: FACTORY,
    abi: factoryAbi,
    functionName: "predictTokenAddress",
    args: [account, params.salt, params.configId]
  });

  const simulation = await publicClient.simulateContract({
    account,
    address: FACTORY,
    abi: factoryAbi,
    functionName: "launch",
    args: [params],
    value
  });

  return {
    success: true as const,
    predictedToken,
    value,
    launchFee,
    firstBuyAmount: params.firstBuyAmount,
    configId: params.configId,
    simulationResult: simulation.result
  };
}
