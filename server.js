import http from "node:http";
import crypto from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRoom,addPlayer,startGame,act,publicRoom,STARTING_BALANCE} from "./game.js";

const root=path.dirname(fileURLToPath(import.meta.url));
const rooms=new Map(),sessions=new Map(),users=new Map();
const PORT=Number(process.env.PORT||3000),BOT_TOKEN=process.env.TELEGRAM_BOT_TOKEN||"";
const DEMO_AUTH=process.env.ALLOW_DEMO_AUTH==="true"||process.env.NODE_ENV!=="production";
function send(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(data));}
async function body(req){let raw="";for await(const chunk of req){raw+=chunk;if(raw.length>100000)throw Error("Request too large");}return raw?JSON.parse(raw):{};}
function validate(initData){
 if(!BOT_TOKEN||!initData)return null;
 const p=new URLSearchParams(initData),hash=p.get("hash");if(!hash)return null;p.delete("hash");
 const check=[...p.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(x=>x[0]+"="+x[1]).join("\n");
 const secret=crypto.createHmac("sha256","WebAppData").update(BOT_TOKEN).digest();
 const calculated=crypto.createHmac("sha256",secret).update(check).digest("hex");
 const a=Buffer.from(calculated,"hex"),b=Buffer.from(hash,"hex");
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
 const date=Number(p.get("auth_date"));if(!date||Math.abs(Date.now()/1000-date)>86400)return null;
 try{const u=JSON.parse(p.get("user")||"{}");if(!u.id)return null;return {id:"tg_"+u.id,name:[u.first_name,u.last_name].filter(Boolean).join(" ")||u.username||"Игрок",telegramId:String(u.id)};}catch{return null;}
}
function getUser(req){const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");const id=sessions.get(token);return id?users.get(id):null;}
async function staticFile(res,file,type){try{const data=await readFile(path.join(root,"public",file));res.writeHead(200,{"content-type":type,"cache-control":"no-cache"});res.end(data);}catch{send(res,500,{error:"Не удалось загрузить приложение"});}}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,"http://localhost"),p=url.pathname;
 if(req.method==="GET"&&p==="/health")return send(res,200,{ok:true,service:"trynka",rooms:rooms.size,auth:BOT_TOKEN?"telegram":DEMO_AUTH?"demo":"not-configured"});
 if(req.method==="GET"&&p==="/api/config")return send(res,200,{telegramConfigured:!!BOT_TOKEN,demoAuth:DEMO_AUTH,minPlayers:2,maxPlayers:8,startingBalance:STARTING_BALANCE});
 if(req.method==="POST"&&p==="/api/auth"){
  try{const input=await body(req);let identity=validate(input.initData);
   if(!identity&&DEMO_AUTH)identity={id:"demo_"+crypto.randomUUID(),name:String(input.name||"Игрок").trim().slice(0,32)||"Игрок",demo:true};
   if(!identity)return send(res,401,{error:BOT_TOKEN?"Не удалось проверить Telegram. Перезапусти Mini App.":"На сервере не настроен Telegram Bot Token."});
   let user=users.get(identity.id);if(!user){user={...identity,balance:STARTING_BALANCE};users.set(user.id,user);}else if(identity.name)user.name=identity.name;
   const token=crypto.randomBytes(32).toString("hex");sessions.set(token,user.id);
   return send(res,200,{token,user:{id:user.id,name:user.name,balance:user.balance,demo:!!user.demo}});
  }catch(e){return send(res,400,{error:e.message||"Некорректный запрос"});}
 }
 const user=getUser(req);
 if(p.startsWith("/api/")&&!user)return send(res,401,{error:"Требуется вход"});
 try{
  if(req.method==="GET"&&p==="/api/me")return send(res,200,{id:user.id,name:user.name,balance:user.balance,demo:!!user.demo});
  if(req.method==="GET"&&p==="/api/rooms")return send(res,200,{rooms:[...rooms.values()].filter(r=>r.status==="waiting"||r.status==="playing").map(r=>({id:r.id,name:r.name,players:r.players.length,status:r.status,phase:r.phase}))});
  if(req.method==="POST"&&p==="/api/rooms"){
   const input=await body(req),id=crypto.randomBytes(4).toString("hex").toUpperCase(),room=createRoom(id,input.name||"Стол друзей",user);addPlayer(room,user);rooms.set(id,room);
   return send(res,201,{room:publicRoom(room,user.id),inviteUrl:url.origin+"/?room="+id});
  }
  let m=p.match(/^\/api\/rooms\/([A-Z0-9]+)\/join$/i);
  if(req.method==="POST"&&m){const r=rooms.get(m[1].toUpperCase());if(!r)return send(res,404,{error:"Стол не найден"});addPlayer(r,user);return send(res,200,{room:publicRoom(r,user.id)});}
  m=p.match(/^\/api\/rooms\/([A-Z0-9]+)\/start$/i);
  if(req.method==="POST"&&m){const r=rooms.get(m[1].toUpperCase());if(!r)return send(res,404,{error:"Стол не найден"});startGame(r,user.id);for(const player of r.players){const stored=users.get(player.id);if(stored)stored.balance=player.balance;}return send(res,200,{room:publicRoom(r,user.id)});}
  m=p.match(/^\/api\/rooms\/([A-Z0-9]+)\/action$/i);
  if(req.method==="POST"&&m){const r=rooms.get(m[1].toUpperCase());if(!r||!r.players.some(x=>x.id===user.id))return send(res,404,{error:"Стол не найден или вы не участник"});const input=await body(req);act(r,user.id,input.action,input.amount);for(const player of r.players){const stored=users.get(player.id);if(stored)stored.balance=player.balance;}return send(res,200,{room:publicRoom(r,user.id),balance:user.balance});}
  m=p.match(/^\/api\/rooms\/([A-Z0-9]+)$/i);
  if(req.method==="GET"&&m){const r=rooms.get(m[1].toUpperCase());if(!r||!r.players.some(x=>x.id===user.id))return send(res,404,{error:"Стол не найден или вы не участник"});return send(res,200,{room:publicRoom(r,user.id)});}
  if(p.startsWith("/api/"))return send(res,404,{error:"API-маршрут не найден"});
  if(req.method==="GET"&&p==="/")return staticFile(res,"index.html","text/html; charset=utf-8");
  return send(res,404,{error:"Страница не найдена"});
 }catch(e){return send(res,400,{error:e.message||"Ошибка запроса"});}
});
server.listen(PORT,"0.0.0.0",()=>console.log("Trynka server listening on "+PORT+"; auth="+(BOT_TOKEN?"telegram":DEMO_AUTH?"demo":"unconfigured")));
