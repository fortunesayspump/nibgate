// Test-only synthetic auth/research boundary. Never talks to a real account or service.
import React, { useState } from 'react';
export const state = {
  authenticated: false, expired: false, opens: 0, creates: [] as string[], checks: 0,
  connected: false, failCreate: false, delayCreate: false, resolveCreate: null as null | (() => void),
  resolveAuth: null as null | ((ok: boolean) => void), render: () => {},
};
(window as any).__signinTest = state;
export const privateBuildEnabled = () => true;
export const privateFundingEnabled = () => false;
export const getPrivateManifest = async () => ({ value: {} });
export async function privateTenantId() {
  state.checks++;
  if (!state.authenticated || state.expired) throw Object.assign(new Error('Sign in to Nibgate to open your private projects.'), { status: 401 });
  return 'test-tenant';
}
export const drNibApi = {
  health: async () => ({ research: { acceptingRuns: true } }),
  createProject: async (topic: string) => {
    state.creates.push(topic);
    if (state.delayCreate) await new Promise<void>(resolve => {state.resolveCreate = resolve;});
    if (state.failCreate) throw Object.assign(new Error('Session expired'), {status: 401});
    return {id:'test-only-project',status:'intake',questions:[{seq:0,key:'scope',type:'free',prompt:'Test-only scope question',options:[],allowOther:false}]};
  },
  getRun: async () => {throw Object.assign(new Error('test missing project'), {status:404});},
};
export function useNibgateConnect() {
  const [busy,setBusy] = useState(false);
  const requestSignIn = async () => {
    state.opens++; setBusy(true);
    const result = await new Promise<boolean>(resolve => { state.resolveAuth = resolve; state.render(); });
    setBusy(false); return result;
  };
  return { requestSignIn, connect:requestSignIn, signIn:requestSignIn, address:state.connected?'0x0000000000000000000000000000000000000001':undefined, busy, error:null, notifySessionExpired:()=>{} };
}
export function TestDialog() {
  const [,render] = useState(0); state.render=()=>render(x=>x+1);
  if (!state.resolveAuth) return null;
  const finish=(ok:boolean)=>{ const resolve=state.resolveAuth;state.resolveAuth=null;state.authenticated=ok;resolve?.(ok);render(x=>x+1);};
  return <div role="dialog" aria-label="Test-only existing sign-in dialog"><button onClick={()=>finish(true)}>Continue with Google</button><button onClick={()=>finish(false)}>Cancel sign-in</button></div>;
}
export const useRouter = () => ({push:()=>{},replace:()=>{}});
export default function Link(props:any) {return <a {...props}/>;}
export const SourceManager = () => null;
export const ConfidentialSourceManager = () => null;
export const EscrowDeposit = () => null;
export const ArrowLeft=()=>null, ArrowRight=()=>null, Loader2=()=>null, Send=()=>null, Square=()=>null;

export const privateAction = async () => { throw new Error('Unexpected private action in test'); };

// Guest feature disabled for the existing signed-in regression suite.
export const guestPlanningCapabilities=async()=>({enabled:false});
export const isGuestProject=()=>false;
export const beginGuestPlanning=async()=>{throw Error('Guest feature disabled in signin tests');};
export const saveGuestComposerSnapshot=async()=>{};
export const restoreGuestComposerSnapshot=async()=>null;
export const adoptGuestProject=async()=>{throw Error('Guest feature disabled in signin tests');};

export const classifyGuestPlanningError=()=>({kind:'retry',message:'Synthetic unavailable project',retryRestore:true});
