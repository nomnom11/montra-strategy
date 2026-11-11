import { useCallback, useMemo, useState } from "react";
import LaunchConfigPanel, { type LaunchConfigSummary } from "./LaunchConfigPanel";
import { uploadTokenMetadata } from "./metadata";
import { createWalletClient, custom, defineChain, formatEther, parseEther, type Address, type Hex } from "viem";
import { runLaunchPreflight, type LaunchParams } from "./LaunchPreflight";
import { approveQuoteToken, executeLaunch } from "./LaunchExecution";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  providers?: Eip1193Provider[];
  isOkxWallet?: boolean;
  isOKXWallet?: boolean;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    okxwallet?: Eip1193Provider;
  }
}

function getWalletProvider(): Eip1193Provider | undefined {
  if (window.okxwallet) return window.okxwallet;
  const providers = window.ethereum?.providers;
  const okxProvider = providers?.find(
    (provider) => provider.isOkxWallet || provider.isOKXWallet
  );
  return okxProvider ?? window.ethereum;
}
import {
  ArrowRight, ArrowUpRight, Check, ExternalLink, Menu, ShieldCheck, Sparkles, Wallet, X
} from "lucide-react";

type TokenForm = {
  name: string;
  symbol: string;
  description: string;
  website: string;
  twitter: string;
};

const initialForm: TokenForm = {
  name: "",
  symbol: "",
  description: "",
  website: "",
  twitter: ""
};

function App() {
  const [form, setForm] = useState<TokenForm>(initialForm);
  const [showForm, setShowForm] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [logoName, setLogoName] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [imageUri, setImageUri] = useState("");
  const [metadataUri, setMetadataUri] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletStatus, setWalletStatus] = useState("Not connected");
  const [launchConfig, setLaunchConfig] = useState<LaunchConfigSummary | null>(null);
  const [firstBuyInput, setFirstBuyInput] = useState("0");
  const [showReview, setShowReview] = useState(false);
  const [isPreflightRunning, setIsPreflightRunning] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState("");
  const [preflightStatus, setPreflightStatus] = useState("");
  const [predictedToken, setPredictedToken] = useState("");
  const [estimatedGas, setEstimatedGas] = useState("");
  const [estimatedGasCost, setEstimatedGasCost] = useState("");
  const [preparedLaunch, setPreparedLaunch] = useState<{ params: LaunchParams; factoryAddress: Address; expectedConfig: { baseSupply: bigint; totalFeePips: bigint; quoteAddress: Address } } | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchStatus, setLaunchStatus] = useState("");
  const [transactionHash, setTransactionHash] = useState("");
  const [launchedToken, setLaunchedToken] = useState("");
  const handleLaunchConfigSelection = useCallback((config: LaunchConfigSummary | null) => {
    setLaunchConfig(config);
    setPreflightStatus("");
    setPredictedToken("");
    setPreparedLaunch(null);
    setApprovalStatus("");
  }, []);

  const canPreview = useMemo(
    () =>
      form.name.trim().length > 0 &&
      form.symbol.trim().length > 0 &&
      Boolean(logoFile) &&
      Boolean(imageUri) &&
      Boolean(metadataUri) &&
      !isUploading,
    [form.name, form.symbol, logoFile, imageUri, metadataUri, isUploading]
  );

  const update = (key: keyof TokenForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setMetadataUri("");
    setUploadStatus("");
    setPreflightStatus("");
    setPredictedToken("");
    setPreparedLaunch(null);
  };

  const handleMetadataUpload = async () => {
    if (!logoFile) { setUploadStatus("Pilih file logo terlebih dahulu."); return; }
    if (!form.name.trim()) { setUploadStatus("Isi nama token terlebih dahulu."); return; }
    if (!form.symbol.trim()) { setUploadStatus("Isi ticker terlebih dahulu."); return; }
    try {
      setIsUploading(true);
      setUploadStatus("Uploading logo and metadata...");
      const result = await uploadTokenMetadata({
        file: logoFile,
        name: form.name.trim(),
        symbol: form.symbol.trim(),
        description: form.description.trim(),
        website: form.website.trim(),
        twitter: form.twitter.trim()
      });
      setImageUri(result.imageUri);
      setMetadataUri(result.metadataUri);
      setUploadStatus("Upload successful. Metadata is ready.");
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleApproveQuote = async () => {
    if (!walletAddress || !launchConfig) {
      setApprovalStatus("Hubungkan wallet dan pilih konfigurasi terlebih dahulu.");
      return;
    }
    if (launchConfig.quoteAddress.toLowerCase() === "0x0000000000000000000000000000000000000000") {
      setApprovalStatus("Konfigurasi HYPE tidak memerlukan approval ERC20.");
      return;
    }
    const firstBuyValue = firstBuyInput.trim() || "0";
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(firstBuyValue) || (firstBuyValue.includes(".") && firstBuyValue.split(".")[1].length > 18)) {
      setApprovalStatus("First Buy harus berupa angka non-negatif dengan maksimal 18 desimal.");
      return;
    }
    const amount = parseEther(firstBuyValue);
    if (amount <= 0n) {
      setApprovalStatus("Isi First Buy KNTQ lebih besar dari 0 untuk melakukan approval.");
      return;
    }
    const provider = getWalletProvider();
    if (!provider) {
      setApprovalStatus("Wallet tidak ditemukan.");
      return;
    }
    try {
      setIsApproving(true);
      setApprovalStatus("Memeriksa saldo dan allowance KNTQ...");
      const expectedConfig = {
        baseSupply: launchConfig.baseSupply,
        totalFeePips: launchConfig.totalFeePips,
        quoteAddress: launchConfig.quoteAddress as Address
      };
      const result = await approveQuoteToken(
        provider,
        walletAddress as Address,
        amount,
        expectedConfig
      );
      setPreparedLaunch(null);
      setPreflightStatus("");
      setApprovalStatus(result.alreadyApproved
        ? "Allowance KNTQ sudah mencukupi. Silakan jalankan Preflight."
        : "Approval KNTQ berhasil. Silakan jalankan Preflight kembali. Transaction: " + result.transactionHash);
    } catch (error) {
      console.error("[APPROVAL ERROR]", error);
      setApprovalStatus(error instanceof Error ? error.message : "Approval gagal.");
    } finally {
      setIsApproving(false);
    }
  };

  const handlePreflight = async () => {
    console.log("[PREFLIGHT] Button clicked");
    setPreflightStatus("Preflight dimulai...");
    if (!walletAddress || !launchConfig || !metadataUri || !imageUri) {
      setPreflightStatus("Lengkapi data token, konfigurasi, dan koneksi wallet terlebih dahulu.");
      return;
    }

    const provider = getWalletProvider();
    if (!provider) {
      setPreflightStatus("Wallet tidak ditemukan.");
      return;
    }

    try {
      setIsPreflightRunning(true);
      setPreflightStatus("Memeriksa jaringan dan konfigurasi Factory...");
      setPredictedToken("");

      const walletClient = createWalletClient({
        chain: defineChain({
          id: 99901,
          name: "Elysium",
          nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
          rpcUrls: { default: { http: ["https://rpc.montramarkets.xyz"] } }
        }),
        transport: custom(provider as any)
      });

      const chainId = await walletClient.getChainId();
      if (chainId !== 99901) {
        throw new Error("Wallet harus berada di jaringan Elysium (Chain ID 99901).");
      }

      const zeroHash = ("0x" + "0".repeat(64)) as Hex;
      const salt = ("0x" + Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        (byte) => byte.toString(16).padStart(2, "0")
      ).join("")) as Hex;

      const firstBuyValue = firstBuyInput.trim() || "0";
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(firstBuyValue) || (firstBuyValue.includes(".") && firstBuyValue.split(".")[1].length > 18)) throw new Error("First Buy harus berupa angka non-negatif dengan maksimal 18 angka desimal.");
      const firstBuyAmount = parseEther(firstBuyValue);
      const params: LaunchParams = {
        name: form.name.trim(),
        symbol: form.symbol.trim(),
        metadataURI: metadataUri,
        profile: {
          logo: imageUri,
          description: form.description.trim(),
          socials: {
            telegram: "",
            twitter: form.twitter.trim(),
            discord: "",
            website: form.website.trim(),
            extra: ""
          }
        },
        configId: BigInt(launchConfig.id),
        supply: 0n,
        salt,
        feeRecipients: [],
        feeShares: [],
        firstBuyAmount,
        firstBuyMinOut: 0n,
        permit: {
          deadline: 0n,
          v: 0,
          r: zeroHash,
          s: zeroHash
        }
      };

      setPreflightStatus("Menjalankan simulasi kontrak...");
      const expectedConfig = {
        baseSupply: launchConfig.baseSupply,
        totalFeePips: launchConfig.totalFeePips,
        quoteAddress: launchConfig.quoteAddress as Address
      };
      const result = await runLaunchPreflight(
        walletAddress as Address,
        params,
        expectedConfig
      );
      setPreparedLaunch({
        params,
        factoryAddress: result.factoryAddress,
        expectedConfig
      });
      setTransactionHash("");
      setLaunchedToken("");

      setPredictedToken(String(result.predictedToken));
      setEstimatedGas(result.estimatedGas.toString());
      setEstimatedGasCost(formatEther(result.estimatedGasCost));
      setPreflightStatus("Simulasi berhasil. Tidak ada transaksi yang dikirim.");
    } catch (error) {
      console.error("[PREFLIGHT ERROR]", error);
      setPreflightStatus(error instanceof Error ? error.message : "Preflight gagal.");
      setPredictedToken("");
      setEstimatedGas("");
      setEstimatedGasCost("");
      setPreparedLaunch(null);
    } finally {
      setIsPreflightRunning(false);
    }
  };

  const handleLaunch = async () => {
    if (!preparedLaunch || !walletAddress) {
      setLaunchStatus("Jalankan Preflight dan hubungkan wallet terlebih dahulu.");
      return;
    }
    const provider = getWalletProvider();
    if (!provider) {
      setLaunchStatus("Wallet tidak ditemukan.");
      return;
    }
    try {
      setIsLaunching(true);
      setLaunchStatus("Memeriksa ulang Factory dan simulasi...");
      const result = await executeLaunch(
        provider,
        walletAddress as Address,
        preparedLaunch.params,
        preparedLaunch.factoryAddress,
        preparedLaunch.expectedConfig
      );
      setTransactionHash(result.transactionHash);
      setLaunchedToken(result.token);
      setLaunchStatus("Token berhasil diluncurkan dan event kontrak terverifikasi.");
    } catch (error) {
      console.error("[LAUNCH ERROR]", error);
      setLaunchStatus(error instanceof Error ? error.message : "Launch gagal.");
    } finally {
      setIsLaunching(false);
    }
  };

  const connectWallet = async () => {
    const provider = getWalletProvider();
    if (!provider) {
      setWalletStatus("Wallet not detected. Please install an EVM wallet.");
      return;
    }
    try {
      setWalletStatus("Connecting...");
      const elysium = defineChain({
        id: 99901,
        name: "Elysium",
        nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
        rpcUrls: { default: { http: ["https://rpc.montramarkets.xyz"] } }
      });
      const walletClient = createWalletClient({
        chain: elysium,
        transport: custom(provider as any)
      });
      const accounts = await walletClient.requestAddresses();
      const chainId = await walletClient.getChainId();
      setWalletAddress(accounts[0] ?? "");
      setWalletStatus(chainId === 99901 ? "Connected · Elysium" : "Wrong network · Chain ID " + chainId);
    } catch (error) {
      setWalletStatus(error instanceof Error ? error.message : "Wallet connection cancelled");
    }
  };

  const openLaunch = () => {
    setShowForm(true);
    window.setTimeout(() => {
      document.getElementById("create-token")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Montra Strategy home">
          <img src="https://i.imgur.com/4SS7yl4.png" alt="Montra Strategy" style={{ width: 36, height: 36, objectFit: "contain" }} />
          <span>MONTRA <b>STRATEGY</b></span>
        </a>
        <nav className={mobileMenu ? "nav-links open" : "nav-links"}>
          <a href="#how-it-works">How it works</a>
          <a href="#create-token" onClick={() => setShowForm(true)}>Create token</a>
          <a href="#about">About</a>
        </nav>
        <div className="nav-actions">
          <span className="network-pill"><i /> Elysium</span>
          <button className="wallet-button" onClick={connectWallet} title={walletStatus}>
            <Wallet size={16} /> {walletAddress ? walletAddress.slice(0, 6) + "..." + walletAddress.slice(-4) : "Connect wallet"}
          </button>
          <span style={{ fontSize: 11, color: walletStatus.startsWith("Connected") ? "#69c98a" : "#9aa79d", maxWidth: 180 }} title={walletStatus}>{walletStatus}</span>
          <button className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu">
            {mobileMenu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> INDEPENDENT LAUNCHPAD ON ELYSIUM</div>
            <h1>Build your token.<br /><span>Launch with purpose.</span></h1>
            <p className="hero-description">
              A simple way to create a token for the Montra ecosystem.
              Clear parameters, transparent steps, and control at every stage.
            </p>
            <div className="hero-actions">
              <button className="primary-button" onClick={openLaunch}>
                Start a launch <ArrowUpRight size={17} />
              </button>
              <a className="text-link" href="https://montramarkets.xyz/docs" target="_blank" rel="noreferrer">
                Explore Montra docs <ExternalLink size={14} />
              </a>
            </div>
            <div className="hero-note"><ShieldCheck size={15} /> Preview mode · No transactions are sent</div>
          </div>
          <div className="hero-visual">
            <div className="visual-orbit orbit-one" />
            <div className="visual-orbit orbit-two" />
            <div className="visual-core">
              <img className="core-logo" src="https://i.imgur.com/4SS7yl4.png" alt="Montra Strategy" />
              <span className="core-caption">STRATEGY / 001</span>
            </div>
            <div className="float-card card-top">
              <span className="mini-label">NETWORK</span>
              <strong>Elysium</strong>
              <span className="mini-status"><i /> Connected ecosystem</span>
            </div>
            <div className="float-card card-bottom">
              <span className="mini-label">LAUNCH FLOW</span>
              <strong>One clear process</strong>
              <span className="mini-status">Create · Review · Launch</span>
            </div>
          </div>
        </section>

        <section className="stats-strip" aria-label="Platform details">
          <div><span className="stat-label">NETWORK</span><strong>Elysium</strong></div>
          <div><span className="stat-label">CHAIN ID</span><strong>99901</strong></div>
          <div><span className="stat-label">GAS TOKEN</span><strong>HYPE</strong></div>
          <div><span className="stat-label">DEPLOYMENT</span><strong className="status-text">Disabled in Phase 1</strong></div>
        </section>

        <section className="section how-section" id="how-it-works">
          <div className="section-heading">
            <div><div className="eyebrow">A CLEARER WAY TO LAUNCH</div><h2>From idea to launch.</h2></div>
            <p>Designed to keep the process understandable before a wallet transaction is ever requested.</p>
          </div>
          <div className="steps-grid">
            <article className="step-card">
              <span className="step-number">01</span><div className="step-icon"><Sparkles size={20} /></div>
              <h3>Define your token</h3><p>Add the name, symbol, image and project details.</p>
            </article>
            <article className="step-card">
              <span className="step-number">02</span><div className="step-icon"><ShieldCheck size={20} /></div>
              <h3>Review the details</h3><p>Check the metadata and launch configuration before proceeding.</p>
            </article>
            <article className="step-card">
              <span className="step-number">03</span><div className="step-icon"><ArrowUpRight size={20} /></div>
              <h3>Launch through Montra</h3><p>Factory integration will be enabled only after testing and approval.</p>
            </article>
          </div>
        </section>

        <section className="create-section" id="create-token">
          <div className="create-intro">
            <div className="eyebrow">TOKEN STUDIO</div>
            <h2>Make it yours.</h2>
            <p>Start with the identity of your project. This phase creates a local preview only.</p>
            <div className="safe-callout"><ShieldCheck size={18} /><span><b>Safe preview mode</b><br />No wallet requests, signatures, or blockchain transactions are enabled.</span></div>
          </div>
          <div className="studio-card">
            <div className="studio-header">
              <div><span className="studio-kicker">NEW PROJECT</span><h3>Create token</h3></div>
              <span className="draft-badge">DRAFT</span>
            </div>
            {!showForm ? (
              <div className="empty-studio">
                <div className="empty-icon"><Sparkles size={22} /></div>
                <h3>Your next launch starts here.</h3>
                <p>Enter your token details and see a preview before any deployment functionality is considered.</p>
                <button className="primary-button" onClick={() => setShowForm(true)}>Create token <ArrowRight size={16} /></button>
              </div>
            ) : (
              <div className="studio-content">
                <LaunchConfigPanel onSelectionChange={handleLaunchConfigSelection} />
                <label>First Buy <span className="optional">Optional · {launchConfig?.quote ?? "HYPE"}</span><input type="number" min="0" step="any" value={firstBuyInput} onChange={(e) => { setFirstBuyInput(e.target.value); setPreparedLaunch(null); setApprovalStatus(""); setPreflightStatus(""); setPredictedToken(""); setEstimatedGas(""); setEstimatedGasCost(""); setTransactionHash(""); setLaunchedToken(""); setLaunchStatus(""); }} placeholder="0" /><span className="optional">Initial buy uses the selected quote asset. Minimum token output: 0.</span></label>
                <div className="field-row">
                  <label>Token name<input value={form.name} maxLength={32} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Montra Labs" /></label>
                  <label>Symbol<input value={form.symbol} maxLength={10} onChange={(e) => update("symbol", e.target.value.replace(/[^a-zA-Z0-9#/]/g, ""))} placeholder="e.g. MLAB" /></label>
                </div>
                <label>Project description<textarea value={form.description} maxLength={240} onChange={(e) => update("description", e.target.value)} placeholder="What is your project about?" rows={3} /></label>
                <label>Logo file <span className="optional">Optional · Phase 1 local selection only</span>
                  <input className="file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setLogoFile(file);
                    setLogoName(file?.name ?? "");
                    setLogoPreview(file ? URL.createObjectURL(file) : "");
                    setImageUri("");
                    setMetadataUri("");
                    setUploadStatus("");
                  }} />
                </label>
                {logoName && <span className="file-name"><Check size={13} /> {logoName}</span>}
                <div className="upload-actions">
                    <button className="secondary-button" type="button" onClick={handleMetadataUpload} disabled={isUploading}>
                      {isUploading ? "Uploading..." : "Upload logo & metadata"}
                    </button>
                  <p className="upload-status">Status: {uploadStatus || "Belum ada proses upload"}</p>
                  <p className="upload-status">Image URI: {imageUri ? "TERSEDIA" : "KOSONG"} · Metadata URI: {metadataUri ? "TERSEDIA" : "KOSONG"}</p>
                </div>
                <div className="field-row">
                  <label>Website <span className="optional">Optional</span><input value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://" /></label>
                  <label>X / Twitter <span className="optional">Optional</span><input value={form.twitter} onChange={(e) => update("twitter", e.target.value)} placeholder="@project" /></label>
                </div>
                <div className="form-actions">
                  <button className="secondary-button" onClick={() => { setForm(initialForm); setLogoName(""); setLogoPreview(""); setLogoFile(null); setImageUri(""); setMetadataUri(""); setUploadStatus(""); setShowReview(false); const fileInput=document.querySelector<HTMLInputElement>(".file-input"); if(fileInput) fileInput.value=""; }}>Clear form</button>
                  <button className="primary-button" disabled={!canPreview || !launchConfig} onClick={() => { setShowReview(true); window.setTimeout(() => document.getElementById("launch-review")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}>Review launch <ArrowRight size={16} /></button>
                </div>
              </div>
            )}
          </div>
        </section>


        {showReview && (
          <section className="review-section" id="launch-review">
            <div className="review-heading">
              <div>
                <div className="eyebrow">FINAL CHECK · PHASE 2</div>
                <h2>Launch review.</h2>
                <p>Verify your token identity and Factory configuration before proceeding.</p>
              </div>
              <span className="review-status"><i /> READY FOR REVIEW</span>
            </div>

            <div className="review-grid">
              <article className="review-card">
                <div className="review-card-heading">
                  <span className="review-icon"><Sparkles size={17} /></span>
                  <div><small>01 · TOKEN IDENTITY</small><h3>Project overview</h3></div>
                </div>
                <div className="review-token">
                  <div className="review-avatar">
                    {logoPreview ? <img src={logoPreview} alt="Token logo" /> : (form.symbol || "?").slice(0, 1)}
                  </div>
                  <div><strong>{form.name || "Unnamed token"}</strong><span>${form.symbol || "SYMBOL"}</span></div>
                </div>
                <p className="review-description">{form.description || "No project description provided."}</p>
                <div className="review-divider" />
                <div className="review-line"><span>Website</span><b>{form.website || "Not provided"}</b></div>
                <div className="review-line"><span>X / Twitter</span><b>{form.twitter || "Not provided"}</b></div>
                <div className="review-line"><span>Logo</span><b>{logoName || "No logo uploaded"}</b></div>
                <div className="review-line"><span>Image URI</span><b>{imageUri ? "Uploaded" : "Not uploaded"}</b></div>
                <div className="review-line"><span>Metadata URI</span><b>{metadataUri ? "Ready" : "Not uploaded"}</b></div>
              </article>

              <article className="review-card">
                <div className="review-card-heading">
                  <span className="review-icon"><ShieldCheck size={17} /></span>
                  <div><small>02 · FACTORY PARAMETERS</small><h3>Launch configuration</h3></div>
                </div>
                <div className="review-line"><span>Configuration tier</span><b>Tier {launchConfig ? launchConfig.id + 1 : "—"}</b></div>
                <div className="review-line"><span>Base supply</span><b>{launchConfig?.supply ?? "—"}</b></div>
                <div className="review-line"><span>Total fee</span><b>{launchConfig?.fee ?? "—"}</b></div>
                <div className="review-line"><span>Quote asset</span><b>{launchConfig?.quote ?? "—"}</b></div>
                <div className="review-line"><span>First Buy</span><b>{firstBuyInput.trim() || "0"} {launchConfig?.quote ?? "HYPE"}</b></div>
                <div className="review-divider" />
                <div className="review-line"><span>Network</span><b>Elysium</b></div>
                <div className="review-line"><span>Chain ID</span><b>99901</b></div>
                <div className="review-line"><span>Factory</span><b className="review-address">0x38D3...fcD15</b></div>
              </article>
            </div>

            <div className="review-safety">
              <ShieldCheck size={20} />
              <div><strong>Launch review · Transaction requires wallet approval</strong><p>No transaction is sent until you complete Preflight and explicitly approve the Launch transaction in your wallet.</p></div>
            </div>

            <div className="review-safety">
              <div>
                <strong>Preflight requirements</strong>
                <p>Wallet: {walletAddress ? "SIAP" : "BELUM TERHUBUNG"} · Tier: {launchConfig ? "SIAP" : "BELUM DIPILIH"}</p>
                <p>Image URI: {imageUri ? "SIAP" : "BELUM DIUPLOAD"} · Metadata URI: {metadataUri ? "SIAP" : "BELUM DIUPLOAD"}</p>
              </div>
            </div>

            <div className="review-safety">
              <ShieldCheck size={20} />
              <div>
                <strong>Token approval</strong>
                <p>{approvalStatus || "Untuk First Buy KNTQ, lakukan approval terlebih dahulu. HYPE tidak memerlukan approval ERC20."}</p>
                <strong>Preflight simulation</strong>
                <p>{preflightStatus || "Jalankan pemeriksaan read-only sebelum mempertimbangkan deployment."}</p>
                {predictedToken && <p className="review-address">Predicted token: {predictedToken}</p>}
                {estimatedGas && <p>Estimated gas: {Number(estimatedGas).toLocaleString("en-US")}</p>}
                {estimatedGasCost && <p>Estimated gas cost: {estimatedGasCost} HYPE</p>}
                {launchStatus && <p>{launchStatus}</p>}
                {transactionHash && <p className="review-address">Transaction: {transactionHash}</p>}
                {launchedToken && <p className="review-address">Launched token: {launchedToken}</p>}
              </div>
            </div>

            <div className="review-actions">
              {launchConfig && launchConfig.quoteAddress.toLowerCase() !== "0x0000000000000000000000000000000000000000" && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={handleApproveQuote}
                  disabled={isApproving || !walletAddress || !launchConfig || Number(firstBuyInput) <= 0}
                >
                  {isApproving ? "Approving..." : "Approve " + launchConfig.quote}
                </button>
              )}
              <button
                className="secondary-button"
                type="button"
                onClick={handlePreflight}
                disabled={isPreflightRunning || !walletAddress || !launchConfig || !metadataUri || !imageUri}
              >
                {isPreflightRunning ? "Simulating..." : "Run Preflight Simulation"}
              </button>
              <button className="secondary-button" onClick={() => { setShowReview(false); document.getElementById("create-token")?.scrollIntoView({ behavior: "smooth" }); }}> <ArrowRight size={15} style={{ transform: "rotate(180deg)" }} /> Back to configuration</button>
              <button className="primary-button" type="button" onClick={handleLaunch} disabled={!preparedLaunch || isLaunching || Boolean(transactionHash)}>{isLaunching ? "Launching..." : transactionHash ? "Launch successful" : "Launch token"} <ArrowUpRight size={15} /></button>
            </div>
          </section>
        )}
        <section className="preview-section" id="token-preview">
          <div className="section-heading compact-heading">
            <div><div className="eyebrow">LOCAL PREVIEW</div><h2>Project overview.</h2></div>
            <span className="preview-label">NOT DEPLOYED</span>
          </div>
          <div className="preview-card">
            <div className="token-avatar">{logoPreview ? <img src={logoPreview} alt="Token logo preview" /> : form.symbol ? form.symbol.slice(0, 1) : "?"}</div>
            <div className="preview-main">
              <div className="preview-title">{form.name || "Your token name"} <span>{form.symbol ? `$${form.symbol}` : "$SYMBOL"}</span></div>
              <p>{form.description || "Your project description will appear here once you add it in Token Studio."}</p>
              <div className="preview-meta"><span>Network · Elysium</span><span>Supply · To be read from Montra config</span></div>
            </div>
            <div className="preview-state"><span className="preview-dot" /> Draft</div>
          </div>
          <div className="disabled-deploy">
            <div><b>Deployment is not available yet</b><span>Factory configuration, ABI validation and transaction simulation are Phase 2 work.</span></div>
            <button disabled className="disabled-button">Deploy token <ArrowUpRight size={16} /></button>
          </div>
        </section>

        <section className="about-section" id="about">
          <div className="about-mark"><img className="about-logo" src="https://i.imgur.com/4SS7yl4.png" alt="Montra Strategy" /></div>
          <div><div className="eyebrow">BUILT FOR ELYSIUM</div><h2>Independent interface.<br />Montra-native launch flow.</h2><p>Montra Strategy is an independent builder project. It is not an official Montra product or endorsement.</p></div>
          <a href="https://montramarkets.xyz/docs/build" target="_blank" rel="noreferrer" className="round-link" aria-label="Read Montra builder docs"><ArrowUpRight size={20} /></a>
        </section>
      </main>

      <footer className="footer">
        <a className="brand" href="#"><img src="https://i.imgur.com/4SS7yl4.png" alt="Montra Strategy" style={{ width: 36, height: 36, objectFit: "contain" }} /><span>MONTRA <b>STRATEGY</b></span></a>
        <span>Independent builder project · Phase 1 preview</span>
        <a href="https://montramarkets.xyz/docs" target="_blank" rel="noreferrer">Montra documentation <ExternalLink size={13} /></a>
      </footer>
    </div>
  );
}

export default App;