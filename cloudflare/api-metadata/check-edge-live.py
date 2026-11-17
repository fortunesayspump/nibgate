import sys,json,subprocess,tempfile,pathlib,datetime
# Explicitly supply host and its current Railway origin IP. Public read-only checks only.
# Usage: python3 cloudflare/api-metadata/check-edge-live.py HOST ORIGIN_IP [REPORT_PATH]
if len(sys.argv) < 3:
 raise SystemExit('Usage: check-edge-live.py HOST ORIGIN_IP [REPORT_PATH]')
host=sys.argv[1]; ip=sys.argv[2]
meta=json.load((pathlib.Path(__file__).parent/'metadata.json').open())
data=meta['hosts'][host]; results=[]
def req(path='/mcp',method='GET',headers=None,body=None,direct=False):
 with tempfile.TemporaryDirectory() as d:
  cmd=['curl','-sS','--max-time','45','-D',d+'/h','-o',d+'/b','-X',method,'-A','Python-urllib/3.14']
  if direct:cmd+=['--resolve',host+':443:'+ip]
  for k,v in (headers or {}).items():cmd+=['-H',k+': '+v]
  if body is not None:cmd+=['--data-binary','@-']
  cmd+=['https://'+host+path]
  r=subprocess.run(cmd,input=body,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  if r.returncode:raise RuntimeError(r.stderr.decode())
  raw=pathlib.Path(d+'/h').read_text(); h={}
  for line in raw.splitlines():
   if line.startswith('HTTP/'):status=int(line.split()[1]);h={}
   elif ':' in line:k,v=line.split(':',1);h[k.lower()]=v.strip()
  b=pathlib.Path(d+'/b').read_bytes()
  return status,h,b

def record(label,r):
 s,h,b=r; results.append({'test':label,'status':s,'edge':bool(h.get('x-nibgate-edge-metadata')),'ray':h.get('cf-ray'),'railwayRequestId':h.get('x-railway-request-id'),'bytes':len(b)});print(json.dumps(results[-1]),flush=True)
def rpc(method,params=None,id='live-edge-check'):
 m={'jsonrpc':'2.0','id':id,'method':method}
 if params is not None:m['params']=params
 return json.dumps(m).encode()
for ua in ['Python-urllib/3.14','python-httpx/0.28.1','FixterMonitoring/1.0','SentinelOracle/1.0','']:
 r=req(headers={'User-Agent':ua});assert r[0]==200 and r[1].get('x-nibgate-edge-metadata')==meta['sourceSha256'];assert json.loads(r[2])==data['info'];record('client '+(ua or 'missing UA'),r)
for path,key in [('/.well-known/mcp.json','card'),('/openapi.json','openapi'),('/api/openapi.json','openapi')]:
 r=req(path);assert r[0]==200 and r[1].get('x-nibgate-edge-metadata');assert json.loads(r[2])==data[key];record(path,r)
for method,result in [('initialize',data['info']),('ping',{}),('tools/list',{'tools':data['tools']})]:
 r=req(method='POST',headers={'Content-Type':'application/json'},body=rpc(method));assert r[0]==200 and r[1].get('x-nibgate-edge-metadata');assert json.loads(r[2])=={'jsonrpc':'2.0','id':'live-edge-check','result':result};record(method,r)
for method in ['notifications/initialized','notifications/cancelled']:
 r=req(method='POST',headers={'Content-Type':'application/json'},body=json.dumps({'jsonrpc':'2.0','method':method}).encode());assert r[0]==202 and not r[2] and r[1].get('x-nibgate-edge-metadata');record(method,r)
cases=[('auth header','/mcp','GET',{'Authorization':'Bearer invalid-edge-verification'},None),('session header','/mcp','GET',{'Mcp-Session-Id':'edge-verification-nonexistent'},None),('cookie','/mcp','GET',{'Cookie':'edge-verification=not-a-session'},None),('allowed Origin','/mcp','GET',{'Origin':'https://nibgate.xyz'},None),('denied Origin','/mcp','GET',{'Origin':'https://example.invalid'},None),('preflight','/mcp','OPTIONS',{'Origin':'https://nibgate.xyz','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'},None),('query','/mcp?edge-verification=1','GET',{},None),('unknown protocol','/mcp','GET',{'Mcp-Protocol-Version':'1900-01-01'},None),('unknown method','/mcp','POST',{'Content-Type':'application/json'},rpc('unknown-edge-verification')),('unknown tool','/mcp','POST',{'Content-Type':'application/json'},rpc('tools/call',{'name':'unknown-edge-verification'})),('malformed JSON','/mcp','POST',{'Content-Type':'application/json'},b'{'),('over classification limit','/mcp','POST',{'Content-Type':'application/json'},rpc('ping',{'padding':'x'*66000})),('protected endpoint','/api/nibshare/mine','GET',{'Authorization':'Bearer invalid-edge-verification'},None),('path suffix','/mcp-invalid-edge-check','GET',{},None)]
for label,path,method,headers,body in cases:
 baseline=req(path,method,headers,body,True); r=req(path,method,headers,body)
 assert r[0]==baseline[0],(label,'status',r[0],baseline[0]);assert not r[1].get('x-nibgate-edge-metadata'),label
 for h in ['access-control-allow-origin','access-control-allow-credentials','access-control-allow-methods','access-control-allow-headers','content-type','location','www-authenticate']:
  assert r[1].get(h)==baseline[1].get(h),(label,h)
 assert r[2]==baseline[2],(label,'body mismatch')
 assert r[1].get('x-railway-request-id'),(label,'missing origin ID')
 record(label,r)
r=req(method='POST',headers={'Content-Type':'application/json'},body=rpc('tools/call',{'name':'explore_content','arguments':{'limit':1}},'genuine-read-only-call'))
obj=json.loads(r[2]);assert r[0]==200 and not r[1].get('x-nibgate-edge-metadata') and r[1].get('x-railway-request-id');assert obj['id']=='genuine-read-only-call' and not obj['result'].get('isError');tool=json.loads(obj['result']['content'][0]['text']);assert tool.get('success') is True,tool
record('genuine explore_content',r)
out={'host':host,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':len(results),'results':results}
if len(sys.argv)>3: pathlib.Path(sys.argv[3]).write_text(json.dumps(out,indent=2))
print('PASS',host,len(results))
