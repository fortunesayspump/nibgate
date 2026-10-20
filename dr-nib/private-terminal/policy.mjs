import {Buffer} from 'node:buffer';
export const RUNTIME_RELEASE='release-20261012.0';
export const RUNTIME_ARCHIVE_SHA256='180dd277f657c1478f09490e8a9a595f7378257510b43d1d3694a769aef9ed02';
export const safePath=value=>typeof value==='string'&&value.length<=160&&/^[a-zA-Z0-9_][a-zA-Z0-9_./-]*$/.test(value)&&value.split('/').every(p=>p&&p!=='.'&&p!=='..');
export function validateTerminalInput(input){
 const fail=()=>{throw Error('PRIVATE_TERMINAL_INPUT_INVALID')};
 if(!input||Object.keys(input).some(k=>!['command','files','persist','publicResponses'].includes(k))||typeof input.command!=='string'||!input.command.trim()||input.command.length>16000||input.command.includes('\0'))fail();
 const files=input.files??{};if(!files||typeof files!=='object'||Array.isArray(files)||Object.keys(files).length>32)fail();
 let bytes=0;for(const [path,content]of Object.entries(files)){if(!safePath(path)||typeof content!=='string'||content.includes('\0'))fail();bytes+=Buffer.byteLength(content);}if(bytes>262144)fail();
 const persist=input.persist??[];if(!Array.isArray(persist)||persist.length>8||persist.some(p=>!safePath(p))||new Set(persist).size!==persist.length)fail();
 const publicResponses=input.publicResponses??[];if(!Array.isArray(publicResponses)||publicResponses.length>12)fail();
 for(const row of publicResponses){if(!row||typeof row!=='object'||Array.isArray(row))fail();let u;try{u=new URL(row.url)}catch{fail()};if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||!['GET','HEAD','POST'].includes(row.method)||typeof row.body!=='string'||row.body.length>10000||typeof row.text!=='string'||row.text.length>24000||!Number.isInteger(row.status)||row.status<200||row.status>=300)fail();}
 return {command:input.command,files,persist,publicResponses};
}
export function terminalSpec({rootfs,work,command,uid=1000,gid=1000,networkProxy=false}){
 const env=['PATH=/usr/local/bin:/usr/bin:/bin','HOME=/work','LANG=C.UTF-8','PYTHONUNBUFFERED=1','PYTHONDONTWRITEBYTECODE=1','OPENBLAS_NUM_THREADS=1','OMP_NUM_THREADS=1','NUMEXPR_NUM_THREADS=1','TMPDIR=/tmp'];
 if(networkProxy)env.push('HTTP_PROXY=http://127.0.0.1:3128','HTTPS_PROXY=http://127.0.0.1:3128','http_proxy=http://127.0.0.1:3128','https_proxy=http://127.0.0.1:3128','SSL_CERT_FILE=/work/.terminal/cert.pem','REQUESTS_CA_BUNDLE=/work/.terminal/cert.pem','NODE_EXTRA_CA_CERTS=/work/.terminal/cert.pem','PIP_CERT=/work/.terminal/cert.pem','CURL_CA_BUNDLE=/work/.terminal/cert.pem');
 const mounts=['/usr','/bin','/lib','/lib64','/sbin','/etc/alternatives','/etc/ssl/certs','/etc/ld.so.cache'].map(path=>({destination:path,source:path,type:'bind',options:['rbind','ro','nosuid','nodev']}));
 mounts.push({destination:'/proc',type:'proc',source:'proc'},{destination:'/dev',type:'tmpfs',source:'tmpfs',options:['nosuid','noexec','size=16777216']},{destination:'/tmp',type:'tmpfs',source:'tmpfs',options:['nosuid','nodev','size=134217728']},{destination:'/work',type:'bind',source:work,options:['rbind','rw','nosuid','nodev']});
 return {ociVersion:'1.2.0',root:{path:rootfs,readonly:true},hostname:'drnib-terminal',process:{terminal:false,args:['/bin/bash','/work/.terminal/start.sh'],env,cwd:'/work',user:{uid,gid},noNewPrivileges:true,capabilities:{bounding:[],effective:[],inheritable:[],permitted:[],ambient:[]},rlimits:[{type:'RLIMIT_NOFILE',hard:128,soft:128},{type:'RLIMIT_NPROC',hard:64,soft:64},{type:'RLIMIT_FSIZE',hard:67108864,soft:67108864}]},mounts,linux:{namespaces:['pid','network','ipc','uts','mount'].map(type=>({type})),maskedPaths:['/proc/acpi','/proc/kcore','/proc/keys','/proc/timer_list','/proc/sysrq-trigger','/sys/firmware'],readonlyPaths:['/proc/sys','/proc/sysrq-trigger']}};
}
