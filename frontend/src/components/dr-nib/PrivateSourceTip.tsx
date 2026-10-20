'use client';
import {useState} from 'react';
import {NibgateTipCard} from '@nibgate/wallet/react';
import {apiBaseUrl} from '@/lib/api';
import {privatePublicTipResource} from '@/lib/dr-nib-private-public-tip';
import {updatePrivateManifest} from '@/lib/dr-nib-private-records';

/** Public payment rails stay in the shared wallet/Hub flow. The worker never
 * receives a spending key, and opening a card does not submit a transaction. */
export function PrivateSourceTip({url,runId}:{url:string;runId:string}){
    const resource=privatePublicTipResource(url);
    const [target,setTarget]=useState<{recipient?:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
    if(!resource)return null;
    async function open(){
        if(!resource||busy)return;
        setBusy(true);setError('');
        try{
            const response=await fetch(`${apiBaseUrl()}/hub/resolve?url=${encodeURIComponent(resource.url)}`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
            if(!response.ok)throw Error('resolve');
            const text=await response.text();if(text.length>65536)throw Error('resolve');
            const value=JSON.parse(text);
            setTarget(value.success&&/^0x[0-9a-f]{40}$/i.test(value.wallet??'')?{recipient:value.wallet}:{});
        }catch{setError('The Hub could not check this source. No payment was started.')}
        finally{setBusy(false)}
    }
    return <div className="mt-2 text-xs">
        {target?<>
            <p className="opacity-60">This tip shares the public source URL and payment details with the Hub and blockchain. Your report and uploads stay private.</p>
            <NibgateTipCard resource={resource} recipient={target.recipient} apiBase={apiBaseUrl()} amounts={[0.1,0.25,1]} onPaid={async(receipt:{txHash?:string;amount?:number|string;held?:boolean})=>{
                if(!/^0x[0-9a-f]{64}$/i.test(receipt.txHash??''))return;
                try{await updatePrivateManifest(runId,state=>({...state,metadata:{...state.metadata,externalTips:[...(state.metadata?.externalTips??[]).filter((t:{txHash:string})=>t.txHash!==receipt.txHash),{contentUrl:resource.url,txHash:receipt.txHash,amount:Number(receipt.amount)||null,held:receipt.held===true}].slice(-100)}}))}
                catch{setError('The Hub confirmed the tip. Its private project note could not sync; do not send the payment again.')}
            }}/>
            <button type="button" onClick={()=>setTarget(null)} className="underline">Close tipping</button>
        </>:<button type="button" disabled={busy} onClick={()=>void open()} className="underline disabled:opacity-40">{busy?'Checking creator…':'Tip this creator'}</button>}
        {error?<p role="status" className="mt-1 text-red-700">{error}</p>:null}
    </div>;
}
