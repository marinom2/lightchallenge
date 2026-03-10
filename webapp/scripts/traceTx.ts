// scripts/traceTx.ts
import {
    createPublicClient,
    http,
    isHex,
    parseAbiItem,
    decodeEventLog,
    type Log,
  } from "viem";
  
  // ====== CONFIG ======
  const RPC_URL =
    process.env.RPC_URL || "https://light-testnet-rpc.lightchain.ai";
  
  // (optional) put your known addresses here just to label output nicely:
  const LABELS: Record<string, string> = {
    // "0xYourChallengePay": "ChallengePay",
    // "0xYourTreasury": "Treasury",
  };
  
  const client = createPublicClient({ transport: http(RPC_URL) });
  
  /** Minimal Treasury + ChallengePay event ABIs we care about */
  const EVENTS = [
    // Treasury
    parseAbiItem("event Received(address indexed from, uint256 amount)"),
    parseAbiItem("event ReceivedERC20(address indexed token, address indexed from, uint256 amount)"),
    parseAbiItem("event ReceivedERC20For(address indexed token, address indexed from, address indexed creditedTo, uint256 amount)"),
    parseAbiItem("event GrantETH(address indexed to, uint256 amount, address indexed operator)"),
    parseAbiItem("event GrantERC20(address indexed token, address indexed to, uint256 amount, address indexed operator)"),
    parseAbiItem("event ClaimedETH(address indexed to, uint256 amount)"),
    parseAbiItem("event ClaimedERC20(address indexed token, address indexed to, uint256 amount)"),
  
    // ChallengePay (useful context)
    parseAbiItem("event ChallengeCreated(uint256 indexed id, address indexed challenger, uint8 kind, uint8 currency, address token, uint256 startTs, bytes32 externalId, bool fastTracked)"),
    parseAbiItem("event Joined(uint256 indexed id, address indexed user, uint256 amount)"),
    parseAbiItem("event FeesBooked(uint256 indexed id, uint256 protocol, uint256 creator, uint256 validators, uint256 charity, uint256 cashback)"),
    parseAbiItem("event SnapshotSet(uint256 indexed id, bool success, uint8 rightSide, uint32 eligibleValidators)"),
    parseAbiItem("event Finalized(uint256 indexed id, uint8 status, uint8 outcome)"),
  ] as const;
  
  function label(addr?: `0x${string}` | string) {
    if (!addr) return "";
    const a = addr.toLowerCase();
    for (const [k, v] of Object.entries(LABELS)) {
      if (k.toLowerCase() === a) return `${addr} (${v})`;
    }
    return addr;
  }
  
  function parseLog(l: Log) {
    for (const ev of EVENTS) {
      try {
        const d = decodeEventLog({ abi: [ev], data: l.data, topics: l.topics });
        return { name: d.eventName, args: d.args as any };
      } catch {}
    }
    return null;
  }
  
  function fmtWei(v?: bigint) {
    if (!v) return "0";
    // Simple wei print (no decimals) to avoid mismatched ERC20 decimals here.
    return v.toString();
  }
  
  async function main() {
    const hash = (process.argv[2] || "").trim();
    if (!isHex(hash) || hash.length !== 66) {
      console.error("Usage: ts-node scripts/traceTx.ts <txHash>");
      process.exit(1);
    }
  
    const [tx, rcpt] = await Promise.all([
      client.getTransaction({ hash: hash as `0x${string}` }),
      client.getTransactionReceipt({ hash: hash as `0x${string}` }),
    ]);
  
    console.log("— TX —");
    console.log("  hash:     ", tx.hash);
    console.log("  from:     ", label(tx.from));
    console.log("  to:       ", label(tx.to || "0x"));
    console.log("  value(wei)", fmtWei(tx.value));
    console.log("  status:   ", rcpt.status);
  
    // Decode all logs we know how to decode
    const decoded = rcpt.logs
      .map((l) => ({ ...l, _dec: parseLog(l) }))
      .filter((l) => l._dec !== null) as Array<Log & { _dec: { name: string; args: any } }>;
  
    // Group by event types we care about
    const receivedETH = decoded.filter((l) => l._dec.name === "Received");
    const receivedERC20 = decoded.filter((l) => l._dec.name === "ReceivedERC20");
    const receivedERC20For = decoded.filter((l) => l._dec.name === "ReceivedERC20For");
    const grantsETH = decoded.filter((l) => l._dec.name === "GrantETH");
    const grantsERC20 = decoded.filter((l) => l._dec.name === "GrantERC20");
    const joined = decoded.filter((l) => l._dec.name === "Joined");
    const created = decoded.filter((l) => l._dec.name === "ChallengeCreated");
    const fees = decoded.filter((l) => l._dec.name === "FeesBooked");
    const snaps = decoded.filter((l) => l._dec.name === "SnapshotSet");
    const finalized = decoded.filter((l) => l._dec.name === "Finalized");
  
    console.log("\n— MONEY MOVEMENT (Treasury) —");
  
    if (receivedETH.length) {
      console.log("  ETH received by Treasury:");
      for (const l of receivedETH) {
        const { from, amount } = l._dec.args;
        console.log(
          `   • log@${l.logIndex}  Treasury=${label(l.address)}  from=${label(from)}  amount(wei)=${fmtWei(amount)}`
        );
      }
    }
  
    if (receivedERC20.length) {
      console.log("  ERC20 received by Treasury:");
      for (const l of receivedERC20) {
        const { token, from, amount } = l._dec.args;
        console.log(
          `   • log@${l.logIndex}  Treasury=${label(l.address)}  token=${token}  from=${label(from)}  amount=${amount}`
        );
      }
    }
  
    if (receivedERC20For.length) {
      console.log("  ERC20 received+credited by Treasury:");
      for (const l of receivedERC20For) {
        const { token, from, creditedTo, amount } = l._dec.args;
        console.log(
          `   • log@${l.logIndex}  Treasury=${label(l.address)}  token=${token}  from=${label(from)}  creditedTo=${label(creditedTo)}  amount=${amount}`
        );
      }
    }
  
    if (!receivedETH.length && !receivedERC20.length && !receivedERC20For.length) {
      console.log("  (no Treasury deposit events seen in this tx)");
    }
  
    console.log("\n— ALLOWANCES (granted by Treasury in this tx) —");
    if (grantsETH.length) {
      for (const l of grantsETH) {
        const { to, amount, operator } = l._dec.args;
        console.log(
          `   • GrantETH log@${l.logIndex}  Treasury=${label(l.address)}  to=${label(to)}  amount(wei)=${fmtWei(amount)}  operator=${label(operator)}`
        );
      }
    }
    if (grantsERC20.length) {
      for (const l of grantsERC20) {
        const { token, to, amount, operator } = l._dec.args;
        console.log(
          `   • GrantERC20 log@${l.logIndex}  Treasury=${label(l.address)}  token=${token}  to=${label(to)}  amount=${amount}  operator=${label(operator)}`
        );
      }
    }
    if (!grantsETH.length && !grantsERC20.length) {
      console.log("  (no Treasury grant events in this tx)");
    }
  
    console.log("\n— CHALLENGEPAY CONTEXT —");
    for (const l of created) {
      const { id, challenger, currency, token, startTs, fastTracked } = l._dec.args;
      console.log(
        `   • ChallengeCreated id=${id} challenger=${label(challenger)} currency=${currency} token=${token} startTs=${startTs} fastTracked=${fastTracked} (log@${l.logIndex})`
      );
    }
    for (const l of joined) {
      const { id, user, amount } = l._dec.args;
      console.log(
        `   • Joined id=${id} user=${label(user)} amount(wei)=${fmtWei(amount)} (log@${l.logIndex})`
      );
    }
    for (const l of fees) {
      const { id, protocol, creator, validators, charity, cashback } = l._dec.args;
      console.log(
        `   • FeesBooked id=${id} protocol=${protocol} creator=${creator} validators=${validators} charity=${charity} cashback=${cashback} (log@${l.logIndex})`
      );
    }
    for (const l of snaps) {
      const { id, success, rightSide, eligibleValidators } = l._dec.args;
      console.log(
        `   • SnapshotSet id=${id} success=${success} rightSide=${rightSide} eligibleValidators=${eligibleValidators} (log@${l.logIndex})`
      );
    }
    for (const l of finalized) {
      const { id, status, outcome } = l._dec.args;
      console.log(
        `   • Finalized id=${id} status=${status} outcome=${outcome} (log@${l.logIndex})`
      );
    }
  
    console.log("\n— SUMMARY —");
    console.log(`  TX value sent (wei): ${fmtWei(tx.value)} → to ${label(tx.to || "0x")}`);
    console.log("  Look above for Treasury Received* events to see deposits, and Grant* to see payouts credited.");
  }
  
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });