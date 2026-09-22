import { db } from '@nibgate/internal/db.js';
import { createPublicClient, http, fallback } from 'viem';
// Never hardcode RPC tokens (rotated regularly) — pass ARC_RPC_URL in env.
const rpc = process.env.ARC_RPC_URL || process.env.NIBGATE_REPUTATION_RPC_URL || 'https://rpc.testnet.arc.io';
const client=createPublicClient({chain:{id:5042002,name:'Arc Testnet',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[rpc]}}},transport:http(rpc)});
const direct = await db.unlockReceipt.findMany({
  where: { status: 'verified', paymentProvider: 'direct-transfer', content: { website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' } } },
  select: { id: true, txHash: true, createdAt: true, amount: true },
  orderBy: { createdAt: 'asc' },
});
let exist=0,missing=0,missingList=[];
for (const r of direct) {
  const h=r.txHash;
  let ok=false;
  try { const t=await client.getTransaction({hash:h}); ok=!!t; } catch { ok=false; }
  if(ok) exist++; else { missing++; missingList.push(r.id.slice(0,8)+' '+h.slice(0,12)+' amt='+r.amount+' @'+r.createdAt.toISOString().slice(0,16)); }
}
console.log('direct total:', direct.length, '| EXISTS on-chain:', exist, '| MISSING:', missing);
console.log('--- missing list ---');
missingList.forEach(x=>console.log(x));
process.exit(0);
