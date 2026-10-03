// A browser wallet for the end-to-end harness (tests/site/practice.mjs). Injected before every
// page load (puppeteer `evaluateOnNewDocument`), it installs an EIP-1193 provider that announces
// itself through EIP-6963 as "Fake Wallet" (rdns xyz.recused.fake) and also sits at
// window.ethereum. Its one account, the visitor, comes from window.__FAKE_KEYS
// ({ visitor: "0x…" }, a throwaway private key), which the harness sets first.
//
// What it signs, and how, mirrors what genlayer-js 1.1.8 does for a local account: a legacy
// transaction to the consensus main contract with the nonce, gas, gasPrice and chainId the SDK
// hands an injected provider in hex, signed with viem, then eth_sendRawTransaction to the Studio
// RPC. On Studio the SDK uses the hash the provider returns as the GenLayer transaction id, so
// this provider returns exactly what eth_sendRawTransaction answered.
//
// Addresses are reported in lowercase, which is what MetaMask hands a site. Every method that is
// not the wallet's own (accounts, chain, signing) is passed through to the Studio RPC unchanged.
//
// Test hooks: window.__fakeWallet = { use(name), setChain(hex), address(), calls, log }.
(function installFakeWallet() {
  const RPC_URL = "https://studio.genlayer.com/api";
  const STUDIO_HEX = "0xf22f";
  const RDNS = "xyz.recused.fake";
  const ICON =
    "data:image/svg+xml;base64," +
    btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#19C6A6"/><text x="16" y="21" font-size="14" text-anchor="middle" fill="#0B0E11" font-family="sans-serif">FW</text></svg>',
    );

  const keys = window.__FAKE_KEYS || {};
  // A real extension keeps the site's permission, the chosen account and the chain across page
  // loads; this one keeps them in localStorage under one key, per origin.
  const PERSIST = "fake-wallet.state";
  let persisted = {};
  try {
    persisted = JSON.parse(localStorage.getItem(PERSIST) || "{}") || {};
  } catch {}
  const state = {
    current: persisted.current || "visitor",
    chainHex: persisted.chainHex || STUDIO_HEX,
    connected: !!persisted.connected,
    accounts: {}, // name -> viem account, filled once viem loads
    chains: { [STUDIO_HEX]: { chainId: STUDIO_HEX, chainName: "GenLayer Studio" } },
  };
  const persist = () => {
    try {
      localStorage.setItem(PERSIST, JSON.stringify({ current: state.current, chainHex: state.chainHex, connected: state.connected }));
    } catch {}
  };
  const log = [];
  const calls = {};
  const listeners = {};
  let rpcId = 1;

  const note = (method, extra) => {
    calls[method] = (calls[method] || 0) + 1;
    log.push({ t: Date.now(), method, ...(extra || {}) });
    if (log.length > 500) log.shift();
  };

  // viem is loaded once, lazily; the provider object exists synchronously so the site's
  // EIP-6963 discovery finds it on the first request.
  let viemPromise = null;
  const viem = () => {
    if (!viemPromise) {
      viemPromise = import("https://esm.sh/viem@2/accounts").then((mod) => {
        for (const name of Object.keys(keys)) state.accounts[name] = mod.privateKeyToAccount(keys[name]);
        return mod;
      });
    }
    return viemPromise;
  };
  const account = async () => {
    await viem();
    const a = state.accounts[state.current];
    if (!a) throw rpcError(4100, `no key for account "${state.current}"`);
    return a;
  };
  /** The spelling a real extension hands the site. */
  const reported = (a) => a.address.toLowerCase();

  function rpcError(code, message, data) {
    const e = new Error(message);
    e.code = code;
    if (data !== undefined) e.data = data;
    return e;
  }

  async function studio(method, params) {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params: params ?? [] }),
    });
    if (!res.ok) throw rpcError(-32603, `Studio answered HTTP ${res.status} to ${method}`);
    const body = await res.json();
    if (body.error) throw rpcError(body.error.code ?? -32603, body.error.message || `${method} failed`, body.error.data);
    return body.result;
  }

  const emit = (event, payload) => {
    for (const fn of listeners[event] || []) {
      try {
        fn(payload);
      } catch (e) {
        console.error("fake wallet listener failed", e);
      }
    }
  };

  const toBig = (v, dflt) => (v === undefined || v === null || v === "" ? dflt : BigInt(v));
  const toNum = (v, dflt) => (v === undefined || v === null || v === "" ? dflt : Number(BigInt(v)));

  async function sendTransaction(tx) {
    if (!tx || typeof tx !== "object") throw rpcError(-32602, "eth_sendTransaction needs one transaction object");
    const acct = await account();
    if (tx.from && String(tx.from).toLowerCase() !== acct.address.toLowerCase()) {
      throw rpcError(4100, `the wallet's account is ${acct.address}, not ${tx.from}`);
    }
    // A real wallet signs on the chain it is on; a request for another chain is refused.
    if (tx.chainId && BigInt(tx.chainId) !== BigInt(state.chainHex)) {
      throw rpcError(4902, `the wallet is on chain ${parseInt(state.chainHex, 16)}, the request is for ${Number(BigInt(tx.chainId))}`);
    }
    const chainId = parseInt(state.chainHex, 16);
    const nonce = tx.nonce !== undefined && tx.nonce !== null ? toNum(tx.nonce, 0) : Number(BigInt(await studio("eth_getTransactionCount", [acct.address, "pending"])));
    const gas = toBig(tx.gas, 200000n);
    const gasPrice = tx.gasPrice !== undefined && tx.gasPrice !== null ? toBig(tx.gasPrice, 0n) : toBig(await studio("eth_gasPrice", []), 0n);
    const value = toBig(tx.value, 0n);
    const request = { to: tx.to, data: tx.data || "0x", type: "legacy", nonce, value, gas, gasPrice, chainId };
    const serialized = await acct.signTransaction(request);
    const hash = await studio("eth_sendRawTransaction", [serialized]);
    log.push({ t: Date.now(), method: "signed", to: tx.to, nonce, gas: gas.toString(), gasPrice: gasPrice.toString(), value: value.toString(), chainId, hash });
    return hash;
  }

  const provider = {
    isFakeWallet: true,
    isMetaMask: false,
    on(event, fn) {
      (listeners[event] ||= []).push(fn);
      return provider;
    },
    removeListener(event, fn) {
      listeners[event] = (listeners[event] || []).filter((f) => f !== fn);
      return provider;
    },
    async request(args) {
      const method = args && args.method;
      const params = (args && args.params) || [];
      note(method);
      switch (method) {
        case "eth_requestAccounts": {
          const acct = await account();
          state.connected = true;
          persist();
          return [reported(acct)];
        }
        case "eth_accounts": {
          if (!state.connected) return [];
          const acct = await account();
          return [reported(acct)];
        }
        case "eth_chainId":
          return state.chainHex;
        case "net_version":
          return String(parseInt(state.chainHex, 16));
        case "wallet_switchEthereumChain": {
          const wanted = params[0] && params[0].chainId;
          if (!wanted) throw rpcError(-32602, "wallet_switchEthereumChain needs { chainId }");
          if (!state.chains[wanted.toLowerCase()]) throw rpcError(4902, `Unrecognized chain ID "${wanted}". Try adding the chain using wallet_addEthereumChain first.`);
          if (state.chainHex !== wanted.toLowerCase()) {
            state.chainHex = wanted.toLowerCase();
            persist();
            emit("chainChanged", state.chainHex);
          }
          return null;
        }
        case "wallet_addEthereumChain": {
          const p = params[0] || {};
          if (!p.chainId) throw rpcError(-32602, "wallet_addEthereumChain needs { chainId }");
          state.chains[String(p.chainId).toLowerCase()] = p;
          if (state.chainHex !== String(p.chainId).toLowerCase()) {
            state.chainHex = String(p.chainId).toLowerCase();
            persist();
            emit("chainChanged", state.chainHex);
          }
          return null;
        }
        case "wallet_revokePermissions":
          state.connected = false;
          persist();
          emit("accountsChanged", []);
          return null;
        case "wallet_requestPermissions":
        case "wallet_getPermissions":
          return [{ parentCapability: "eth_accounts" }];
        case "personal_sign":
        case "eth_sign":
        case "eth_signTypedData_v4":
        case "eth_signTransaction":
          throw rpcError(4200, `${method} is not supported by Fake Wallet`);
        case "eth_sendTransaction":
          return sendTransaction(params[0]);
        default:
          return studio(method, params);
      }
    },
    // legacy shims some libraries still call
    enable() {
      return provider.request({ method: "eth_requestAccounts" });
    },
    isConnected() {
      return true;
    },
  };

  const info = Object.freeze({ uuid: "6b1f1a44-4a6e-4f6b-9b1a-fakewallet0002", name: "Fake Wallet", icon: ICON, rdns: RDNS });
  const announce = () => {
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  };
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
  try {
    Object.defineProperty(window, "ethereum", { value: provider, configurable: true, writable: true });
  } catch {
    window.ethereum = provider;
  }

  window.__fakeWallet = {
    async use(name) {
      if (!keys[name]) throw new Error(`no key named "${name}"`);
      state.current = name;
      persist();
      const acct = await account();
      if (state.connected) emit("accountsChanged", [reported(acct)]);
      return reported(acct);
    },
    setChain(hex) {
      const h = String(hex).toLowerCase();
      state.chains[h] ||= { chainId: h };
      state.chainHex = h;
      persist();
      emit("chainChanged", h);
      return h;
    },
    /** The address as the site is given it (lowercase). */
    async address(name) {
      await viem();
      const a = state.accounts[name || state.current];
      return a ? reported(a) : "";
    },
    current: () => state.current,
    chain: () => state.chainHex,
    connected: () => state.connected,
    ready: () => viem().then(() => true),
    calls,
    log,
  };
})();
