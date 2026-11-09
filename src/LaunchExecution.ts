import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  defineChain,
  http,
  parseAbi,
  stringToHex,
  type Abi,
  type Address,
  type Hex
} from "viem";

import factoryAbiJson from "./abis/LaunchFactory.json";
import { runLaunchPreflight, type LaunchParams } from "./LaunchPreflight";

type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type ExpectedConfig = {
  baseSupply: bigint;
  totalFeePips: bigint;
  quoteAddress: Address;
};

const REGISTRY = "0xF1E2FA75422F889e565F3142bdbf60B28dce2aa7" as const;
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
  transport: http("https://rpc.montramarkets.xyz")
});

const registryAbi = parseAbi([
  "function get(bytes32 key) view returns (address)"
]);

const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
]);

export async function approveQuoteToken(
  provider: WalletProvider,
  account: Address,
  firstBuyAmount: bigint,
  expectedConfig: ExpectedConfig
) {
  if (firstBuyAmount <= 0n) {
    throw new Error("First Buy harus lebih besar dari 0 untuk approval.");
  }

  const tokenAddress = expectedConfig.quoteAddress;

  if (tokenAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    throw new Error("Konfigurasi ini menggunakan HYPE. Approval ERC20 tidak diperlukan.");
  }

  const walletClient = createWalletClient({
    chain: elysium,
    transport: custom(provider as any)
  });

  const [chainId, accounts] = await Promise.all([
    walletClient.getChainId(),
    walletClient.requestAddresses()
  ]);

  if (chainId !== 99901) {
    throw new Error("Wallet harus berada di jaringan Elysium.");
  }

  if (!accounts[0] || accounts[0].toLowerCase() !== account.toLowerCase()) {
    throw new Error("Akun wallet berubah. Hubungkan ulang wallet.");
  }

  const currentFactory = await publicClient.readContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: "get",
    args: [stringToHex("factory", { size: 32 })]
  });

  if (
    currentFactory.toLowerCase() === ZERO_ADDRESS.toLowerCase()
  ) {
    throw new Error("Alamat Factory tidak sesuai Registry. Muat ulang konfigurasi.");
  }

  const [balance, allowance] = await Promise.all([
    publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account]
    }),
    publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, currentFactory]
    })
  ]);

  if (balance < firstBuyAmount) {
    throw new Error("Saldo KNTQ tidak cukup untuk First Buy.");
  }

  if (allowance >= firstBuyAmount) {
    return { success: true as const, alreadyApproved: true as const };
  }

  const hash = await walletClient.writeContract({
    account,
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "approve",
    args: [currentFactory, firstBuyAmount]
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status !== "success") {
    throw new Error(`Approval KNTQ gagal. Hash: ${hash}`);
  }

  const updatedAllowance = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account, currentFactory]
  });

  if (updatedAllowance < firstBuyAmount) {
    throw new Error("Transaksi approval selesai, tetapi allowance masih belum cukup.");
  }

  return {
    success: true as const,
    alreadyApproved: false as const,
    transactionHash: hash
  };
}

export async function executeLaunch(
  provider: WalletProvider,
  account: Address,
  params: LaunchParams,
  expectedFactoryAddress: Address,
  expectedConfig: ExpectedConfig
) {
  const walletClient = createWalletClient({
    chain: elysium,
    transport: custom(provider as any)
  });

  const [chainId, accounts] = await Promise.all([
    walletClient.getChainId(),
    walletClient.requestAddresses()
  ]);

  if (chainId !== 99901) {
    throw new Error("Wallet harus berada di jaringan Elysium.");
  }

  if (
    !accounts[0] ||
    accounts[0].toLowerCase() !== account.toLowerCase()
  ) {
    throw new Error("Akun wallet berubah. Hubungkan ulang dan jalankan Preflight.");
  }

  const currentFactory = await publicClient.readContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: "get",
    args: [stringToHex("factory", { size: 32 })]
  });

  if (
    currentFactory.toLowerCase() !== expectedFactoryAddress.toLowerCase()
  ) {
    throw new Error("Factory Registry berubah. Jalankan Preflight kembali.");
  }

  if (currentFactory.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    throw new Error("Registry mengembalikan alamat Factory kosong.");
  }

  // Simulasi ulang memakai salt dan parameter yang sama.
  const freshPreflight = await runLaunchPreflight(
    account,
    params,
    expectedConfig
  );

  if (
    freshPreflight.factoryAddress.toLowerCase() !==
    currentFactory.toLowerCase()
  ) {
    throw new Error("Factory berubah selama pemeriksaan. Transaksi dibatalkan.");
  }

  const hash = await walletClient.writeContract({
    account,
    address: currentFactory,
    abi: factoryAbi,
    functionName: "launch",
    args: [params],
    value: freshPreflight.value
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status !== "success") {
    throw new Error(`Transaksi gagal. Hash: ${hash}`);
  }

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== currentFactory.toLowerCase()) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: factoryAbi,
        eventName: "TokenLaunched",
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]]
      });

      const args = decoded.args as unknown as {
        token: Address;
        creator: Address;
        poolId: Hex;
        configId: bigint;
      };

      if (
        args.creator.toLowerCase() !== account.toLowerCase() ||
        args.configId !== params.configId
      ) {
        continue;
      }

      if (
        args.token.toLowerCase() !==
        String(freshPreflight.predictedToken).toLowerCase()
      ) {
        throw new Error(
          `Token event berbeda dari prediksi. Periksa transaksi: ${hash}`
        );
      }

      return {
        success: true as const,
        transactionHash: hash,
        token: args.token,
        poolId: args.poolId,
        receipt
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Token event berbeda")
      ) {
        throw error;
      }
    }
  }

  throw new Error(
    `Transaksi berhasil, tetapi event TokenLaunched belum dapat diverifikasi. Hash: ${hash}`
  );
}
