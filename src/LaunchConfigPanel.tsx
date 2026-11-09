import { useEffect, useState } from "react";
import { createPublicClient, formatUnits, http } from "viem";

const FACTORY = "0x38D3ef3A06D18fA3286Fb5dEAfe611be725fcD15" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const KNTQ_ADDRESS = "0xe45a355d9e9cAd2aD85F2d03E3eE3102A036acF0";
const getQuoteSymbol = (address: string) => address.toLowerCase() === ZERO_ADDRESS.toLowerCase() ? "HYPE" : address.toLowerCase() === KNTQ_ADDRESS.toLowerCase() ? "KNTQ" : address;

const factoryAbi = [
  {
    type: "function",
    name: "configCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "getConfig",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{
      name: "cfg",
      type: "tuple",
      components: [
        { name: "moduleSetId", type: "uint256" },
        { name: "quote", type: "address" },
        { name: "baseSupply", type: "uint256" },
        { name: "tickSpacing", type: "int24" },
        { name: "startTick", type: "int24" },
        { name: "graduationTicks", type: "uint24" },
        { name: "lpLineTicks", type: "uint24" },
        { name: "totalFeePips", type: "uint24" },
        { name: "totalFeeMinPips", type: "uint24" },
        { name: "protocolFeePips", type: "uint24" },
        { name: "lpFeePips", type: "uint24" },
        { name: "earlyBuyFeeStartPips", type: "uint24" },
        { name: "earlyBuyFeeWindow", type: "uint32" },
        { name: "liquidityPolicy", type: "address" },
        { name: "liquiditySealed", type: "bool" },
        { name: "streamDuration", type: "uint32" },
        { name: "pushBountyBps", type: "uint16" },
        { name: "pushFloor", type: "uint128" },
        { name: "enabled", type: "bool" },
        { name: "exists", type: "bool" }
      ]
    }]
  }
] as const;

type LaunchConfig = {
  baseSupply: bigint;
  quote: string;
  totalFeePips: bigint;
  enabled: boolean;
  exists: boolean;
};

type ConfigOption = LaunchConfig & { id: number };

export type LaunchConfigSummary = {
  id: number;
  supply: string;
  fee: string;
  quote: string;
  baseSupply: bigint;
  totalFeePips: bigint;
  quoteAddress: string;
};

type Props = {
  onSelectionChange: (config: LaunchConfigSummary | null) => void;
};

const client = createPublicClient({
  transport: http("https://rpc.montramarkets.xyz")
});

export default function LaunchConfigPanel({ onSelectionChange }: Props) {
  const [configs, setConfigs] = useState<ConfigOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadConfigs() {
      try {
        setLoading(true);
        setError("");

        const count = await client.readContract({
          address: FACTORY,
          abi: factoryAbi,
          functionName: "configCount"
        });

        const ids = Array.from({ length: Number(count) }, (_, id) => id);
        const results = await Promise.all(ids.map(async (id) => {
          const cfg = await client.readContract({
            address: FACTORY,
            abi: factoryAbi,
            functionName: "getConfig",
            args: [BigInt(id)]
          }) as unknown as LaunchConfig;

          return { id, ...cfg };
        }));

        const active = results.filter((cfg) => cfg.exists && cfg.enabled);
        if (!cancelled) {
          setConfigs(active);
          setSelectedId(active.length ? String(active[0].id) : "");
          if (!active.length) setError("No active launch configurations found.");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load Montra configurations.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadConfigs();
    return () => { cancelled = true; };
  }, []);

  const selected = configs.find((cfg) => String(cfg.id) === selectedId);
  useEffect(() => {
    if (!selected) {
      onSelectionChange(null);
      return;
    }

    onSelectionChange({
      id: selected.id,
      supply: Number(formatUnits(selected.baseSupply, 18)).toLocaleString("en-US", { maximumFractionDigits: 4 }),
      fee: `${(Number(selected.totalFeePips) / 10000).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`,
      quote: getQuoteSymbol(selected.quote),
      baseSupply: selected.baseSupply,
      totalFeePips: selected.totalFeePips,
      quoteAddress: selected.quote
    });
  }, [selected, onSelectionChange]);

  const supply = selected
    ? Number(formatUnits(selected.baseSupply, 18)).toLocaleString("en-US", { maximumFractionDigits: 4 })
    : "—";
  const fee = selected
    ? `${(Number(selected.totalFeePips) / 10000).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`
    : "—";
  const quote = selected
    ? (getQuoteSymbol(selected.quote))
    : "—";

  return (
    <div className="launch-config-panel">
      <div className="config-panel-heading">
        <label htmlFor="montra-config">Launch configuration <span className="optional">Live from Montra Factory</span></label>
        <span className="config-live"><i /> READ ONLY</span>
      </div>
      {loading ? (
        <p className="config-message">Loading active configurations from Montra…</p>
      ) : error ? (
        <p className="config-message config-error">{error}</p>
      ) : (
        <>
          <select id="montra-config" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {configs.map((cfg) => (
              <option key={cfg.id} value={cfg.id}>
                Tier {cfg.id + 1} · {getQuoteSymbol(cfg.quote)} · {Number(cfg.totalFeePips) / 10000}% fee · {Number(formatUnits(cfg.baseSupply, 18)).toLocaleString("en-US")} supply
              </option>
            ))}
          </select>
          {selected && (
            <div className="config-details">
              <span><small>BASE SUPPLY</small><b>{supply}</b></span>
              <span><small>TOTAL FEE</small><b>{fee}</b></span>
              <span><small>QUOTE ASSET</small><b>{quote}</b></span>
            </div>
          )}
          <p className="config-message">Configuration is read-only. No transaction will be sent.</p>
        </>
      )}
    </div>
  );
}
