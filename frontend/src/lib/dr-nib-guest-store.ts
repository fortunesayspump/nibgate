/** Device-local guest storage. Only opaque IDs, revisions and non-extractable
 * CryptoKeys are stored outside authenticated ciphertext. No localStorage. */
export type EncryptedGuestRecord = { id: 'active'; revision: number; iv: Uint8Array; ciphertext: ArrayBuffer };
const DATABASE = 'drnib-guest-planning-v1';
const encoder = new TextEncoder();
const fail = () => Error('Guest draft storage is unavailable. Nothing was sent. Use a browser with IndexedDB and Web Locks, or sign in.');
async function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw fail();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('records', { keyPath: 'id' }); request.result.createObjectStore('keys'); };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = request.onblocked = () => reject(fail());
  });
}
async function read<T>(store: string, id: string): Promise<T | undefined> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly'), request = tx.objectStore(store).get(id); let result: T;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(fail());
  }); } finally { db.close(); }
}
async function putKey(id: string, key: CryptoKey) {
  if (key.extractable || key.type !== 'secret') throw fail();
  const db = await database();
  try { await new Promise<void>((resolve, reject) => { const tx=db.transaction('keys','readwrite');tx.objectStore('keys').put(key,id);tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(fail()); }); } finally {db.close();}
}
export async function withGuestLock<T>(name: string, work: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) throw fail();
  return navigator.locks.request(`drnib-guest:${name}`, work);
}
async function deviceKey(create: boolean): Promise<CryptoKey | undefined> {
  const existing = await read<CryptoKey>('keys','device');
  if (existing) { if (existing.extractable || existing.algorithm.name !== 'AES-GCM') throw fail(); return existing; }
  if (!create) return;
  const key = await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  await putKey('device',key); return key;
}
export async function saveGuestVaultKey(runId: string, key: CryptoKey) { await putKey(`vault:${runId}`,key); }
export function readGuestVaultKey(runId: string) { return read<CryptoKey>('keys',`vault:${runId}`); }
function aad(revision: number) { return encoder.encode(`drnib-guest-draft-v1\0active\0${revision}`); }
export async function decryptGuestRecord<T>(record: EncryptedGuestRecord, key: CryptoKey): Promise<T> {
  if(record.id!=='active'||!Number.isSafeInteger(record.revision)||record.revision<1||record.iv.byteLength!==12||record.ciphertext.byteLength>2*1024*1024)throw fail();
  const bytes = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:record.iv as BufferSource,additionalData:aad(record.revision) as BufferSource},key,record.ciphertext));
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } finally { bytes.fill(0); }
}
export async function readEncryptedGuestDraft<T>(): Promise<{value:T;revision:number}|null> {
  const record = await read<EncryptedGuestRecord>('records','active'); if(!record)return null;
  const key=await deviceKey(false);if(!key)throw fail();
  try{return {value:await decryptGuestRecord<T>(record,key),revision:record.revision};}catch{throw Error('The encrypted guest draft could not be opened. It has not been replaced.');}
}
export async function updateEncryptedGuestDraft<T>(update:(current:T|null)=>T,expectedRevision?:number):Promise<{value:T;revision:number}> {
  return withGuestLock('draft',async()=>{
    const current=await readEncryptedGuestDraft<T>();
    if(expectedRevision!==undefined&&(current?.revision??0)!==expectedRevision)throw Error('This guest draft changed in another tab. Reload before editing it.');
    const value=update(current?.value??null),revision=(current?.revision??0)+1,bytes=encoder.encode(JSON.stringify(value));
    if(bytes.length>1024*1024)throw Error('Guest draft exceeds its device storage limit.');
    const key=await deviceKey(true);if(!key)throw fail();const iv=crypto.getRandomValues(new Uint8Array(12));
    let ciphertext:ArrayBuffer;try{ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(revision) as BufferSource},key,bytes);}finally{bytes.fill(0);}
    const db=await database();
    try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),get=store.get('active');get.onsuccess=()=>{if((get.result?.revision??0)!==(current?.revision??0)){tx.abort();return;}store.put({id:'active',revision,iv,ciphertext});};tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(Error('Guest draft changed or could not be saved. No request was sent.'));});}finally{db.close();}
    return {value,revision};
  });
}
