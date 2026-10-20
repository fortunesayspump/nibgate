import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const TERMINAL_SECCOMP_PATH='/etc/drnib-terminal-seccomp.json';
export const TERMINAL_SECCOMP_SHA256='ca6d1a088eb076d4b53e395b4c30574dd16cf69598c34eea4728cdba61a95b73';
export const BASE_PRELAUNCH_SHA256='982181610f70be9087b1c69b36b719b47b82d37fcef8acc9289ed3bb3095ffe8';
const hash=value=>createHash('sha256').update(value).digest('hex');
/** The host profile must be installed by a measured pre-launch script BEFORE
 * Compose parses security_opt. Never use an operator-modifiable host profile. */
export function privateTerminalPreLaunchScript(baseScript){
 if(typeof baseScript!=='string'||hash(baseScript)!==BASE_PRELAUNCH_SHA256)throw Error('Unreviewed base pre-launch script');
 const profile=readFileSync(new URL('../private-terminal/seccomp.json',import.meta.url));
 if(hash(profile)!==TERMINAL_SECCOMP_SHA256)throw Error('Unreviewed terminal syscall profile');
 return baseScript+'\n# Measured Dr. Nib terminal profile: Docker default plus pivot_root for SYS_ADMIN.\n'+
  "umask 022\nprintf '%s' '"+profile.toString('base64')+"' | openssl base64 -d -A > "+TERMINAL_SECCOMP_PATH+'\n'+
  "printf '%s\\n' '"+TERMINAL_SECCOMP_SHA256+'  '+TERMINAL_SECCOMP_PATH+"' | sha256sum -c -\nchmod 0644 "+TERMINAL_SECCOMP_PATH+'\n';
}
