import test from 'node:test';
import assert from 'node:assert/strict';
import {privateFundingListener} from './private-listener.js';
test('funding keeps loopback default and requires its isolated boundary for hosting',()=>{
  assert.deepEqual(privateFundingListener({}),{host:'127.0.0.1',port:3105});
  for(const host of ['0.0.0.0','::']){
    assert.throws(()=>privateFundingListener({DRNIB_PRIVATE_FUNDING_HOST:host}));
    assert.deepEqual(privateFundingListener({DRNIB_PRIVATE_FUNDING_HOST:host,DRNIB_PRIVATE_FUNDING_ONLY:'true',PORT:'8080'}),{host,port:8080});
  }
  for(const env of [{PORT:'0'},{PORT:'65536'},{PORT:'3105.5'},{DRNIB_PRIVATE_FUNDING_HOST:'https://other.example'},{DRNIB_PRIVATE_FUNDING_HOST:'other.example'}])assert.throws(()=>privateFundingListener(env));
});
