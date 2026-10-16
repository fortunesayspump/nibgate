import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredPrivateBroker} from './private-broker-config.js';

test('private broker is unavailable by default or with incomplete credentials, preserving conventional server',async()=>{
  for(const env of [{},{DRNIB_PRIVATE_ENABLED:'true'},{DRNIB_PRIVATE_ENABLED:'true',DRNIB_PRIVATE_GUEST_BASE_URL:'http://unsafe',PRIVATE_BROKER_PRIVATE_KEY_PKCS8_PEM:'invalid'},
    {DRNIB_PRIVATE_ENABLED:'true',DRNIB_PRIVATE_GUEST_BASE_URL:'https://guest.example',PRIVATE_BROKER_PRIVATE_KEY_PKCS8_PEM:'invalid'}]){
    const config=await configuredPrivateBroker(env);
    assert.equal(await config.ready(),false);assert.equal(config.signCapability,undefined);
  }
});
