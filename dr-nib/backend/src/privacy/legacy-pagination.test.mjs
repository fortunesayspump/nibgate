import {test} from 'node:test';
import assert from 'node:assert/strict';
import {oldestLegacyRuns} from './legacy-pagination.js';
test('blocked private rows before legacy refunds cannot starve them',async()=>{
  const rows=Array.from({length:103},(_,i)=>({id:String(i).padStart(3,'0'),metadata:i<101?{privacyMode:'confidential'}:{privacyMode:'legacy'},status:'complete'}));
  const calls=[];
  const findMany=async(q)=>{calls.push(q);const start=q.cursor?rows.findIndex(r=>r.id===q.cursor.id)+1:0;return rows.slice(start,start+q.take)};
  const result=await oldestLegacyRuns(findMany,{status:'complete'},{status:true});
  assert.deepEqual(result.map(x=>x.id),['101','102']);
  assert.equal(calls.length,3);
});
