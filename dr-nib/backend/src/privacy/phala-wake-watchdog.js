// Run independently of the HTTP broker, using the same scoped lifecycle DB,
// release policy and CVM ID. It reconciles/stops only; it never requests a wake.
import '../env.js';
import {configuredPrivateBroker} from './private-broker-config.js';
const broker=await configuredPrivateBroker();
if(!broker.wakeController)throw Error('PHALA_WATCHDOG_CONFIG_UNAVAILABLE');
const timer=setInterval(()=>void broker.wakeController.tick().catch(()=>console.error('[private-lifecycle] reconciliation required')),5000);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);void broker.wakeController.close().finally(()=>process.exit());});
console.log('[private-lifecycle] independent watchdog ready');
