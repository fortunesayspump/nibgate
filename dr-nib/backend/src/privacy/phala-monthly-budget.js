// Operational compute accounting only: no content, identities, or credentials.
// A conservative extra minute per start covers provider minute rounding.
const month=t=>new Date(t).toISOString().slice(0,7);
const boundary=t=>{const d=new Date(t);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)};
export function reconcileMonthlyBudget(state,t,policy){
  if(!policy)return;
  if(!Number.isSafeInteger(t)||t<0)throw Error('PHALA_BUDGET_CLOCK_INVALID');
  if(!state.monthlyCompute){
    // Retain cumulative usage and all manual grant audit fields. Charge the
    // existing runtime conservatively to this first month; never erase it.
    const credited=(state.runtimeAllowanceGrants??[]).reduce((sum,g)=>sum+(Number.isSafeInteger(g.additionalRuntimeMs)&&g.additionalRuntimeMs>0?g.additionalRuntimeMs:0),0);
    state.monthlyCompute={version:1,policy:{...policy},accountedAt:t,
      months:{[month(t)]:credited+state.usedMs+(state.startedAt===null?0:Math.max(0,t-state.startedAt))},
      migration:{at:t,priorUsedMs:state.usedMs,priorStartedAt:state.startedAt}};
  }
  const b=state.monthlyCompute;
  if(b.version!==1||!b.policy||Object.keys(b.policy).sort().join(',')!==Object.keys(policy).sort().join(',')||Object.entries(policy).some(([k,v])=>b.policy[k]!==v))throw Error('PHALA_MONTHLY_POLICY_MISMATCH');
  if(!Number.isSafeInteger(b.accountedAt)||!b.months||Object.entries(b.months).some(([k,v])=>!/^\d{4}-\d{2}$/.test(k)||!Number.isSafeInteger(v)||v<0))throw Error('PHALA_MONTHLY_STATE_INVALID');
  if(t<b.accountedAt)throw Error('PHALA_BUDGET_CLOCK_INVALID');
  if(state.startedAt!==null){
    let start=b.accountedAt;
    while(start<t){const end=Math.min(t,boundary(start));const key=month(start);
      b.months[key]=(b.months[key]??0)+(end-start);start=end;}
  }
  b.accountedAt=t;
  b.months[month(t)]??=0;
}
export function monthlyRemaining(state,t){
  const b=state.monthlyCompute;
  return Math.max(0,Math.floor(b.policy.capMicroUsd*3600000/b.policy.hourlyMicroUsd)-b.policy.stopReserveMs-(b.months[month(t)]??0));
}
export function reserveMonthlyStart(state,t){
  const b=state.monthlyCompute;if(b)b.months[month(t)]=(b.months[month(t)]??0)+60000;
}
export function validateMonthlyPolicy(p){
  if(p===null||p===undefined)return null;
  if(Object.keys(p).sort().join(',')!=='capMicroUsd,hourlyMicroUsd,stopReserveMs'||
    !Object.values(p).every(Number.isSafeInteger)||p.capMicroUsd<1||p.capMicroUsd>2000000||
    p.hourlyMicroUsd<1||p.hourlyMicroUsd>10000000||p.stopReserveMs<240000||p.stopReserveMs>600000)
    throw Error('PHALA_MONTHLY_POLICY_INVALID');
  return Object.freeze({...p});
}
