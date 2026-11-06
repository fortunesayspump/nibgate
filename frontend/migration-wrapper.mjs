import inner from './.open-next/worker.js';
import {dispatch} from '../policy-hub-blog.mjs';
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js';
export default {fetch(request,env,ctx){return dispatch(request,'hub',inner,env,ctx)}};
