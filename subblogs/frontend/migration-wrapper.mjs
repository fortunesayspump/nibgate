import inner from './.open-next/worker.js';
import {dispatch} from '../../policy-creator-writing.mjs';
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js';
export default {fetch(request,env,ctx){return dispatch(request,'creator',inner,env,ctx)}};
