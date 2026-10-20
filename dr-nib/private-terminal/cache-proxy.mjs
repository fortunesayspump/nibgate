// Runs INSIDE the job's networkless gVisor sandbox. Only real responses fetched
// through exact owner-approved HTTP tools before execution can be served.
import http from 'node:http';import tls from 'node:tls';import {readFileSync}from'node:fs';import {createHash}from'node:crypto';
const records=JSON.parse(readFileSync('/work/.terminal/responses.json','utf8'));
const key=(url,method,body)=>[url,method,createHash('sha256').update(body).digest('hex')].join('|');
const cache=new Map(records.map(r=>[key(new URL(r.url).href,r.method,r.body),r]));
function respond(req,res){const chunks=[];let size=0;req.on('data',chunk=>{size+=chunk.length;if(size>12000){req.destroy();return}chunks.push(chunk)});req.on('end',()=>{let url;try{url=new URL(req.url.startsWith('https://')?req.url:'https://'+req.headers.host+req.url).href}catch{res.writeHead(403);res.end('Unapproved request');return}const row=cache.get(key(url,req.method,Buffer.concat(chunks).toString('utf8')));if(!row){res.writeHead(403);res.end('Network request was not approved. Propose its exact URL, method and body through the research HTTP tool.');return}res.writeHead(row.status,{'content-type':'text/plain; charset=utf-8','x-drnib-source':'owner-approved-http-response'});res.end(req.method==='HEAD'?'':row.text);});}
const server=http.createServer(respond),secure=http.createServer(respond);
const context=tls.createSecureContext({key:readFileSync('/work/.terminal/key.pem'),cert:readFileSync('/work/.terminal/cert.pem')});
server.on('connect',(req,socket,head)=>{if(!records.some(r=>new URL(r.url).host===req.url||new URL(r.url).hostname+':443'===req.url)){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return}socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)socket.unshift(head);const wrapped=new tls.TLSSocket(socket,{isServer:true,secureContext:context});wrapped.on('error',()=>socket.destroy());secure.emit('connection',wrapped);});
server.on('clientError',(_error,socket)=>socket.destroy());server.listen(3128,'127.0.0.1',()=>process.stdout.write('ready\n'));
