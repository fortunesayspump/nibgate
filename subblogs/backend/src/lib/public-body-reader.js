const {unpackCipherBlob,decryptBytes,getBlob:defaultGetBlob}=require('@nibgate/sdk/server');
const {storedToKey}=require('./keywrap');
// Uses the same SDK storage, key-unwrapping and authenticated decryption
// interfaces as blog.service. No storage provider or credential is created.
function createPublicBodyReader({getBlob=defaultGetBlob,decodeKey=storedToKey}={}) {
  return async (storageRef,contentKey)=>{
    const key=decodeKey(contentKey);
    if(!key)throw new Error('Public content key unavailable');
    const blob=await getBlob({storageRef});
    if(!Buffer.isBuffer(blob)||blob.length>400028)throw new Error('Public body storage exceeds budget');
    const {iv,tag,ciphertext}=unpackCipherBlob(blob);
    return decryptBytes(key,iv,tag,ciphertext);
  };
}
module.exports={createPublicBodyReader};
