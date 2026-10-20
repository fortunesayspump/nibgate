/** The attested worker creates new encrypted journals as well as updating the
 * manifest. Keep the workstation setup and restricted-role acceptance aligned. */
export function privateCheckpointGrant({schema='drnib',role='drnib_private_guest_testnet'}={}){
 if(!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)||!/^[a-z_][a-z0-9_]{0,62}$/.test(role))throw Error('Invalid private checkpoint grant target');
 return `GRANT SELECT, INSERT, UPDATE ON "${schema}"."PrivateClientObject" TO "${role}"`;
}
