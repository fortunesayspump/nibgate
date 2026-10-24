import assert from 'node:assert/strict';
import test from 'node:test';
import {createPrivateLifecycleStore} from './private-lifecycle-store.js';

function fixture(accessMode='owner'){
  const queries=[];
  const tenantId='tenant-1';
  const tx={
    async $executeRaw(strings){queries.push(strings.join('?'));return 1;},
    async $queryRaw(strings){
      const sql=strings.join('?');queries.push(sql);
      if(sql.includes('SELECT "state"'))return [{state:{tenantId,accessMode},now:1}];
      return [{busy:0}];
    }
  };
  const db={$transaction:fn=>fn(tx)};
  return {queries,store:createPrivateLifecycleStore({db,cvmId:'cvm-1',tenantId,accessMode})};
}

test('owner lifecycle query does not require ResearchRun metadata access',async()=>{
  const {queries,store}=fixture();
  await store.mutate({},()=>true);
  const workload=queries.find(sql=>sql.includes('PrivateActionReceipt'));
  assert.match(workload,/r\."userId"=/);
  assert.doesNotMatch(workload,/r\."metadata"/);
});

test('authenticated lifecycle query includes confidential cross-tenant work',async()=>{
  const {queries,store}=fixture('authenticated');
  await store.mutate({},()=>true);
  const workload=queries.find(sql=>sql.includes('PrivateActionReceipt'));
  assert.match(workload,/r\."userId"=/);
  assert.match(workload,/r\."metadata"->>'privacyMode'='confidential'/);
});
