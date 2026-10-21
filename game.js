export const STARTING_BALANCE=1000, MIN_BET=10, MAX_BET=100;
export const SUITS=["♠","♥","♦","♣"];
export const RANKS=[["6",6],["7",7],["8",8],["9",9],["10",10],["A",11]];
export function createDeck(random=Math.random){
 const d=SUITS.flatMap(s=>RANKS.map(([rank,value])=>({id:s+rank,suit:s,rank,value})));
 for(let i=d.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[d[i],d[j]]=[d[j],d[i]];} return d;
}
export function scoreHand(cards){
 if(!Array.isArray(cards)||cards.length!==3)throw Error("Нужно ровно три карты");
 const r=cards.map(c=>c.rank);
 if(r.every(x=>x==="A"))return {score:33,kind:"three-aces"};
 if(r.every(x=>x==="6"))return {score:34,kind:"three-sixes"};
 if(r.every(x=>x==="10"))return {score:null,kind:"redeal"};
 const sums={}; for(const c of cards)sums[c.suit]=(sums[c.suit]||0)+c.value;
 if(Object.keys(sums).length===3)return {score:Math.max(...cards.map(c=>c.value)),kind:"high-card"};
 return {score:Math.max(...Object.values(sums)),kind:"same-suit"};
}
export function compareHands(a,b){
 const x=scoreHand(a),y=scoreHand(b);
 if(x.kind==="redeal"||y.kind==="redeal")return {winner:null,reason:"redeal",a:x,b:y};
 if(x.score===y.score)return {winner:null,reason:"tie",a:x,b:y};
 return {winner:x.score>y.score?"a":"b",reason:"score",a:x,b:y};
}
export function createRoom(id,name,host){
 return {id,name:(name||"Стол Трыньки").slice(0,40),hostId:host.id,players:[],status:"waiting",phase:"waiting",pot:0,currentBet:0,round:0,currentPlayerId:null,deck:[],darkAllowed:true,darkPlayerId:null,darkBet:0,roundStarterId:host.id,history:[],message:"Ждём игроков",winnerId:null,tieCandidates:[]};
}
export function addPlayer(room,user){
 if(room.status!=="waiting")throw Error("Партия уже началась");
 let old=room.players.find(p=>p.id===user.id); if(old)return old;
 if(room.players.length>=8)throw Error("За столом максимум 8 игроков");
 const p={id:user.id,name:String(user.name||"Игрок").slice(0,32),balance:user.balance??STARTING_BALANCE,seat:room.players.length,cards:null,cardsVisible:true,mode:"normal",folded:false,active:true,bet:0,acted:false,ready:false};
 room.players.push(p);room.history.push(p.name+" сел за стол");return p;
}
function pby(room,id){const p=room.players.find(x=>x.id===id);if(!p)throw Error("Игрок не найден");return p;}
function put(room,p,n){
 if(!Number.isInteger(n)||n<1||n>MAX_BET)throw Error("Некорректный размер ставки");
 if(n>p.balance)throw Error("Недостаточно фишек");
 p.balance-=n;p.bet+=n;room.pot+=n;room.currentBet=Math.max(room.currentBet,p.bet);
}
function publicPlayer(p,viewer){return {id:p.id,name:p.name,balance:p.balance,seat:p.seat,mode:p.mode,folded:p.folded,active:p.active,bet:p.bet,ready:p.ready,cards:p.id===viewer&&p.mode!=="dark"&&p.cardsVisible?p.cards:undefined};}
export function publicRoom(room,viewer){return {id:room.id,name:room.name,hostId:room.hostId,status:room.status,phase:room.phase,pot:room.pot,currentBet:room.currentBet,round:room.round,currentPlayerId:room.currentPlayerId,darkAllowed:room.darkAllowed,message:room.message,winnerId:room.winnerId,players:room.players.map(p=>publicPlayer(p,viewer)),history:room.history.slice(-20)};}
function active(room){return room.players.filter(p=>p.active&&!p.folded);}
function next(room,id){const i=room.players.findIndex(p=>p.id===id);for(let k=1;k<=room.players.length;k++){const p=room.players[(i+k)%room.players.length];if(p&&p.active&&!p.folded)return p.id;}return null;}
function clockwiseAfter(room,id){const i=room.players.findIndex(p=>p.id===id);if(i<0)return room.players[0]?.id||null;return room.players[(i+1)%room.players.length]?.id||null;}
function startNextHand(room,dealerId,resultMessage){
 const dealer=pby(room,dealerId),firstId=clockwiseAfter(room,dealerId),first=pby(room,firstId);
 room.winnerId=dealerId;
 if(room.players.some(x=>x.balance<MIN_BET)){
  room.status="finished";room.phase="finished";room.currentPlayerId=null;
  room.message=resultMessage+". Следующая раздача невозможна: одному из игроков не хватает 10 фишек.";
  room.history.push(room.message);return;
 }
 room.pot=0;room.currentBet=0;
 deal(room,firstId);
 for(const x of room.players)put(room,x,MIN_BET);
 room.currentBet=MIN_BET;
 room.dealerId=dealerId;
 room.message=resultMessage+". "+dealer.name+" раздаёт; "+first.name+" ходит первым по часовой стрелке.";
 room.history.push(room.message);
}
function endIfOne(room){const a=active(room);if(a.length===1){const winner=a[0];winner.balance+=room.pot;room.pot=0;const result=winner.name+" забирает банк";startNextHand(room,winner.id,result);return true;}return false;}
function deal(room,starter){room.deck=createDeck();for(const p of room.players){p.cards=room.deck.splice(0,3);p.cardsVisible=true;p.mode="normal";p.folded=false;p.active=true;p.bet=0;p.acted=false;p.ready=false;}room.status="playing";room.phase="mode-choice";room.currentPlayerId=starter;room.roundStarterId=starter;room.currentBet=0;room.round=0;room.darkAllowed=true;room.message="Выберите обычную игру или тёмную";room.history.push("Карты розданы");}
function betting(room,starter){room.phase="betting";room.round=1;room.currentBet=Math.max(0,...room.players.map(p=>p.bet));room.players.forEach(p=>{p.acted=false;});room.currentPlayerId=starter;room.roundStarterId=starter;room.message="Началась торговля";}
function showdown(room,a,b){
 const r=compareHands(a.cards,b.cards);
 if(r.reason==="redeal"){room.phase="redeal-pending";room.currentPlayerId=(r.a.kind==="redeal"?a:b).id;room.message="Три десятки: можно запустить пересдачу";return;}
 if(r.reason==="tie"){room.phase="svara-pending";room.tieCandidates=[a.id,b.id];room.currentPlayerId=a.id;room.message="Равные очки: свара";return;}
 const w=r.winner==="a"?a:b;w.balance+=room.pot;room.pot=0;startNextHand(room,w.id,w.name+" выиграл вскрытие");
}
export function startGame(room,userId){
 if(room.hostId!==userId)throw Error("Начать игру может создатель стола");
 if(room.status!=="waiting"||room.players.length<2||room.players.length>8)throw Error("Для старта нужно от 2 до 8 игроков");
 for(const p of room.players){if(p.balance<MIN_BET)throw Error(p.name+": недостаточно фишек");}
 deal(room,room.players[0].id);for(const p of room.players)put(room,p,MIN_BET);room.currentBet=MIN_BET;room.history.push("Каждый внёс анте 10");
}
export function act(room,userId,action,amount=10){
 if(room.status!=="playing")throw Error("Партия не принимает ходы");
 const p=pby(room,userId);if(room.currentPlayerId!==userId)throw Error("Сейчас ход другого игрока");if(p.folded)throw Error("Вы уже пасанули");
 if(room.phase==="mode-choice"){
  if(action!=="normal"&&action!=="dark")throw Error("Выберите обычную игру или тёмную");
  if(action==="dark"){if(!room.darkAllowed)throw Error("В этом круге тёмная уже закрыта");const target=Math.max(Number(amount)||11,MIN_BET+1,room.currentBet+1);if(target>MAX_BET)throw Error("Нельзя затемнить выше лимита ставки");put(room,p,target-p.bet);p.mode="dark";p.cardsVisible=false;room.darkPlayerId=p.id;room.darkBet=target;}else{p.mode="normal";p.cardsVisible=true;if(p.id===room.roundStarterId)room.darkAllowed=false;}
  p.ready=true;room.history.push(p.name+(action==="dark"?" играет в тёмную":" выбрал обычную игру"));
  const n=room.players.find(x=>!x.ready);if(n)room.currentPlayerId=n.id;else betting(room,room.roundStarterId);return;
 }
 if(room.phase==="redeal-pending"){
  if(action!=="redeal")throw Error("Подтвердите пересдачу");
  const initiator=p;room.deck=createDeck();for(const x of active(room)){x.cards=room.deck.splice(0,3);x.cardsVisible=x.mode!=="dark";x.bet=0;x.acted=false;}
  room.currentBet=0;room.round++;room.darkPlayerId=null;room.darkBet=0;room.darkAllowed=true;room.phase="betting";room.currentPlayerId=initiator.id;room.message="Пересдача: анте повторно не взимается";room.history.push(room.message);return;
 }
 if(room.phase==="svara-pending"){
  if(action==="split"){const cs=room.tieCandidates.map(id=>pby(room,id));const share=Math.floor(room.pot/cs.length),remainder=room.pot-share*cs.length;cs.forEach((x,i)=>x.balance+=share+(i===0?remainder:0));room.pot=0;startNextHand(room,p.id,"Банк разделён между "+cs.map(x=>x.name).join(" и "));return;}
  if(action==="redeal"){room.deck=createDeck();for(const x of active(room)){x.cards=room.deck.splice(0,3);x.cardsVisible=true;x.mode="normal";x.bet=0;x.acted=false;}room.currentBet=0;room.round=1;room.darkPlayerId=null;room.darkBet=0;room.phase="betting";room.currentPlayerId=room.tieCandidates[0];room.darkAllowed=false;room.message="Свара: тёмная игра запрещена";return;}
  throw Error("В сваре можно разделить банк или начать новую партию");
 }
 if(room.phase!=="betting")throw Error("Недопустимая стадия игры");
 if(action!=="dark"&&room.darkAllowed&&userId===room.roundStarterId&&room.darkPlayerId!==userId)room.darkAllowed=false;
 if(action==="pass"){p.folded=true;p.acted=true;room.history.push(p.name+" пас");if(endIfOne(room))return;}
 else if(action==="look"){if(p.mode!=="dark")throw Error("Карты уже доступны");p.mode="normal";p.cardsVisible=true;p.acted=true;room.history.push(p.name+" посмотрел карты");}
 else if(action==="support"){const required=room.darkPlayerId&&p.id!==room.darkPlayerId&&p.mode!=="dark"?Math.max(room.currentBet,room.darkBet*2):room.currentBet;const due=required-p.bet;if(due<=0)throw Error("Ставка уже уравнена");if(due>p.balance){p.folded=true;room.history.push(p.name+" выбыл: недостаточно фишек");if(endIfOne(room))return;}else{p.balance-=due;p.bet+=due;room.pot+=due;p.acted=true;}}
 else if(action==="raise"||action==="dark"){if(action==="dark"&&!room.darkAllowed)throw Error("Нельзя начать тёмную в этом круге");const target=Number(amount);if(!Number.isInteger(target)||target<MIN_BET||target<=room.currentBet||target>MAX_BET)throw Error("Повышение должно быть не меньше 10, выше текущей ставки и не больше 100");const due=target-p.bet;if(due>p.balance){p.folded=true;if(endIfOne(room))return;}else{put(room,p,due);p.acted=true;if(action==="dark"){p.mode="dark";p.cardsVisible=false;room.darkPlayerId=p.id;room.darkBet=target;}else if(room.darkPlayerId&&p.mode!=="dark"){room.darkPlayerId=null;room.darkBet=0;}room.darkAllowed=false;room.history.push(p.name+" повысил ставку до "+target);}}
 else if(action==="reveal"){if(room.round<2)throw Error("Вскрытие доступно со второго круга торгов");const prev=room.players.slice(0,p.seat).reverse().find(x=>x.active&&!x.folded)||room.players.slice().reverse().find(x=>x.id!==p.id&&x.active&&!x.folded);if(!prev)throw Error("Нет соперника для вскрытия");showdown(room,p,prev);return;}
 else throw Error("Неизвестное действие");
 const a=active(room);if(a.length===1){endIfOne(room);return;}
 if(a.every(x=>x.acted&&x.bet>=(room.darkPlayerId&&x.id!==room.darkPlayerId&&x.mode!=="dark"?Math.max(room.currentBet,room.darkBet*2):room.currentBet))){room.round++;a.forEach(x=>x.acted=false);room.darkAllowed=true;room.roundStarterId=a[0].id;room.currentPlayerId=a[0].id;room.message="Круг торгов "+room.round;room.history.push(room.message);}else room.currentPlayerId=next(room,userId);
}
