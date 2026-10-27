// Synthetic HTTP errors only. No auth, model, wallet or production requests.
import {beforeEach,expect,test,vi} from 'vitest';
const fixture=vi.hoisted(()=>({guest:true,code:'GUEST_SESSION_EXPIRED',status:401}));
vi.mock('./dr-nib-guest-planning',async original=>({...await original<object>(),guestTransport:vi.fn(async()=>fixture.guest?{base:'/synthetic-guest',headers:{}}:null)}));
vi.mock('./dr-nib-private-read',()=>({privateRecordFetch:vi.fn(async()=>Response.json({code:fixture.code,message:'untrusted server prose'},{status:fixture.status}))}));
beforeEach(()=>{fixture.guest=true;fixture.code='GUEST_SESSION_EXPIRED';fixture.status=401;vi.stubGlobal('fetch',vi.fn(async()=>Response.json({code:fixture.code,message:'untrusted server prose'},{status:fixture.status})));});
test('guest records preserve expiry and adopted codes; account 401 stays unauthenticated',async()=>{
 const {privateRecordRequest}=await import('./dr-nib-private-records');
 await expect(privateRecordRequest('/runs/22222222-2222-4222-8222-222222222222/objects')).rejects.toMatchObject({status:401,code:'GUEST_SESSION_EXPIRED'});
 fixture.code='GUEST_SESSION_ADOPTED';await expect(privateRecordRequest('/synthetic')).rejects.toMatchObject({status:401,code:'GUEST_SESSION_ADOPTED'});
 fixture.guest=false;await expect(privateRecordRequest('/identity')).rejects.toMatchObject({status:401,code:'unauthenticated'});
});
test('guest broker preserves expiry/rate codes without interpreting them as account authentication',async()=>{
 const {openGuestSession}=await import('./dr-nib-private-api');
 await expect(openGuestSession('22222222-2222-4222-8222-222222222222','synthetic')).rejects.toMatchObject({status:401,code:'GUEST_SESSION_EXPIRED'});
 fixture.code='GUEST_RATE_LIMIT';fixture.status=429;await expect(openGuestSession('22222222-2222-4222-8222-222222222222','synthetic')).rejects.toMatchObject({status:429,code:'GUEST_RATE_LIMIT'});
});
test('guest error message never exposes untrusted server message',async()=>{
 const {guestPlanningResponseError}=await import('./dr-nib-guest-planning');const error=await guestPlanningResponseError(Response.json({code:'GUEST_SESSION_EXPIRED',message:'untrusted server prose'},{status:401}));expect(error.message).not.toContain('untrusted');
});
