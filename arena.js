/* RESTEMAD ARENA – spillet */
(function () {
  "use strict";
  var root = document.getElementById("arenaGame");
  if (!root) return;

  var canvas = root.querySelector("#arenaCanvas"), ctx = canvas.getContext("2d");
  var W = 960, H = 600, ZOOM = .76, WORLD_W = 7600, WORLD_H = 5200, camera = {x:0,y:0}, running = false, mode = "showdown", selected = 0;
  var players = [], bullets = [], particles = [], floatingTexts = [], obstacles = [], killFeed = [], last = 0, elapsed = 0;
  var minimapTerrain=null;
  var terrainTileCache=new Map();
  var keys = Object.create(null), pointer = {x: W/2, y:H/2, down:false};
  var net=null, netInputs=Object.create(null), netLastSend=0, netLastInput=0, netSnapshotAt=0, netInputAt=Object.create(null), netSequence=0, netLastDraw=0;
  var spectateTarget=null,spectateBar=null,spectateName=null;
  var me = null, winner = null, gameOver = false, raf = 0, zone = {x:WORLD_W/2,y:WORLD_H/2,r:1780}, stormStage=0, stormTime=0, stormStart=null, stormTarget=null, dashHeld = false;
  // Original synthesized arcade effects (no external audio downloads or copyrighted samples).
  var audioCtx=null,lastShotSfx=0,audioMaster=null,audioMuted=false;
  var audioButton=document.createElement("button");
  audioButton.type="button";audioButton.textContent="🔊 LYD: TIL";
  audioButton.setAttribute("aria-label","Slå spillets lyd til eller fra");
  audioButton.style.cssText="position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:15;border:2px solid #fff7b8;border-radius:12px;background:#182b28;color:white;padding:8px 13px;font:800 12px system-ui;cursor:pointer;touch-action:manipulation";
  root.querySelector("#arenaCanvasWrap").appendChild(audioButton);
  audioButton.addEventListener("pointerdown",function(){audioReady();},{passive:true});
  audioButton.addEventListener("click",function(){audioMuted=!audioMuted;audioButton.textContent=audioMuted?"🔇 LYD: FRA":"🔊 LYD: TIL";audioReady();if(!audioMuted){tone(600,.18,"sine",.22);tone(880,.24,"triangle",.2,.16);}});
  root.addEventListener("pointerdown",function(){audioReady();},{passive:true});
  root.addEventListener("keydown",function(){audioReady();});

  function audioReady(){
    try{
      var C=window.AudioContext||window.webkitAudioContext;
      if(!C)return null;
      if(!audioCtx){audioCtx=new C();audioMaster=audioCtx.createGain();audioMaster.gain.value=.9;audioMaster.connect(audioCtx.destination);}
      if(audioCtx.state==="suspended")audioCtx.resume().catch(function(){});
      return audioCtx;
    }catch(e){return null;}
  }
  function tone(freq,duration,type,volume,delay,endFreq){
    var ac=audioReady();if(!ac||audioMuted)return;
    try{
      var t=ac.currentTime+(delay||0),osc=ac.createOscillator(),gain=ac.createGain();
      osc.type=type||"sine";osc.frequency.setValueAtTime(freq,t);
      if(endFreq)osc.frequency.exponentialRampToValueAtTime(Math.max(25,endFreq),t+duration);
      gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,(volume||.04)*2.3),t+.008);
      gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
      osc.connect(gain);gain.connect(audioMaster||ac.destination);osc.start(t);osc.stop(t+duration+.02);
    }catch(e){}
  }
  function sound(kind){
    if(kind==="shot"){var ac=audioReady();if(!ac||audioMuted||ac.currentTime-lastShotSfx<.075)return;lastShotSfx=ac.currentTime;tone(360,.085,"triangle",.023,0,125);}
    else if(kind==="hit")tone(210,.10,"square",.025,0,90);
    else if(kind==="super"){tone(180,.28,"sawtooth",.045,0,65);tone(440,.16,"triangle",.065,0,880);tone(660,.26,"sine",.07,.13,1320);tone(990,.34,"triangle",.06,.3,1568);}
    else if(kind==="kill"){tone(420,.11,"triangle",.05);tone(630,.13,"triangle",.055,.10);tone(840,.23,"sine",.07,.22);}
    else if(kind==="win"){
      // New celebratory four-chord fanfare, not Fortnite's recorded victory cue.
      [392,494,587,784,988].forEach(function(n,i){tone(n,.28,"triangle",.075,i*.13);tone(n/2,.42,"sine",.04,i*.13);});
      tone(1175,.85,"sine",.09,.75,1568);tone(196,.9,"triangle",.055,.72);
    }
  }
  var victoryBanner=document.createElement("div");
  victoryBanner.className="arena-victory-banner";victoryBanner.hidden=true;
  victoryBanner.innerHTML='<div class="arena-victory-flare"></div><div class="arena-victory-crown">♛ #1</div><div class="arena-victory-words">VICTORY<br>ROYALE</div><div class="arena-victory-caption">SIDSTE SPILLER TILBAGE</div>';
  root.querySelector("#arenaCanvasWrap").appendChild(victoryBanner);
  var statsKey = "restemad-arena-stats-v1";
  var stats = {wins:0, eliminations:0, trophies:0, games:0};
  try { stats = Object.assign(stats, JSON.parse(localStorage.getItem(statsKey)||"{}")); } catch(e) {}
  var foods = [
    {name:"Bananpandekage", color:"#E8B84F", hp:125, speed:128, damage:13, rate:.25, spread:0, count:1, range:410, desc:"Hurtige, præcise pandekageskud – som en hurtig maskingeværskytte."},
    {name:"Grøntsagswrap", color:"#5BA66A", hp:175, speed:112, damage:25, rate:.72, spread:.08, count:1, range:340, desc:"Kraftige grøntsagsskud med kortere rækkevidde og højere skade."},
    {name:"Pastasalat", color:"#E58A48", hp:145, speed:118, damage:10, rate:.82, spread:.42, count:5, range:300, desc:"Kaster en vifte af fem pastastykker – bedst på tæt hold."},
    {name:"Hjemmelavede croutoner", color:"#B98A55", hp:145, speed:120, damage:19, rate:.58, spread:.10, count:2, range:360, desc:"Skyder to sprøde croutoner ad gangen."}
  ];
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function rand(a,b){return a+Math.random()*(b-a);}
  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  function addKillFeed(killer,victim){
    var killerName=killer&&killer.human?"Dig":killer&&foods[killer.fighter]?foods[killer.fighter].name:"Zonen";
    var victimName=victim&&victim.human?"Dig":victim&&foods[victim.fighter]?foods[victim.fighter].name:"en spiller";
    killFeed.unshift({killer:killerName,victim:victimName,highlight:!!(killer&&killer.human),life:7});
    if(killFeed.length>4)killFeed.length=4;
  }
  function saveStats(){try{localStorage.setItem(statsKey,JSON.stringify(stats));}catch(e){} renderStats();}
  function renderStats(){
    ["wins","eliminations","trophies","games"].forEach(function(k){
      var el=root.querySelector('[data-stat="'+k+'"]'); if(el) el.textContent=stats[k];
    });
    var list=root.querySelector("#arenaLocalBoard");
    if(list) list.innerHTML='<div class="arena-board-row"><b>Dig</b><span>'+stats.wins+' sejre</span><span>'+stats.eliminations+' elimineringer</span><strong>'+stats.trophies+' 🏆</strong></div>';
  }
  function choose(i){
    selected=i; root.querySelectorAll(".arena-fighter").forEach(function(el,n){el.classList.toggle("chosen",n===i);el.setAttribute("aria-pressed",n===i?"true":"false");});
    var f=foods[i]; root.querySelector("#arenaFighterDesc").textContent=f.desc;
  }
  function buildSelect(){
    root.querySelector("#arenaFighters").innerHTML=foods.map(function(f,i){
      return '<button type="button" class="arena-fighter'+(i===selected?" chosen":"")+'" data-fighter="'+i+'" aria-pressed="'+(i===selected)+'"><span class="fighter-preview fighter-preview-'+i+'"><i></i><b></b></span><b>'+f.name+'</b><small>'+f.hp+' liv · '+(f.damage*f.count)+' skade pr. salve</small></button>';
    }).join("");
    root.querySelector("#arenaFighterDesc").textContent=foods[selected].desc;
  }
  function makeMap(){
    obstacles=[];minimapTerrain=null;
    // Symmetrical but varied combat districts centered on the real playable storm.
    // Keep the central spawn area open and offer cover in every direction.
    var cx=WORLD_W/2,cy=WORLD_H/2;
    var spots=[];
    for(var a=0;a<12;a++){
      var theta=a*Math.PI*2/12+.15,radius=a%3===0?1190:a%3===1?850:1450;
      spots.push([Math.round(cx+Math.cos(theta)*radius),Math.round(cy+Math.sin(theta)*radius)]);
    }
    // Inner cover creates tactical choices without closing the middle.
    [[-410,-290],[390,-340],[-430,330],[440,290]].forEach(function(v){spots.push([cx+v[0],cy+v[1]]);});
    spots.forEach(function(c,i){
      // One or two large camp bushes per cover area; every bush is enterable.
      var count=i%3===0?2:1;
      for(var j=0;j<count;j++){
        var x=c[0]+(j?145:0),y=c[1]+(j?-80:0);
        obstacles.push({x:x,y:y,w:155,h:128,bush:true,kind:"bush"});
      }
      // Nearby solid cover gives the location a reason to exist.
      obstacles.push({x:c[0]-115,y:c[1]+155,w:96,h:65,bush:false,kind:"rock"});
      if(i%2===0)obstacles.push({x:c[0]+175,y:c[1]+90,w:100,h:64,bush:false,kind:"wall"});
    });
    // Sparse small cover, no random decorative bushes.
    [[-740,120],[-1300,350],[950,-480],[180,-980],[-200,1040],[1120,690]].forEach(function(c,i){c=[cx+c[0],cy+c[1]];
      obstacles.push({x:c[0],y:c[1],w:i%2?88:115,h:i%2?66:80,bush:false,kind:i%2?"wall":"rock"});
    });
  }
  // All actual bushes are hiding places; the exact same bush determines shared vision.
  function bushAt(p){
    for(var i=0;i<obstacles.length;i++){
      var o=obstacles[i];if(o.kind!=="bush")continue;
      var dx=(p.x-o.x-o.w*.5)/(o.w*.5-12),dy=(p.y-o.y-o.h*.5)/(o.h*.5-12);
      if(dx*dx+dy*dy<1)return o;
    }
    return null;
  }
  function inBush(p){return !!bushAt(p);}
  function canSee(observer,target){
    var cover=bushAt(target);
    return !cover||bushAt(observer)===cover||Math.hypot(observer.x-target.x,observer.y-target.y)<65||(target.revealed||0)>0;
  }
  function obstacleHit(o,x,y,pad){
    if(o.kind==="bush")return false;
    pad=pad||0;
    if(o.kind==="wall")return x>o.x-pad&&x<o.x+o.w+pad&&y>o.y-pad&&y<o.y+o.h+pad;
    var rx=o.w*.5+pad,ry=o.h*.5+pad,dx=(x-(o.x+o.w*.5))/rx,dy=(y-(o.y+o.h*.5))/ry;
    return dx*dx+dy*dy<1;
  }
  function freeSpot(away){
    var p,limit=Math.max(120,zone.r-145);
    for(var i=0;i<1800;i++){
      p={x:rand(130,WORLD_W-130),y:rand(130,WORLD_H-130)};
      var inside=Math.hypot(p.x-zone.x,p.y-zone.y)<limit;
      var clear=!obstacles.some(function(o){return obstacleHit(o,p.x,p.y,62);});
      var spaced=players.every(function(q){return !q.alive||Math.hypot(p.x-q.x,p.y-q.y)>360;});
      if(inside&&clear&&spaced&&(!away||Math.hypot(p.x-away.x,p.y-away.y)>520))return p;
    }
    // Deterministic safe fallback near the centre if the random search is unusually unlucky.
    for(var a=0;a<32;a++){
      var angle=a*Math.PI*2/32,radius=180+(a%4)*55;
      p={x:zone.x+Math.cos(angle)*radius,y:zone.y+Math.sin(angle)*radius};
      if(!obstacles.some(function(o){return obstacleHit(o,p.x,p.y,62);})&&players.every(function(q){return !q.alive||Math.hypot(p.x-q.x,p.y-q.y)>250;}))return p;
    }
    return {x:zone.x,y:zone.y};
  }
  function spawn(i,isHuman){
    var f=foods[i],p=freeSpot(isHuman?null:me);
    return {x:p.x,y:p.y,r:19,hitRx:24,hitRy:23,hp:isHuman?f.hp:Math.round(f.hp*1.35),maxHp:isHuman?f.hp:Math.round(f.hp*1.35),fighter:i,color:f.color,name:isHuman?"Dig":f.name,bot:!isHuman,human:!!isHuman,alive:true,angle:rand(0,Math.PI*2),cool:rand(0,.6),speed:f.speed,damage:isHuman?f.damage:f.damage*.85,rate:isHuman?f.rate:f.rate*1.25,spread:f.spread,count:f.count,range:f.range,ai:rand(.4,1.2),target:null,kills:0,walkPhase:rand(0,6.28),recoil:0,hurt:0,siphonFlash:0};
  }
  function startGame(which){net=null;spectateTarget=null;if(spectateBar)spectateBar.hidden=true;
    audioReady();countdownLeft=3;countdownStep=0;countdownGoHold=.7;countdownStartAt=performance.now();countdownOverlay.hidden=false;countdownOverlay.classList.remove("arena-countdown-go");countdownOverlay.querySelector(".arena-countdown-bottom").textContent=which==="practice"?"TRÆNING":"SOLO SHOWDOWN";countdownTick();victoryBanner.hidden=true;victoryBanner.classList.remove("arena-victory-play");mode=which; players=[];bullets=[];particles=[];effects=[];screenShake=0;floatingTexts=[];killFeed=[];elapsed=0;winner=null;gameOver=false;superPressed=false;
    makeMap(); zone={x:WORLD_W/2,y:WORLD_H/2,r:1780};stormStage=0;stormTime=0;stormStart=null;stormTarget=null; me=spawn(selected,true);me.dash=0;me.dashCooldown=0;players.push(me);
    for(var i=0;i<9;i++){
      var f=Math.floor(Math.random()*foods.length),p=freeSpot(me);
      var food=foods[f],botHp=Math.round(food.hp*1.35);players.push({x:p.x,y:p.y,r:19,hitRx:24,hitRy:23,hp:botHp,maxHp:botHp,fighter:f,color:food.color,name:food.name,bot:true,human:false,alive:true,angle:rand(0,Math.PI*2),cool:rand(.4,1.2),speed:food.speed,damage:food.damage*.85,rate:food.rate*1.25,spread:food.spread,count:food.count,range:food.range,ai:rand(.8,1.8),target:null,kills:0,walkPhase:rand(0,6.28),recoil:0,hurt:0,siphonFlash:0});
    }
    root.querySelector("#arenaMenu").hidden=true;root.querySelector("#arenaHud").hidden=false;
    root.querySelector("#arenaCanvasWrap").classList.add("playing");setCanvasSize();
    root.querySelector("#arenaResult").hidden=true;
    root.querySelector("#arenaTouch").hidden=!isTouch();
    root.querySelector("#arenaModeLabel").textContent=which==="showdown"?"SOLO SHOWDOWN":"TRÆNING";
    root.querySelector("#arenaHint").textContent=isTouch()?"Venstre: bevæg · Højre: sigt/skyd · SUPER: evne":"WASD: bevæg · Mus: sigt · Klik: skyd · E: super · Shift: dash";
    running=true;last=performance.now();cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);
  }
  function isTouch(){return window.matchMedia("(pointer: coarse)").matches||navigator.maxTouchPoints>0;}
  var effects=[],screenShake=0;
  function burst(x,y,color,count,power){
    for(var i=0;i<count;i++){var a=i*Math.PI*2/count+rand(-.2,.2),speed=rand(power*.35,power);
      particles.push({x:x,y:y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:rand(.2,.48),color:color,r:rand(2,5)});
    }
    if(particles.length>260)particles.splice(0,particles.length-260);
  }
  function ring(x,y,color,radius){effects.push({x:x,y:y,color:color,life:.42,max:.42,r:radius});if(effects.length>35)effects.shift();}
  function superProjectile(p,a,speed,damage,range,r,color,trail){
    bullets.push({x:p.x+Math.cos(a)*29,y:p.y+Math.sin(a)*29,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,owner:p,damage:damage,life:range/speed,r:r,color:color,superTrail:trail||color});
  }
  function useSuper(p){
    if(!p||!p.alive||(p.superCharge||0)<100)return false;
    p.superCharge=0;p.superFlash=1.05;p.revealed=1.5;
    if(p===me){sound("super");screenShake=Math.max(screenShake,12);}
    ring(p.x,p.y,"#ffffff",115);ring(p.x,p.y,"#ffe27b",85);burst(p.x,p.y,"#ffe27b",34,230);
    if(p.fighter===0){
      // GOLDEN PANCAKE STORM: dense, staggered golden fan with a heavy center beam.
      for(var i=-7;i<=7;i++)superProjectile(p,p.angle+i*.087,650,17,550,7,i%2?"#ffd64f":"#fff5a8","#ffdf60");
      superProjectile(p,p.angle,740,38,630,13,"#fff7bc","#ffe46b");
      ring(p.x+Math.cos(p.angle)*100,p.y+Math.sin(p.angle)*100,"#ffdd58",90);
    }else if(p.fighter===1){
      // EMERALD FORTRESS: massive shield plus a short-range defensive shockwave.
      p.shield=125;p.shieldTime=6;
      for(var j=0;j<12;j++){var a=j*Math.PI*2/12;superProjectile(p,a,340,13,170,9,"#8df6ad","#65e6b1");}
      ring(p.x,p.y,"#7bffd7",145);burst(p.x,p.y,"#8bffc0",24,170);
    }else if(p.fighter===2){
      // PASTA TORNADO: two offset radial waves and a close-range core blast.
      for(var k=0;k<24;k++){var a=k*Math.PI*2/24;superProjectile(p,a,440,17,420,7,"#ffb56b","#ff8d59");}
      for(var m=0;m<16;m++){var a=m*Math.PI*2/16+Math.PI/16;superProjectile(p,a,310,12,310,8,"#fff1a5","#ffbd70");}
      ring(p.x,p.y,"#ff9b56",165);
    }else{
      // CRUNCH CANNON: massive central shot with a focused five-shot spread.
      for(var n=-3;n<=3;n++)superProjectile(p,p.angle+n*.095,590,n===0?48:28,550,n===0?16:10,"#ffe1a0","#ffba52");
      ring(p.x+Math.cos(p.angle)*110,p.y+Math.sin(p.angle)*110,"#fff1a6",105);
    }
    floatingTexts.push({x:p.x,y:p.y-70,text:["PANDEKAGE STORM!","GRØNT SKJOLD!","PASTA TORNADO!","CRUNCH CANNON!"][p.fighter],color:"#fff0a6",life:1.2,max:1.2});
    return true;
  }
  function applyDamage(target,amount,attacker){
    if(!target.alive)return;
    target.healWait=5;
    var shielded=Math.min(target.shield||0,amount);
    target.shield=Math.max(0,(target.shield||0)-shielded);
    var damage=amount-shielded;
    target.hp=Math.max(0,target.hp-damage);
    target.hurt=.22;target.hitKick=.18;if(damage>0){burst(target.x,target.y,attacker?attacker.color:"#ff94ac",Math.min(10,Math.max(3,Math.ceil(damage/4))),105);ring(target.x,target.y,"#fff5ca",28);if(target===me)screenShake=Math.max(screenShake,6);else if(attacker===me)screenShake=Math.max(screenShake,2.5);}
    if(attacker&&attacker!==target&&damage>0)attacker.superCharge=Math.min(100,(attacker.superCharge||0)+Math.max(6,damage*.85));
  }
  function ammoCapacity(p){return [6,3,4,4][p.fighter]||3;}
  function ammoReload(p){return [.52,1.05,.85,.78][p.fighter]||1;}
  function shoot(p,angle,target){
    var f=foods[p.fighter]; if(p.cool>0||!p.alive)return;
    if(p.ammo===undefined)p.ammo=ammoCapacity(p);
    if(p.ammo<=0)return;
    p.ammo--;
    p.cool=p.rate;p.recoil=.16;p.muzzleFlash=.11;p.revealed=1.1;if(p===me)sound("shot");
    for(var i=0;i<p.count;i++){
      var a=angle+(i-(p.count-1)/2)*p.spread;
      bullets.push({x:p.x+Math.cos(a)*22,y:p.y+Math.sin(a)*22,vx:Math.cos(a)*470,vy:Math.sin(a)*470,owner:p,target:target||null,damage:p.damage,life:p.range/470,r: p.fighter===2?5:6,color:p.color});
    }
    ring(p.x+Math.cos(angle)*45,p.y+Math.sin(angle)*45,p.color,17);
    for(var j=0;j<7;j++){var flashAngle=angle+rand(-.9,.9),flashSpeed=rand(45,125);particles.push({x:p.x+Math.cos(angle)*24,y:p.y+Math.sin(angle)*24,vx:Math.cos(flashAngle)*flashSpeed,vy:Math.sin(flashAngle)*flashSpeed,life:rand(.12,.24),color:j%2?"#fff0ad":p.color,r:rand(2,4)});}
  }
  function clearShot(a,b){
    var dx=b.x-a.x,dy=b.y-a.y,steps=Math.max(4,Math.ceil(Math.hypot(dx,dy)/18));
    for(var i=1;i<steps;i++){
      var x=a.x+dx*i/steps,y=a.y+dy*i/steps;
      for(var j=0;j<obstacles.length;j++){var o=obstacles[j];if(obstacleHit(o,x,y,5))return false;}
    }
    return true;
  }
  function nearest(p,visibleOnly){
    var best=null,bestScore=Infinity;
    players.forEach(function(q){
      if(q===p||!q.alive)return;
      var d=dist(p,q);
      if(visibleOnly&&!clearShot(p,q))return;
      var score=d*(.78+.22*(q.hp/q.maxHp));
      if(q===p.target)score*=.88;
      if(score<bestScore){bestScore=score;best=q;}
    });
    return best;
  }
  function movePlayer(p,dx,dy,dt,multiplier){
    var len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len;}
    var boost=multiplier||1;
    var nx=p.human?p.x+dx*p.speed*boost*dt:clamp(p.x+dx*p.speed*boost*dt,p.r,WORLD_W-p.r);
    var ny=p.human?p.y+dy*p.speed*boost*dt:clamp(p.y+dy*p.speed*boost*dt,p.r,WORLD_H-p.r);
    var hit=obstacles.some(function(o){return obstacleHit(o,nx,ny,p.r);});
    if(!hit){p.x=nx;p.y=ny;}else{
      if(!obstacles.some(function(o){return obstacleHit(o,nx,p.y,p.r);}))p.x=nx;
      if(!obstacles.some(function(o){return obstacleHit(o,p.x,ny,p.r);}))p.y=ny;
    }
  }
  // Each round has a pause and a smooth pull. The final rounds MOVE instead of closing to zero.
  var stormRounds=[
    {wait:7,move:13,r:1350,shift:170},
    {wait:6,move:12,r:970,shift:220},
    {wait:5,move:11,r:690,shift:220},
    {wait:5,move:10,r:470,shift:180},
    {wait:4,move:10,r:430,shift:270},
    {wait:4,move:9,r:430,shift:290},
    {wait:4,move:9,r:430,shift:300}
  ];
  function nextStormTarget(round){
    var angle=rand(0,Math.PI*2),d=round.shift;
    return {x:clamp(zone.x+Math.cos(angle)*d,round.r+35,WORLD_W-round.r-35),
            y:clamp(zone.y+Math.sin(angle)*d,round.r+35,WORLD_H-round.r-35),r:round.r};
  }
  function updateStorm(dt){
    var round=stormRounds[Math.min(stormStage,stormRounds.length-1)];
    stormTime+=dt;
    // Lock in the next safe circle at the beginning of the waiting phase.
    if(!stormStart){stormStart={x:zone.x,y:zone.y,r:zone.r};stormTarget=nextStormTarget(round);}
    if(stormTime<=round.wait)return;
    var t=clamp((stormTime-round.wait)/round.move,0,1);
    var eased=t*t*(3-2*t);
    zone.x=stormStart.x+(stormTarget.x-stormStart.x)*eased;
    zone.y=stormStart.y+(stormTarget.y-stormStart.y)*eased;
    zone.r=stormStart.r+(stormTarget.r-stormStart.r)*eased;
    if(t>=1){stormStage=Math.min(stormStage+1,stormRounds.length-1);stormTime=0;stormStart=null;stormTarget=null;}
  }
  function update(dt){
    elapsed+=dt;
    screenShake=Math.max(0,screenShake-dt*38);
    effects=effects.filter(function(e){e.life-=dt;return e.life>0;});
    updateStorm(dt);
    players.forEach(function(p){
      if(!p.alive)return;
      p.superCharge=p.superCharge||0;
      var capacity=ammoCapacity(p),reload=ammoReload(p);
      if(p.ammo===undefined)p.ammo=capacity;
      if(p.ammo<capacity){
        p.reloadClock=(p.reloadClock||0)+dt;
        while(p.reloadClock>=reload&&p.ammo<capacity){p.ammo++;p.reloadClock-=reload;}
      }else p.reloadClock=0;
      p.muzzleFlash=Math.max(0,(p.muzzleFlash||0)-dt);
      p.hitKick=Math.max(0,(p.hitKick||0)-dt);
      p.healWait=Math.max(0,(p.healWait||0)-dt);
      p.superFlash=Math.max(0,(p.superFlash||0)-dt);
      p.shieldTime=Math.max(0,(p.shieldTime||0)-dt);
      if(p.shieldTime===0)p.shield=0;
      if(p.healWait===0&&p.hp<p.maxHp&&Math.hypot(p.x-zone.x,p.y-zone.y)<zone.r){
        p.hp=Math.min(p.maxHp,p.hp+p.maxHp*.075*dt);
      }
      p.revealed=Math.max(0,(p.revealed||0)-dt);p.cool=Math.max(0,p.cool-dt);p.recoil=Math.max(0,(p.recoil||0)-dt);p.hurt=Math.max(0,(p.hurt||0)-dt);p.siphonFlash=Math.max(0,(p.siphonFlash||0)-dt);if(p.walking)p.walkPhase=(p.walkPhase||0)+dt*10;else p.walkPhase=(p.walkPhase||0)+dt*2.1;
      if(Math.hypot(p.x-zone.x,p.y-zone.y)>zone.r){applyDamage(p,19*dt,null);if(p.hp<=0){p.alive=false;addKillFeed(null,p);if(p===me&&!net){finish(false);}}}
      if(net&&net.host&&p!==me){
        var cmd=performance.now()-(netInputAt[p.netId]||0)<1200?(netInputs[p.netId]||{}):{};
        p.dash=Math.max(0,(p.dash||0)-dt);p.dashCooldown=Math.max(0,(p.dashCooldown||0)-dt);
        if(cmd.dash&&p.dashCooldown<=0){p.dash=.24;p.dashCooldown=1.65;}
        if(Number.isFinite(cmd.angle))p.angle=cmd.angle;
        p.walking=Math.hypot(cmd.dx||0,cmd.dy||0)>.08;
        movePlayer(p,cmd.dx||0,cmd.dy||0,dt,p.dash>0?2.9:1);
        if(cmd.fire)shoot(p,p.angle);
        if(cmd.super){useSuper(p);cmd.super=false;}
      }else if(p.human){
        if(superPressed){useSuper(p);superPressed=false;}
        p.dash=Math.max(0,(p.dash||0)-dt);p.dashCooldown=Math.max(0,(p.dashCooldown||0)-dt);
        if(touchDash&&p.dashCooldown<=0){p.dash=.24;p.dashCooldown=1.65;}
        var dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
        var dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);
        if(isTouch()){dx=touchMove.x;dy=touchMove.y;}
        p.walking=Math.hypot(dx,dy)>.08;
        if(p.dash>0){if(Math.random()<.65){particles.push({x:p.x+rand(-8,8),y:p.y+rand(-8,8),vx:rand(-25,25),vy:rand(-25,25),life:.3,color:"#ffe39b",r:rand(4,8)});}if(Math.hypot(dx,dy)<.1){dx=Math.cos(p.angle);dy=Math.sin(p.angle);}movePlayer(p,dx,dy,dt,2.9);if(Math.random()<.8)particles.push({x:p.x,y:p.y,vx:rand(-35,35),vy:rand(-35,35),life:.28,color:"#fff0a8"});}else movePlayer(p,dx,dy,dt);
        if(isTouch()){
          if(touchAim.active){
            var rawAngle=Math.atan2(touchAim.y,touchAim.x);
            // Gentle aim assist: only nearby visible targets inside a narrow cone.
            var best=null,bestScore=.31;
            for(var ai=0;ai<players.length;ai++){
              var enemy=players[ai];if(enemy===p||!enemy.alive||!canSee(p,enemy))continue;
              var dd=dist(p,enemy);if(dd>p.range+35)continue;
              var ang=Math.atan2(enemy.y-p.y,enemy.x-p.x);
              var delta=Math.abs(Math.atan2(Math.sin(ang-rawAngle),Math.cos(ang-rawAngle)));
              var score=delta+dd/Math.max(1,p.range)*.11;
              if(score<bestScore&&clearShot(p,enemy)){best=ang;bestScore=score;}
            }
            p.angle=best===null?rawAngle:rawAngle+Math.atan2(Math.sin(best-rawAngle),Math.cos(best-rawAngle))*.65;
          }
          if(touchAim.active||touchFire)shoot(p,p.angle);
        }else{
          p.angle=Math.atan2(pointer.y/ZOOM+camera.y-p.y,pointer.x/ZOOM+camera.x-p.x);
          if(pointer.down||keys[" "])shoot(p,p.angle);
        }
      }else{
        p.walking=false;
        p.ai-=dt;
        if(p.ai<=0){p.target=nearest(p,true)||nearest(p,false);if(p.target&&!canSee(p,p.target))p.target=null;p.ai=rand(.32,.62);}
        var t=p.target&&p.target.alive&&canSee(p,p.target)?p.target:nearest(p,true)||nearest(p,false);if(t&&!canSee(p,t))t=null;
        if(t){
          var a=Math.atan2(t.y-p.y,t.x-p.x),d=dist(p,t),visible=clearShot(p,t);p.angle=a;
          var strafe=Math.sin(elapsed*1.8+p.x*.018)*.62;
          var mx=0,my=0;
          bullets.forEach(function(b){if(b.owner===p||!b.owner.alive)return;var bx=p.x-b.x,by=p.y-b.y,bd=Math.hypot(bx,by);var closing=b.vx*bx+b.vy*by<0;if(bd<125&&closing){mx+=bx/Math.max(1,bd)*1.25;my+=by/Math.max(1,bd)*1.25;}});
          if(Math.hypot(p.x-zone.x,p.y-zone.y)>zone.r-145){var za=Math.atan2(zone.y-p.y,zone.x-p.x);mx=Math.cos(za)*1.6;my=Math.sin(za)*1.6;}
          else if(p.hp<p.maxHp*.38&&d<370){mx=-Math.cos(a)*1.4;my=-Math.sin(a)*1.4;}
          else if(d>285){mx=Math.cos(a);my=Math.sin(a);}else if(d<205){mx=-Math.cos(a);my=-Math.sin(a);}
          if(!visible){var side=(Math.sin(elapsed+p.y*.01)>0?1:-1);mx+=-Math.sin(a)*side*.85;my+=Math.cos(a)*side*.85;}
          else {mx-=Math.sin(a)*strafe;my+=Math.cos(a)*strafe;}
          p.walking=Math.hypot(mx,my)>.08;
          movePlayer(p,mx,my,dt);
          if(visible&&d<p.range*.9&&Math.random()<.34)shoot(p,a+rand(-.045,.045),t);
        }else{
          // Without a visible opponent, stay inside the safe zone and reposition toward cover.
          var safe=Math.hypot(p.x-zone.x,p.y-zone.y)>zone.r-180;
          var cover=obstacles.filter(function(o){return o.kind==="bush"&&Math.hypot(o.x+o.w/2-zone.x,o.y+o.h/2-zone.y)<zone.r-80;})
            .sort(function(a,b){return Math.hypot(a.x+a.w/2-p.x,a.y+a.h/2-p.y)-Math.hypot(b.x+b.w/2-p.x,b.y+b.h/2-p.y);})[0];
          var tx=safe?zone.x:cover?cover.x+cover.w/2:zone.x,ty=safe?zone.y:cover?cover.y+cover.h/2:zone.y;
          if(Math.hypot(tx-p.x,ty-p.y)>55){var aa=Math.atan2(ty-p.y,tx-p.x);movePlayer(p,Math.cos(aa),Math.sin(aa),dt);p.walking=true;}
        }
      }
    });
    bullets=bullets.filter(function(b){
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
      if(b.superTrail&&Math.random()<.45){particles.push({x:b.x,y:b.y,vx:rand(-35,35),vy:rand(-35,35),life:rand(.12,.25),color:b.superTrail,r:rand(2,5)});if(particles.length>260)particles.splice(0,particles.length-260);}
      var wall=obstacles.some(function(o){return obstacleHit(o,b.x,b.y,b.r);});
      if(b.life<=0||b.x<0||b.x>WORLD_W||b.y<0||b.y>WORLD_H||wall)return false;
      var hit=null;
      for(var i=0;i<players.length;i++){var p=players[i];if(p.alive&&p!==b.owner){var rx=(p.hitRx||p.r)+b.r,ry=(p.hitRy||p.r)+b.r,dx=(b.x-p.x)/rx,dy=(b.y-p.y)/ry;if(dx*dx+dy*dy<=1){hit=p;break;}}}
      if(hit){applyDamage(hit,b.damage,b.owner);if(b.owner===me)sound("hit");if(hit.hp<=0){hit.hp=0;hit.alive=false;b.owner.kills++;addKillFeed(b.owner,hit);var heal=Math.min(b.owner.maxHp-b.owner.hp,Math.ceil(b.owner.maxHp*.75));if(heal>0){b.owner.hp+=heal;b.owner.siphonFlash=.7;floatingTexts.push({x:b.owner.x,y:b.owner.y-48,text:"+"+heal+" LIV",color:"#7dff91",life:1.05,max:1.05});for(var h=0;h<16;h++){var ha=Math.PI*2*h/16;particles.push({x:b.owner.x,y:b.owner.y,vx:Math.cos(ha)*rand(65,145),vy:Math.sin(ha)*rand(65,145),life:rand(.35,.7),color:"#73f58b",r:rand(2,5)});}}floatingTexts.push({x:hit.x,y:hit.y-35,text:"ELIMINERET!",color:"#ffe39a",life:1.65,max:1.65});if(b.owner===me){sound("kill");stats.eliminations++;saveStats();}for(var k=0;k<24;k++)particles.push({x:hit.x,y:hit.y,vx:rand(-175,175),vy:rand(-175,175),life:rand(.3,.8),color:[hit.color,"#fff0b0","#ffffff"][k%3],r:rand(2,6)});}return false;}
      return true;
    });
    killFeed=killFeed.filter(function(entry){entry.life-=dt;return entry.life>0;});particles=particles.filter(function(p){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.08,dt);p.vy*=Math.pow(.08,dt);p.life-=dt;return p.life>0;});floatingTexts=floatingTexts.filter(function(t){t.y-=34*dt;t.life-=dt;return t.life>0;});
    var alive=players.filter(function(p){return p.alive;});
    root.querySelector("#arenaAlive").textContent=alive.length;
    root.querySelector("#arenaKills").textContent=me.kills;
    root.querySelector("#arenaClock").textContent=Math.floor(elapsed/60)+":"+String(Math.floor(elapsed%60)).padStart(2,"0");
    if((!net&&!me.alive)||alive.length===1){
      finish(me.alive&&alive.length===1);
    }
  }
  // Online spectators keep receiving snapshots, but can no longer control a fighter.
  function livingSpectateTargets(){return players.filter(function(p){return p.alive&&p!==me;});}
  function updateSpectator(){
    if(!net||!me||me.alive||gameOver){if(spectateBar)spectateBar.hidden=true;return;}
    var living=livingSpectateTargets();
    if(!living.length){if(spectateBar)spectateBar.hidden=true;return;}
    if(!spectateTarget||!spectateTarget.alive||spectateTarget===me)spectateTarget=living[0];
    if(!spectateBar){
      spectateBar=document.createElement("div");
      spectateBar.style.cssText="position:absolute;left:50%;top:18px;transform:translateX(-50%);z-index:12;background:rgba(16,33,28,.93);color:white;padding:10px 14px;border-radius:14px;display:flex;align-items:center;gap:12px;font:700 14px system-ui;box-shadow:0 4px 20px #0005;max-width:95%;";
      var prev=document.createElement("button"),next=document.createElement("button");
      prev.type=next.type="button";prev.textContent="◀";next.textContent="▶";
      [prev,next].forEach(function(b){b.style.cssText="cursor:pointer;background:#345b49;border:1px solid #9cd6b1;border-radius:8px;color:white;padding:8px 12px";});
      spectateName=document.createElement("span");
      spectateBar.append(prev,spectateName,next);
      prev.addEventListener("click",function(){cycleSpectator(-1);});
      next.addEventListener("click",function(){cycleSpectator(1);});
      root.querySelector("#arenaCanvasWrap").appendChild(spectateBar);
    }
    spectateBar.hidden=false;
    spectateName.textContent="👁 SER PÅ: "+String(spectateTarget.name||"Spiller");
    root.querySelector("#arenaHint").textContent="Du er slået ud – du ser nu de overlevende spillere.";
    root.querySelector("#arenaTouch").hidden=true;
  }
  function cycleSpectator(direction){
    var living=livingSpectateTargets();if(!living.length)return;
    var index=living.indexOf(spectateTarget);
    spectateTarget=living[(index+direction+living.length)%living.length];
    updateSpectator();
  }
  function finish(won){
    if(gameOver)return;gameOver=true;running=false;cancelAnimationFrame(raf);if(spectateBar)spectateBar.hidden=true;
    if(net&&net.host)sendNetSnapshot(true);
    if(net)root.querySelector("#arenaRestart").hidden=true;
    stats.games++;if(won){stats.wins++;stats.trophies+=8;}else stats.trophies=Math.max(0,stats.trophies-1);
    stats.trophies+=me.kills*2;saveStats();
    root.querySelector("#arenaResultTitle").textContent=won?"DU VANDT! 🏆":"DU BLEV SLÅET UD!";
    root.querySelector("#arenaResultText").textContent=net?"Onlinekampen er slut. Gå til menuen for at spille igen.":won?"Fantastisk! Du er den sidste tilbage.":"God kamp! Prøv igen, og se om du kan blive den sidste.";
    root.querySelector("#arenaResultStats").textContent=me.kills+" elimineringer · "+stats.trophies+" trofæer i alt";
    root.querySelector("#arenaResult").hidden=false;root.querySelector("#arenaTouch").hidden=true;countdownOverlay.hidden=true;
    if(won){burst(me.x,me.y,"#ffe37a",42,240);ring(me.x,me.y,"#ffffff",120);}
    victoryBanner.hidden=!won;if(won){sound("win");victoryBanner.classList.remove("arena-victory-play");void victoryBanner.offsetWidth;victoryBanner.classList.add("arena-victory-play");}
  }
  function drawFoodHero(p,now){
    var f=foods[p.fighter],phase=p.walkPhase||now*.006+p.x*.013,step=(p.walking?Math.sin(phase):Math.sin(phase*.22)*.07),bob=p.walking?Math.abs(step)*2.8:Math.sin(phase*.22)*1.35,breath=1+Math.sin(phase*.22)*.025,lean=p.walking?Math.cos(phase)*.055:Math.sin(phase*.22)*.012;
    var faceX=Math.cos(p.angle),faceY=Math.sin(p.angle),dark="#4b3024";
    // Eye tracking is subtle, while the body keeps its own readable silhouette.
    var eyeShift=clamp(faceX*2.2,-2.2,2.2),stride=clamp(step,-1,1);
    ctx.save();ctx.translate(p.x-Math.cos(p.angle)*(p.recoil||0)*17-Math.cos(p.angle)*(p.hitKick||0)*25,p.y-bob-Math.sin(p.angle)*(p.recoil||0)*17-Math.sin(p.angle)*(p.hitKick||0)*25);ctx.rotate(lean);ctx.scale(1.12,1.12*breath);
    // Ground shadow, chunky boots and gloves create a toy-hero silhouette.
    ctx.fillStyle="rgba(25,39,27,.28)";ctx.beginPath();ctx.ellipse(0,34,30,10,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="rgba(255,255,255,.13)";ctx.beginPath();ctx.ellipse(-4,32,17,4,-.12,0,Math.PI*2);ctx.fill();
    ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#493326";ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(-11,12);ctx.lineTo(-14+step*5,23);ctx.lineTo(-16+step*9,34);ctx.moveTo(11,12);ctx.lineTo(14-step*5,23);ctx.lineTo(16-step*9,34);ctx.stroke();ctx.strokeStyle="#b78a60";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-14+step*5,23);ctx.lineTo(-16+step*9,31);ctx.moveTo(14-step*5,23);ctx.lineTo(16-step*9,31);ctx.stroke();ctx.fillStyle="#d3b083";ctx.beginPath();ctx.arc(-14+step*5,23,4,0,Math.PI*2);ctx.arc(14-step*5,23,4,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#38271f";ctx.beginPath();ctx.ellipse(-17+step*9,36,11,6,-.15,0,Math.PI*2);ctx.ellipse(17-step*9,36,11,6,.15,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="rgba(255,255,255,.3)";ctx.beginPath();ctx.ellipse(-20+step*9,34,5,1.6,-.15,0,Math.PI*2);ctx.ellipse(13-step*9,34,5,1.6,.15,0,Math.PI*2);ctx.fill();
    // Backpack and swinging arms.
    ctx.fillStyle="#68472e";ctx.beginPath();ctx.roundRect(-25,-9,12,22,5);ctx.fill();
    ctx.strokeStyle="#4b3326";ctx.lineWidth=14;ctx.beginPath();ctx.moveTo(-19,-7);ctx.lineTo(-30,-1+step*3);ctx.lineTo(-34-step*4,12+step*5);ctx.stroke();
    ctx.strokeStyle=f.color;ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(-19,-7);ctx.lineTo(-30,-1+step*3);ctx.stroke();
    ctx.strokeStyle="#d6a373";ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(-30,-1+step*3);ctx.lineTo(-34-step*4,12+step*5);ctx.stroke();
    ctx.fillStyle="#f0c18b";ctx.strokeStyle="#70472e";ctx.lineWidth=2;ctx.beginPath();ctx.arc(-34-step*4,12+step*5,7,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle="rgba(32,40,30,.22)";ctx.beginPath();ctx.roundRect(-20,-13,41,37,13);ctx.fill();
    ctx.strokeStyle="rgba(60,43,29,.7)";ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(-22,-22,44,43,13);ctx.stroke();
    // Each fighter has a recognisable food-shaped body, not a generic blob.
    if(p.fighter===0){
      // Bananpandekage: a tall stack of golden pancakes with butter and syrup.
      ctx.fillStyle="#92521f";ctx.beginPath();ctx.ellipse(0,8,25,15,0,0,Math.PI*2);ctx.fill();
      for(var k=0;k<3;k++){var yy=5-k*9;ctx.fillStyle=k===2?"#f5ce70":"#e6a844";ctx.beginPath();ctx.ellipse(0,yy,25-k*1.5,10,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#a9682e";ctx.lineWidth=2;ctx.stroke();}
      ctx.fillStyle="#fff0b0";ctx.beginPath();ctx.roundRect(-7,-25,14,8,3);ctx.fill();
      ctx.fillStyle="#f9df93";ctx.beginPath();ctx.ellipse(-8,-12,10,3,-.3,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#e7a52d";ctx.beginPath();ctx.moveTo(11,-18);ctx.quadraticCurveTo(19,-10,15,-3);ctx.quadraticCurveTo(11,1,13,5);ctx.lineTo(8,5);ctx.quadraticCurveTo(6,-3,11,-8);ctx.closePath();ctx.fill();
      ctx.fillStyle="#b96c2d";ctx.beginPath();ctx.arc(-14,7,3,0,Math.PI*2);ctx.arc(14,7,3,0,Math.PI*2);ctx.fill();
    }else if(p.fighter===1){
      // Grøntsagswrap: toasted tortilla roll, green filling and visible vegetables.
      ctx.save();ctx.rotate(-.22);
      ctx.fillStyle="#9b642e";ctx.beginPath();ctx.roundRect(-23,-23,46,44,17);ctx.fill();
      ctx.fillStyle="#eac47a";ctx.beginPath();ctx.roundRect(-21,-25,42,39,16);ctx.fill();
      ctx.fillStyle="#5e9d48";ctx.beginPath();ctx.ellipse(0,-5,17,13,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#e94f43";ctx.beginPath();ctx.arc(-9,-9,5,0,Math.PI*2);ctx.arc(8,-1,5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#f6df9b";ctx.beginPath();ctx.arc(2,-14,5,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#fff0bf";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-15,-20);ctx.lineTo(15,-20);ctx.stroke();ctx.restore();
      ctx.fillStyle="#3d793e";ctx.beginPath();ctx.moveTo(-17,-24);ctx.quadraticCurveTo(-31,-37,-25,-40);ctx.quadraticCurveTo(-10,-37,-9,-23);ctx.fill();
    }else if(p.fighter===2){
      // Pastasalat: a colourful bowl overflowing with pasta spirals and vegetables.
      ctx.fillStyle="#9b542d";ctx.beginPath();ctx.ellipse(0,5,27,20,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#f2d49a";ctx.beginPath();ctx.ellipse(0,1,25,18,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#d9893d";ctx.beginPath();ctx.ellipse(-8,-5,9,5,-.5,0,Math.PI*2);ctx.ellipse(8,-8,9,5,.55,0,Math.PI*2);ctx.ellipse(1,5,9,5,-.3,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#f8e4b7";ctx.lineWidth=3;ctx.beginPath();ctx.arc(-8,-5,5,0,Math.PI*1.7);ctx.arc(8,-8,5,0,Math.PI*1.7);ctx.stroke();
      ctx.fillStyle="#e34e3f";ctx.beginPath();ctx.arc(-16,3,4,0,Math.PI*2);ctx.arc(13,4,4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#4f9b4d";ctx.beginPath();ctx.arc(0,-14,5,0,Math.PI*2);ctx.arc(18,-13,4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#fff1c9";ctx.fillRect(-18,17,36,4);
      ctx.strokeStyle="#a45a35";ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,7,24,.1,Math.PI-.1);ctx.stroke();
    }else{
      // Hjemmelavede croutoner: a crisp golden bread cube with crust and seasoning.
      ctx.fillStyle="#814b27";ctx.beginPath();ctx.roundRect(-23,-22,46,43,9);ctx.fill();
      ctx.fillStyle="#d79a4d";ctx.beginPath();ctx.roundRect(-20,-26,40,40,8);ctx.fill();
      ctx.fillStyle="#f3c879";ctx.beginPath();ctx.moveTo(-15,-20);ctx.lineTo(8,-23);ctx.lineTo(17,-14);ctx.lineTo(14,9);ctx.lineTo(-13,13);ctx.closePath();ctx.fill();
      ctx.strokeStyle="#a96631";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-15,-18);ctx.lineTo(-8,-11);ctx.lineTo(-13,-2);ctx.moveTo(10,-20);ctx.lineTo(5,-9);ctx.lineTo(15,-3);ctx.stroke();
      ctx.fillStyle="#4f8d43";ctx.beginPath();ctx.arc(-9,-15,2,0,Math.PI*2);ctx.arc(10,4,2,0,Math.PI*2);ctx.arc(3,-18,2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="rgba(255,244,204,.4)";ctx.beginPath();ctx.moveTo(-13,-17);ctx.lineTo(3,-19);ctx.lineTo(-9,-12);ctx.closePath();ctx.fill();
    }
    // Clothing seams, buttons and expressive cheek highlights.
    ctx.fillStyle="rgba(255,255,255,.28)";ctx.beginPath();ctx.arc(-17,3,3.5,0,Math.PI*2);ctx.arc(17,3,3.5,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="rgba(85,53,32,.5)";ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(-18,14);ctx.quadraticCurveTo(0,20,18,14);ctx.stroke();
    // Large expressive eyes, raised brows and a shaded muzzle read at gameplay scale.
    ctx.fillStyle="rgba(60,35,22,.13)";ctx.beginPath();ctx.ellipse(0,8,19,5,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="rgba(255,255,255,.27)";ctx.beginPath();ctx.ellipse(-10,-17,8,3,-.4,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#593d2a";ctx.lineWidth=2.8;ctx.lineCap="round";ctx.beginPath();
    ctx.moveTo(-13,-16);ctx.quadraticCurveTo(-8,-19,-3,-16);ctx.moveTo(3,-16);ctx.quadraticCurveTo(8,-19,13,-16);ctx.stroke();
    ctx.fillStyle="#fffaf0";ctx.strokeStyle="rgba(74,47,29,.55)";ctx.lineWidth=1.6;
    [-8,8].forEach(function(ex){ctx.beginPath();ctx.ellipse(ex,-7,6.2,7.5,0,0,Math.PI*2);ctx.fill();ctx.stroke();});
    ctx.fillStyle="#33271e";[-8,8].forEach(function(ex){ctx.beginPath();ctx.ellipse(ex+eyeShift,-6+faceY,3.1,4.2,0,0,Math.PI*2);ctx.fill();});
    ctx.fillStyle="#fff";[-8,8].forEach(function(ex){ctx.beginPath();ctx.arc(ex+eyeShift-1,-8+faceY,1.35,0,Math.PI*2);ctx.fill();});
    ctx.strokeStyle=dark;ctx.lineWidth=2.6;ctx.beginPath();ctx.arc(0,2,5.5,.1,Math.PI-.1);ctx.stroke();
    ctx.strokeStyle="rgba(255,255,255,.32)";ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(0,-5,22,Math.PI*1.15,Math.PI*1.77);ctx.stroke();
    if(p.hurt>0){ctx.globalAlpha=Math.min(.75,p.hurt*5);ctx.fillStyle="#fff";ctx.beginPath();ctx.ellipse(0,-5,27,30,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
    if(p.siphonFlash>0){ctx.globalAlpha=p.siphonFlash/.7;ctx.strokeStyle="#83ff9a";ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(0,2,31+p.siphonFlash*12,29+p.siphonFlash*12,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    ctx.restore();
  }
  function drawFoodWeapon(p){
    // Weapons sit in front of the fighter and point in the exact direction of its shots.
    // Each silhouette matches the projectile pattern of that food fighter.
    var color=foods[p.fighter].color;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    if(p.muzzleFlash>0){ctx.save();ctx.globalAlpha=p.muzzleFlash/.11;ctx.translate(60,0);ctx.fillStyle="#fff6bb";ctx.shadowColor="#ffcf55";ctx.shadowBlur=18;ctx.beginPath();ctx.moveTo(24,0);ctx.lineTo(-6,-12);ctx.lineTo(-2,-3);ctx.lineTo(-13,0);ctx.lineTo(-2,3);ctx.lineTo(-6,12);ctx.closePath();ctx.fill();ctx.restore();}
    ctx.lineCap="round";ctx.lineJoin="round";
    var kick=clamp((p.recoil||0)/.16,0,1),armX=27-kick*7,armY=kick*4;
    // The upper arm and glove use the same aiming transform as the gun.
    // One connected front arm: shoulder -> sleeve -> forearm -> hand.
    ctx.strokeStyle="rgba(49,35,27,.98)";ctx.lineWidth=16;ctx.beginPath();ctx.moveTo(12,9);ctx.lineTo(18,17);ctx.lineTo(armX,armY);ctx.stroke();
    ctx.strokeStyle=foods[p.fighter].color;ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(12,9);ctx.lineTo(18,17);ctx.stroke();
    ctx.strokeStyle="#d39a69";ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(18,17);ctx.lineTo(armX,armY);ctx.stroke();
    ctx.fillStyle="#f0c18b";ctx.strokeStyle="#70472e";ctx.lineWidth=2;ctx.beginPath();ctx.arc(18,17,6,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.translate(27-kick*7,armY);
    ctx.fillStyle="#493326";ctx.strokeStyle="#30251f";ctx.lineWidth=2.5;
    ctx.beginPath();ctx.roundRect(-12,-7,19,14,4);ctx.fill();ctx.stroke();
    if(p.fighter===0){
      // Pancake repeater: twin syrup barrels for its rapid single shots.
      ctx.fillStyle="#9a5b2c";ctx.beginPath();ctx.roundRect(-1,-10,29,20,6);ctx.fill();ctx.stroke();
      ctx.fillStyle="#f4c765";ctx.beginPath();ctx.roundRect(5,-8,26,6,3);ctx.roundRect(5,2,26,6,3);ctx.fill();
      ctx.fillStyle="#6b3d25";ctx.fillRect(27,-9,5,18);
      ctx.fillStyle="#fff0b0";ctx.beginPath();ctx.arc(12,0,3,0,Math.PI*2);ctx.fill();
    }else if(p.fighter===1){
      // Wrap launcher: a chunky vegetable launcher with a green muzzle.
      ctx.fillStyle="#e7c987";ctx.beginPath();ctx.roundRect(-1,-12,30,24,7);ctx.fill();ctx.stroke();
      ctx.fillStyle="#4f914b";ctx.beginPath();ctx.roundRect(20,-10,13,20,5);ctx.fill();
      ctx.fillStyle="#e64e43";ctx.beginPath();ctx.arc(27,-3,3,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#fff0bd";ctx.fillRect(3,-4,14,8);
    }else if(p.fighter===2){
      // Pasta scatter cannon: a wide five-port muzzle for its five-piece spread.
      ctx.fillStyle="#a85e35";ctx.beginPath();ctx.roundRect(-1,-13,27,26,7);ctx.fill();ctx.stroke();
      ctx.fillStyle="#f4d79e";ctx.beginPath();ctx.roundRect(17,-15,17,30,5);ctx.fill();ctx.stroke();
      ctx.fillStyle="#70432b";
      [-9,-4,0,4,9].forEach(function(y){ctx.beginPath();ctx.arc(30,y,2.1,0,Math.PI*2);ctx.fill();});
      ctx.fillStyle="#e5a14c";ctx.fillRect(3,-7,13,14);
    }else{
      // Crouton double-barrel blaster: two visible bread-gold barrels for paired shots.
      ctx.fillStyle="#8a512b";ctx.beginPath();ctx.roundRect(-1,-12,29,24,6);ctx.fill();ctx.stroke();
      ctx.fillStyle="#e9b665";ctx.beginPath();ctx.roundRect(7,-12,25,8,3);ctx.roundRect(7,4,25,8,3);ctx.fill();
      ctx.fillStyle="#5a3925";ctx.fillRect(27,-13,6,10);ctx.fillRect(27,3,6,10);
      ctx.fillStyle="#fff0bd";ctx.fillRect(3,-3,12,6);
    }
    // Bevel highlights and a darker underside add depth to the weapon.
    ctx.strokeStyle="rgba(255,255,255,.62)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(3,-8);ctx.lineTo(25,-8);ctx.stroke();
    ctx.strokeStyle="rgba(35,25,18,.48)";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(2,9);ctx.lineTo(27,9);ctx.stroke();
    ctx.fillStyle="rgba(255,255,255,.18)";ctx.beginPath();ctx.roundRect(1,-5,17,2,1);ctx.fill();
    // Short muzzle flash and hand movement when the fighter fires.
    if(kick>.08){ctx.globalAlpha=kick;ctx.fillStyle="#fff0a6";ctx.shadowColor=color;ctx.shadowBlur=18;ctx.beginPath();ctx.moveTo(32,-5);ctx.lineTo(45,0);ctx.lineTo(32,5);ctx.lineTo(36,0);ctx.closePath();ctx.fill();ctx.shadowBlur=0;}
    ctx.globalAlpha=1;
    // Glove overlaps the rear grip so the weapon visibly sits in the hand.
    ctx.fillStyle="#f0c18b";ctx.strokeStyle="#70472e";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(-1,0,8,7,-.25,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle="rgba(255,255,255,.42)";ctx.beginPath();ctx.ellipse(-3,-3,3.5,2,-.3,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
  function drawAimGuide(){
    if(!me||!me.alive)return;
    var f=foods[me.fighter],a=me.angle,range=f.range,half=f.spread*(f.count-1)/2;
    var color=f.color,steps=Math.max(1,f.count);
    ctx.save();ctx.translate(me.x,me.y);ctx.globalAlpha=.18;ctx.fillStyle=color;
    ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,range,a-half-.025,a+half+.025);ctx.closePath();ctx.fill();
    ctx.globalAlpha=.72;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash([10,8]);
    for(var i=0;i<steps;i++){
      var shotAngle=a+(i-(steps-1)/2)*f.spread;
      ctx.beginPath();ctx.moveTo(20*Math.cos(shotAngle),20*Math.sin(shotAngle));
      ctx.lineTo(range*Math.cos(shotAngle),range*Math.sin(shotAngle));ctx.stroke();
    }
    ctx.setLineDash([]);ctx.globalAlpha=.9;ctx.strokeStyle="#fff";ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(26*Math.cos(a),26*Math.sin(a));ctx.lineTo(range*Math.cos(a),range*Math.sin(a));ctx.stroke();
    var tx=range*Math.cos(a),ty=range*Math.sin(a);
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(tx,ty,8,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(tx,ty,12,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;ctx.restore();
  }
  function draw(){
    ctx.clearRect(0,0,W,H);ctx.fillStyle="#acd18d";ctx.fillRect(0,0,W,H);var viewPlayer=net&&!me.alive&&spectateTarget&&spectateTarget.alive?spectateTarget:me;if(viewPlayer){camera.x=viewPlayer.x-W/(2*ZOOM);camera.y=viewPlayer.y-H/(2*ZOOM);}ctx.save();if(screenShake>.1){ctx.translate(rand(-screenShake,screenShake),rand(-screenShake,screenShake));}ctx.translate(-camera.x*ZOOM,-camera.y*ZOOM);ctx.scale(ZOOM,ZOOM);
    var viewWorldW=W/ZOOM,viewWorldH=H/ZOOM;var ground=ctx.createLinearGradient(camera.x,camera.y,camera.x+viewWorldW,camera.y+viewWorldH);ground.addColorStop(0,"#cce5a9");ground.addColorStop(.52,"#acd18d");ground.addColorStop(1,"#8fbd79");ctx.fillStyle=ground;ctx.fillRect(camera.x-3,camera.y-3,viewWorldW+6,viewWorldH+6);
    ctx.strokeStyle="rgba(75,125,65,.12)";ctx.lineWidth=2;for(var x=Math.floor(camera.x/90)*90;x<camera.x+viewWorldW+90;x+=90){for(var y=Math.floor(camera.y/90)*90;y<camera.y+viewWorldH+90;y+=90){ctx.beginPath();ctx.arc(x+17,y+21,2,0,Math.PI*2);ctx.stroke();ctx.strokeStyle="rgba(66,111,57,.16)";ctx.beginPath();ctx.moveTo(x+48,y+57);ctx.lineTo(x+53,y+49);ctx.moveTo(x+53,y+49);ctx.lineTo(x+57,y+59);ctx.stroke();ctx.strokeStyle="rgba(75,125,65,.12)";}}
    // Deterministic decorative terrain: paths and flowers only, never collision or bush hiding.
    ctx.save();
    ctx.strokeStyle="rgba(191,157,101,.23)";ctx.lineWidth=72;ctx.lineCap="round";
    ctx.beginPath();ctx.moveTo(WORLD_W/2-1600,WORLD_H/2+290);ctx.bezierCurveTo(WORLD_W/2-680,WORLD_H/2-280,WORLD_W/2+440,WORLD_H/2+320,WORLD_W/2+1510,WORLD_H/2-240);ctx.stroke();
    ctx.strokeStyle="rgba(255,238,186,.22)";ctx.lineWidth=4;ctx.setLineDash([18,30]);ctx.stroke();ctx.setLineDash([]);
    var tile=155,ix0=Math.floor(camera.x/tile),ix1=Math.ceil((camera.x+viewWorldW)/tile),iy0=Math.floor(camera.y/tile),iy1=Math.ceil((camera.y+viewWorldH)/tile);
    for(var ix=ix0;ix<=ix1;ix++){for(var iy=iy0;iy<=iy1;iy++){
      var key=ix+","+iy,decor=terrainTileCache.get(key);
      if(!decor){
        decor=document.createElement("canvas");decor.width=tile;decor.height=tile;
        var dctx=decor.getContext("2d");
        var seed=Math.abs((ix*73856093)^(iy*19349663)),px=24+(seed%95),py=18+((seed>>>8)%100);
        if(seed%5===0){dctx.fillStyle=seed%2?"#f4e69e":"#f7f4e5";for(var petal=0;petal<5;petal++){var ang=petal*Math.PI*2/5;dctx.beginPath();dctx.arc(px+Math.cos(ang)*4,py+Math.sin(ang)*4,2.8,0,Math.PI*2);dctx.fill();}dctx.fillStyle="#edbb55";dctx.beginPath();dctx.arc(px,py,2.5,0,Math.PI*2);dctx.fill();}
        else if(seed%7===0){dctx.strokeStyle="rgba(60,116,52,.35)";dctx.lineWidth=2;dctx.beginPath();dctx.moveTo(px-4,py+5);dctx.lineTo(px,py-4);dctx.lineTo(px+4,py+5);dctx.stroke();}
        // Bound memory even when the player travels across the whole world.
        if(terrainTileCache.size>=180)terrainTileCache.delete(terrainTileCache.keys().next().value);
        terrainTileCache.set(key,decor);
      }
      ctx.drawImage(decor,ix*tile,iy*tile);
    }}
    ctx.restore();
    // Storm tint uses a full viewport rectangle and a circular cutout, even when the ring is off screen.
    ctx.save();var stormPulse=.5+.5*Math.sin(elapsed*5);ctx.beginPath();ctx.rect(camera.x-3,camera.y-3,viewWorldW+6,viewWorldH+6);ctx.moveTo(zone.x+zone.r,zone.y);ctx.arc(zone.x,zone.y,zone.r,0,Math.PI*2);ctx.fillStyle="rgba(102,35,139,"+(.32+stormPulse*.06)+")";ctx.fill("evenodd");ctx.shadowColor="#ff5c9d";ctx.shadowBlur=18+stormPulse*12;ctx.strokeStyle="#ff5b96";ctx.lineWidth=11;ctx.setLineDash([26,11]);ctx.lineDashOffset=-elapsed*48;ctx.beginPath();ctx.arc(zone.x,zone.y,zone.r,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.setLineDash([]);ctx.strokeStyle="#fff0fc";ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(zone.x,zone.y,zone.r-11,0,Math.PI*2);ctx.stroke();ctx.restore();
    // The expanded world boundaries are now far outside the storm play area.
    obstacles.forEach(function(o){
      if(o.x+o.w<camera.x-50||o.x>camera.x+viewWorldW+50||o.y+o.h<camera.y-50||o.y>camera.y+viewWorldH+50)return;
      var lift=o.kind==="wall"?18:o.kind==="rock"?13:5;
      if(o.kind==="wall"){
        ctx.fillStyle="#647866";ctx.beginPath();ctx.moveTo(o.x,o.y+lift);ctx.lineTo(o.x+o.w,o.y+lift);ctx.lineTo(o.x+o.w,o.y+o.h+lift);ctx.lineTo(o.x,o.y+o.h+lift);ctx.closePath();ctx.fill();
        ctx.fillStyle="#aebca5";ctx.strokeStyle="#63755e";ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(o.x,o.y,o.w,o.h,10);ctx.fill();ctx.stroke();
        ctx.fillStyle="rgba(255,255,255,.22)";ctx.fillRect(o.x+9,o.y+5,o.w-18,5);
        ctx.strokeStyle="rgba(74,94,73,.28)";ctx.lineWidth=2;
        for(var by=1;by<4;by++){var yy=o.y+by*o.h/4;ctx.beginPath();ctx.moveTo(o.x+5,yy);ctx.lineTo(o.x+o.w-5,yy);ctx.stroke();}
        for(var bx=1;bx<4;bx++){var xx=o.x+bx*o.w/4;ctx.beginPath();ctx.moveTo(xx,o.y+3);ctx.lineTo(xx,o.y+o.h-3);ctx.stroke();}
      }else if(o.kind==="rock"){
        ctx.fillStyle="#65766d";ctx.beginPath();ctx.ellipse(o.x+o.w/2,o.y+o.h/2+lift,o.w/2,o.h/2,0,0,Math.PI*2);ctx.fill();
        var rg=ctx.createLinearGradient(o.x,o.y,o.x+o.w,o.y+o.h);rg.addColorStop(0,"#e1e8db");rg.addColorStop(.45,"#9eafa2");rg.addColorStop(1,"#667c70");
        ctx.fillStyle=rg;ctx.strokeStyle="#5d7467";ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(o.x+o.w/2,o.y+o.h/2,o.w/2,o.h/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.fillStyle="rgba(255,255,255,.28)";ctx.beginPath();ctx.ellipse(o.x+o.w*.34,o.y+o.h*.3,o.w*.19,o.h*.12,-.4,0,Math.PI*2);ctx.fill();ctx.strokeStyle="rgba(65,91,72,.35)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(o.x+o.w*.25,o.y+o.h*.62);ctx.lineTo(o.x+o.w*.43,o.y+o.h*.52);ctx.moveTo(o.x+o.w*.55,o.y+o.h*.72);ctx.lineTo(o.x+o.w*.72,o.y+o.h*.59);ctx.stroke();
        ctx.fillStyle="rgba(255,255,255,.2)";ctx.beginPath();ctx.arc(o.x+o.w*.62,o.y+o.h*.27,2.5,0,Math.PI*2);ctx.arc(o.x+o.w*.42,o.y+o.h*.76,2,0,Math.PI*2);ctx.fill();
      }else{
        var pulse=Math.sin(elapsed*2+o.x*.02)*2;
        ctx.fillStyle="#285e38";ctx.beginPath();ctx.ellipse(o.x+o.w/2,o.y+o.h/2+lift,o.w/2,o.h/2,0,0,Math.PI*2);ctx.fill();
        [[.3,.48,.32],[.58,.36,.34],[.72,.58,.25],[.42,.24,.27],[.18,.66,.22],[.82,.28,.2]].forEach(function(v){var gg=ctx.createRadialGradient(o.x+o.w*v[0]-5,o.y+o.h*v[1]-7,2,o.x+o.w*v[0],o.y+o.h*v[1],o.h*v[2]);gg.addColorStop(0,"#a5e58a");gg.addColorStop(.55,"#5eae58");gg.addColorStop(1,"#28633a");ctx.fillStyle=gg;ctx.beginPath();ctx.arc(o.x+o.w*v[0],o.y+o.h*v[1]-pulse*.15,o.h*v[2],0,Math.PI*2);ctx.fill();});
        ctx.strokeStyle="rgba(225,255,205,.35)";ctx.lineWidth=1.5;for(var leaf=0;leaf<5;leaf++){var lx=o.x+o.w*(.2+leaf*.14),ly=o.y+o.h*(.35+(leaf%2)*.22)-pulse*.15;ctx.beginPath();ctx.moveTo(lx-4,ly+3);ctx.quadraticCurveTo(lx,ly-7,lx+5,ly);ctx.stroke();}
      }
    });
    bullets.forEach(function(b){if(b.x<camera.x-30||b.x>camera.x+viewWorldW+30||b.y<camera.y-30||b.y>camera.y+viewWorldH+30)return;ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.fillStyle="rgba(255,255,255,.5)";ctx.beginPath();ctx.ellipse(-10,0,16,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=b.color;ctx.shadowColor=b.color;ctx.shadowBlur=12;ctx.beginPath();ctx.ellipse(0,0,b.r+4,b.r,0,0,Math.PI*2);ctx.fill();ctx.restore();});
    effects.forEach(function(e){var t=1-e.life/e.max;ctx.save();ctx.globalAlpha=(1-t)*.75;ctx.strokeStyle=e.color;ctx.lineWidth=5*(1-t)+1;ctx.beginPath();ctx.arc(e.x,e.y,e.r*(.3+t),0,Math.PI*2);ctx.stroke();ctx.restore();});
    players.forEach(function(p){if(!p.alive||p.x<camera.x-80||p.x>camera.x+viewWorldW+80||p.y<camera.y-80||p.y>camera.y+viewWorldH+80||p!==me&&!(net&&!me.alive)&&!canSee(me,p))return;ctx.save();if(inBush(p))ctx.globalAlpha=p===me?.65:.78;drawFoodHero(p,performance.now());drawFoodWeapon(p);
      if(p.shield>0){ctx.save();var shieldPulse=1+Math.sin(elapsed*9)*.045;ctx.globalAlpha=.74;ctx.strokeStyle="#8cf0ff";ctx.lineWidth=6;ctx.shadowColor="#8cf0ff";ctx.shadowBlur=16;ctx.beginPath();ctx.arc(p.x,p.y,42*shieldPulse,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.13;ctx.fillStyle="#75eaff";ctx.fill();ctx.restore();}
      if(p.superFlash>0){ctx.save();ctx.globalAlpha=clamp(p.superFlash,0,1);ctx.strokeStyle="#ffe37a";ctx.shadowColor="#ffe37a";ctx.shadowBlur=15;ctx.lineWidth=7;ctx.beginPath();ctx.arc(p.x,p.y,45+(1.05-p.superFlash)*55,0,Math.PI*2);ctx.stroke();ctx.restore();}
      // Clearly show HP above every visible opponent, not just the local player.
      ctx.save();ctx.globalAlpha=1;
      var enemy=p!==me,healthMax=Math.max(1,Number(p.maxHp)||foods[p.fighter].hp);
      var healthNow=Math.max(0,Number(p.hp)||0),healthFraction=clamp(healthNow/healthMax,0,1);
      var barWidth=enemy?82:62,barHeight=enemy?12:9,barY=p.y-47;
      ctx.fillStyle="rgba(14,30,22,.94)";ctx.beginPath();ctx.roundRect(p.x-barWidth/2-4,barY-4,barWidth+8,barHeight+8,7);ctx.fill();
      ctx.fillStyle="#304738";ctx.beginPath();ctx.roundRect(p.x-barWidth/2,barY,barWidth,barHeight,4);ctx.fill();
      if(healthFraction>0){ctx.fillStyle=healthFraction>.5?"#6be57b":healthFraction>.25?"#ffcc55":"#ff5b60";ctx.beginPath();ctx.roundRect(p.x-barWidth/2,barY,barWidth*healthFraction,barHeight,4);ctx.fill();}
      ctx.font="bold 12px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.lineWidth=3;ctx.strokeStyle="#173020";ctx.fillStyle="#fff";
      var hpText=Math.ceil(healthNow)+" / "+Math.ceil(healthMax);
      ctx.strokeText(hpText,p.x,barY-12);ctx.fillText(hpText,p.x,barY-12);
      var playerLabel=p===me?"DIG":net?String(p.name||"MODSTANDER").slice(0,18):foods[p.fighter].name;
      ctx.strokeText(playerLabel,p.x,barY-30);ctx.fillText(playerLabel,p.x,barY-30);
      ctx.restore();
      if(net){ctx.save();ctx.strokeStyle=p===me?"#47d7ff":"#ff6a78";ctx.lineWidth=p===me?5:4;ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(p.x,p.y,33,0,Math.PI*2);ctx.stroke();ctx.restore();}
      ctx.restore();});
    // Brawl Stars-style foreground foliage: the bush softens above your own fighter.
    // Other players outside cannot see the hidden hero at all (filtered above).
    if(me&&me.alive&&inBush(me)){
      var ownBush=bushAt(me);
      ctx.save();ctx.globalAlpha=.25;ctx.fillStyle="#4baf57";
      ctx.beginPath();ctx.ellipse(ownBush.x+ownBush.w*.5,ownBush.y+ownBush.h*.5,ownBush.w*.47,ownBush.h*.44,0,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=.42;ctx.strokeStyle="#b6f39c";ctx.lineWidth=4;
      ctx.beginPath();ctx.ellipse(ownBush.x+ownBush.w*.5,ownBush.y+ownBush.h*.5,ownBush.w*.46,ownBush.h*.43,0,0,Math.PI*2);ctx.stroke();
      ctx.restore();
    }
    drawAimGuide();
    particles.forEach(function(p){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=p.r?8:0;ctx.beginPath();ctx.arc(p.x,p.y,p.r||4,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;});floatingTexts.forEach(function(t){ctx.globalAlpha=clamp(t.life/t.max,0,1);ctx.font="900 19px system-ui";ctx.textAlign="center";ctx.lineWidth=4;ctx.strokeStyle="rgba(35,53,35,.8)";ctx.strokeText(t.text,t.x,t.y);ctx.fillStyle=t.color;ctx.fillText(t.text,t.x,t.y);ctx.globalAlpha=1;});ctx.restore();
    drawMinimap();drawStormStatus();drawSuperHud();
  }
  // Screen-space storm indicator remains readable even if the ring is offscreen.
  function drawStormStatus(){
    if(!running||!me||!me.alive)return;
    var distance=Math.hypot(me.x-zone.x,me.y-zone.y),outside=distance>zone.r;
    var round=stormRounds[Math.min(stormStage,stormRounds.length-1)];
    var until=Math.max(0,round.wait-stormTime),moving=stormTime>round.wait;
    var label=outside?"UDEN FOR ZONEN!":!moving?"NÆSTE ZONE OM "+Math.ceil(until)+"s":stormStage>=4?"MOVING ZONE":"ZONEN BEVÆGER SIG";
    var x=22,y=18,w=outside?248:235,h=43;
    ctx.save();ctx.fillStyle=outside?"rgba(113,26,73,.96)":"rgba(29,42,43,.88)";
    ctx.beginPath();ctx.roundRect(x,y,w,h,12);ctx.fill();
    ctx.strokeStyle=outside?"#ff8bb6":"rgba(255,255,255,.18)";ctx.lineWidth=2;ctx.stroke();
    ctx.font="800 14px system-ui";ctx.textAlign="left";ctx.textBaseline="middle";
    ctx.fillStyle=outside?"#fff":"#ffe3f1";ctx.fillText(label,x+13,y+16);
    ctx.fillStyle="#f3a8cc";ctx.fillRect(x+13,y+30,w-26,4);
    ctx.fillStyle="#fff";ctx.fillRect(x+13,y+30,(w-26)*(moving?clamp((stormTime-round.wait)/round.move,0,1):clamp(stormTime/round.wait,0,1)),4);
    if(outside){
      var a=Math.atan2(zone.y-me.y,zone.x-me.x),cx=W/2,cy=H/2;
      ctx.save();ctx.translate(cx+Math.cos(a)*110,cy+Math.sin(a)*88);ctx.rotate(a);
      ctx.fillStyle="#fff";ctx.strokeStyle="#9e245e";ctx.lineWidth=4;
      ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(-13,-12);ctx.lineTo(-8,0);ctx.lineTo(-13,12);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
      ctx.textAlign="center";ctx.font="900 17px system-ui";ctx.lineWidth=4;
      ctx.strokeStyle="rgba(65,20,50,.9)";ctx.strokeText("LØB IND I ZONEN!",W/2,H-75);
      ctx.fillStyle="#fff";ctx.fillText("LØB IND I ZONEN!",W/2,H-75);
    }
    ctx.restore();
  }
  // One unified scoreboard: minimap, match stats and elimination feed.
  function drawSuperHud(){
    if(!running||!me||!me.alive)return;
    var charge=clamp(me.superCharge||0,0,100),x=22,y=H-147,w=188;
    ctx.save();ctx.fillStyle="rgba(24,41,32,.9)";ctx.beginPath();ctx.roundRect(x,y,w,115,12);ctx.fill();
    var hp=Math.max(0,Math.ceil(me.hp||0)),maxHp=Math.max(1,Math.ceil(me.maxHp||1));
    ctx.fillStyle="#fff";ctx.font="800 13px system-ui";ctx.textAlign="left";ctx.fillText("LIV "+hp+" / "+maxHp,x+12,y+18);
    ctx.fillStyle="#374a3c";ctx.beginPath();ctx.roundRect(x+12,y+25,w-24,12,5);ctx.fill();
    ctx.fillStyle=hp/maxHp>.55?"#69e67d":hp/maxHp>.25?"#ffd45c":"#ff6262";
    ctx.beginPath();ctx.roundRect(x+12,y+25,(w-24)*clamp(hp/maxHp,0,1),12,5);ctx.fill();
    ctx.fillStyle="#fff";ctx.font="800 12px system-ui";ctx.fillText(charge>=100?"SUPER KLAR!":"SUPER "+Math.floor(charge)+"%",x+12,y+53);
    ctx.fillStyle="#374a3c";ctx.beginPath();ctx.roundRect(x+12,y+63,w-24,9,5);ctx.fill();
    ctx.fillStyle=charge>=100?"#ffe06b":"#e6b55b";ctx.beginPath();ctx.roundRect(x+12,y+63,(w-24)*charge/100,9,5);ctx.fill();
    // Fast-filling ammo indicators: weaker fighters have larger magazines.
    var cap=ammoCapacity(me),ammo=me.ammo===undefined?cap:me.ammo;
    ctx.fillStyle="#fff";ctx.font="800 12px system-ui";
    ctx.fillText("SKUD "+ammo+"/"+cap,x+12,y+99);
    var gap=3,slotWidth=(w-98-(cap-1)*gap)/cap;
    for(var slot=0;slot<cap;slot++){
      var sx=x+86+slot*(slotWidth+gap),filled=slot<ammo;
      ctx.fillStyle=filled?"#ffe084":"#374a3c";
      ctx.beginPath();ctx.roundRect(sx,y+89,slotWidth,12,3);ctx.fill();
      if(!filled&&slot===ammo){
        ctx.fillStyle="#d7a64d";ctx.beginPath();
        ctx.roundRect(sx,y+89,slotWidth*clamp((me.reloadClock||0)/ammoReload(me),0,1),12,3);ctx.fill();
      }
    }
    ctx.restore();
  }
  function drawMinimap(){
    if(!running||!me)return;
    var mw=178,mh=112,pad=12,cardW=202,mx=W-cardW-14,my=14;
    var aliveCount=players.filter(function(p){return p.alive;}).length;
    var visibleFeed=killFeed.slice(0,3),feedH=visibleFeed.length?visibleFeed.length*27+25:45;
    var mapTop=my+59,feedTop=mapTop+mh+15,cardH=59+mh+15+feedH+12;
    ctx.save();
    ctx.shadowColor="rgba(15,32,25,.24)";ctx.shadowBlur=18;ctx.shadowOffsetY=5;
    ctx.fillStyle="rgba(17,38,30,.94)";ctx.beginPath();ctx.roundRect(mx,my,cardW,cardH,16);ctx.fill();
    ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.strokeStyle="rgba(255,255,255,.16)";ctx.lineWidth=1;ctx.stroke();
    ctx.textBaseline="middle";ctx.textAlign="left";
    ctx.fillStyle="#a7c6ad";ctx.font="700 10px system-ui";ctx.fillText("SHOWDOWN",mx+pad,my+16);
    ctx.fillStyle="#fff";ctx.font="900 24px system-ui";ctx.fillText(String(aliveCount),mx+pad,my+39);
    ctx.fillStyle="#a7c6ad";ctx.font="600 10px system-ui";ctx.fillText("TILBAGE",mx+42,my+40);
    ctx.fillStyle="#f9d77c";ctx.font="900 24px system-ui";ctx.textAlign="right";ctx.fillText(String(me.kills),mx+cardW-pad,my+39);
    ctx.font="600 10px system-ui";ctx.fillText("KILLS",mx+cardW-pad,my+16);
    ctx.textAlign="left";
    ctx.save();ctx.beginPath();ctx.roundRect(mx+pad,mapTop,mw,mh,9);ctx.clip();
    // Static minimap terrain is rasterized once per generated map, not every frame.
    // The cached pixels are identical to the previous per-frame drawing.
    if(!minimapTerrain){
      minimapTerrain=document.createElement("canvas");minimapTerrain.width=mw;minimapTerrain.height=mh;
      var mctx=minimapTerrain.getContext("2d");
      mctx.fillStyle="#b3d19b";mctx.fillRect(0,0,mw,mh);
      obstacles.forEach(function(o){
        mctx.fillStyle=o.kind==="wall"?"#64786b":o.kind==="rock"?"#889c8b":"#4d9956";
        mctx.fillRect(o.x/WORLD_W*mw,o.y/WORLD_H*mh,Math.max(1,o.w/WORLD_W*mw),Math.max(1,o.h/WORLD_H*mh));
      });
    }
    ctx.drawImage(minimapTerrain,mx+pad,mapTop);
    ctx.strokeStyle="#ff5e9b";ctx.lineWidth=3.5;ctx.beginPath();
    ctx.ellipse(mx+pad+zone.x/WORLD_W*mw,mapTop+zone.y/WORLD_H*mh,zone.r/WORLD_W*mw,zone.r/WORLD_H*mh,0,0,Math.PI*2);ctx.stroke();
    // White dashed preview of the next safe circle, fixed for the entire round.
    if(stormTarget){ctx.save();ctx.setLineDash([5,4]);ctx.strokeStyle="#fff9c9";ctx.lineWidth=2.5;ctx.beginPath();ctx.ellipse(mx+pad+stormTarget.x/WORLD_W*mw,mapTop+stormTarget.y/WORLD_H*mh,stormTarget.r/WORLD_W*mw,stormTarget.r/WORLD_H*mh,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
    // Only the local player is visible on the minimap.
    var px=mx+pad+clamp(me.x/WORLD_W,0,1)*mw,py=mapTop+clamp(me.y/WORLD_H,0,1)*mh;
    ctx.fillStyle="#fff";ctx.strokeStyle="#244735";ctx.lineWidth=2;ctx.beginPath();ctx.arc(px,py,5,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.restore();
    ctx.strokeStyle="rgba(255,255,255,.13)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(mx+pad,feedTop-8);ctx.lineTo(mx+cardW-pad,feedTop-8);ctx.stroke();
    ctx.fillStyle="#a7c6ad";ctx.font="700 10px system-ui";ctx.fillText("ELIMINERINGER",mx+pad,feedTop+3);
    if(!visibleFeed.length){ctx.fillStyle="rgba(255,255,255,.65)";ctx.font="500 11px system-ui";ctx.fillText("Ingen elimineringer endnu",mx+pad,feedTop+26);}
    visibleFeed.forEach(function(entry,i){
      var y=feedTop+25+i*27,alpha=clamp(entry.life/1.1,0,1);
      ctx.globalAlpha=alpha;
      if(entry.highlight){ctx.fillStyle="rgba(249,215,124,.13)";ctx.beginPath();ctx.roundRect(mx+7,y-11,cardW-14,23,6);ctx.fill();}
      var killer=entry.killer.length>13?entry.killer.slice(0,12)+"…":entry.killer;
      var victim=entry.victim.length>13?entry.victim.slice(0,12)+"…":entry.victim;
      ctx.font="700 10px system-ui";ctx.fillStyle=entry.highlight?"#f9d77c":"#f2f7f0";ctx.fillText(killer,mx+pad,y,83);
      ctx.fillStyle="#94b7a0";ctx.textAlign="center";ctx.fillText("›",mx+cardW/2,y);
      ctx.textAlign="right";ctx.fillStyle="#e3ece4";ctx.font="500 10px system-ui";ctx.fillText(victim,mx+cardW-pad,y,83);ctx.textAlign="left";
      ctx.globalAlpha=1;
    });
    ctx.restore();
  }
  var countdownLeft=0,countdownStep=0,countdownGoHold=0,countdownStartAt=0;
  var countdownOverlay=document.createElement("div");
  countdownOverlay.className="arena-countdown";countdownOverlay.hidden=true;
  countdownOverlay.innerHTML='<div class="arena-countdown-top">GØR DIG KLAR</div><div class="arena-countdown-number">3</div><div class="arena-countdown-bottom">SOLO SHOWDOWN</div>';
  root.querySelector("#arenaCanvasWrap").appendChild(countdownOverlay);
  function countdownTick(){
    var n=Math.ceil(countdownLeft);
    if(n!==countdownStep){
      countdownStep=n;
      var num=countdownOverlay.querySelector(".arena-countdown-number");
      num.textContent=n>0?String(n):"KÆMP!";
      num.classList.remove("arena-countdown-pulse");void num.offsetWidth;num.classList.add("arena-countdown-pulse");
      if(n>0)tone(520+(3-n)*110,.16,"triangle",.18);
      else {tone(880,.25,"triangle",.24);tone(1320,.4,"sine",.21,.09);ring(me.x,me.y,"#fff0a8",100);burst(me.x,me.y,"#ffe8a3",20,160);}
    }
  }
  function loop(now){
    if(!running)return;
    var dt=Math.min(Math.max((now-last)/1000,0),.035);last=now;
    // Countdown uses real elapsed time, not the capped simulation dt.
    // This keeps 3-2-1 accurate even on slow iPads and after tab throttling.
    if(!countdownOverlay.hidden){
      var seconds=(now-countdownStartAt)/1000;
      countdownLeft=Math.max(0,3-seconds);
      countdownTick();
      if(seconds>=3){countdownOverlay.classList.add("arena-countdown-go");}
      if(seconds>=3.7){
        countdownOverlay.hidden=true;
        countdownOverlay.classList.remove("arena-countdown-go");
        last=now;
      }
    }else if(net&&!net.host){
      elapsed+=dt;
      if(now-netLastInput>110){netLastInput=now;sendNetInput();}
      if(now-netSnapshotAt>6500)root.querySelector("#arenaHint").textContent="⚠️ Ingen kampdata fra værten. I spiller ikke synkroniseret.";
    }else{
      update(dt);
      if(net&&net.host&&!me.alive)updateSpectator();
      if(net&&net.host&&now-netLastSend>(players.length>2?200:120)){netLastSend=now;sendNetSnapshot(false);}
    }
    // The guest draws at 40 FPS instead of redrawing the whole large map at 60+ FPS.
    // Network input and snapshots continue independently of the rendering limit.
    if(!net||net.host||now-netLastDraw>=25){netLastDraw=now;draw();}
    if(running)raf=requestAnimationFrame(loop);
  }
  function sendNetInput(){
    if(!net||net.host||!me||!me.alive)return;
    var dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
    var dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);
    if(isTouch()){dx=touchMove.x;dy=touchMove.y;}
    var angle=isTouch()&&touchAim.active?Math.atan2(touchAim.y,touchAim.x):Math.atan2(pointer.y/ZOOM+camera.y-me.y,pointer.x/ZOOM+camera.x-me.x);
    net.channel.send({type:"broadcast",event:"input",payload:{userId:net.userId,input:{dx:dx,dy:dy,angle:angle,fire:!!(isTouch()?(touchAim.active||touchFire):(pointer.down||keys[" "])),super:!!superPressed,dash:!!(touchDash||keys.shift)}}});
    superPressed=false;
  }
  function sendNetSnapshot(done){
    if(!net||!net.host)return;
    net.channel.send({type:"broadcast",event:"state",payload:{
      players:players.map(function(p){return {id:p.netId,x:Math.round(p.x),y:Math.round(p.y),hp:Math.round(p.hp),alive:p.alive,angle:Math.round(p.angle*100)/100,ammo:p.ammo,superCharge:Math.round(p.superCharge),shield:p.shield,kills:p.kills,walking:p.walking,muzzleFlash:p.muzzleFlash,hurt:p.hurt};}),
      bullets:bullets.slice(-(players.length>2?45:90)).map(function(b){return {x:b.x,y:b.y,vx:b.vx,vy:b.vy,r:b.r,color:b.color,life:b.life,owner:b.owner&&b.owner.netId,superTrail:b.superTrail};}),
      zone:zone,elapsed:elapsed,stormStage:stormStage,stormTime:stormTime,done:!!done,winner:players.find(function(p){return p.alive;})?.netId||null
    }});
  }
  function receiveNetSnapshot(snap){
    if(!net||net.host||!snap||!Array.isArray(snap.players))return;
    netSnapshotAt=performance.now();elapsed=Number(snap.elapsed)||0;
    zone=snap.zone||zone;stormStage=snap.stormStage||0;stormTime=snap.stormTime||0;
    snap.players.forEach(function(st){var p=players.find(function(q){return q.netId===st.id;});if(!p)return;
      ["x","y","hp","angle","ammo","superCharge","shield","kills","walking","muzzleFlash","hurt"].forEach(function(k){if(st[k]!==undefined)p[k]=st[k];});
      p.alive=!!st.alive;
    });
    bullets=(snap.bullets||[]).map(function(b){return {x:b.x,y:b.y,vx:b.vx,vy:b.vy,r:b.r,color:b.color,life:b.life,owner:players.find(function(p){return p.netId===b.owner;})||null,superTrail:b.superTrail};});
    root.querySelector("#arenaAlive").textContent=players.filter(function(p){return p.alive;}).length;
    root.querySelector("#arenaKills").textContent=me.kills||0;
    root.querySelector("#arenaClock").textContent=Math.floor(elapsed/60)+":"+String(Math.floor(elapsed%60)).padStart(2,"0");
    if(!snap.done)updateSpectator();
    if(snap.done&&!gameOver)finish(me.alive&&snap.winner===net.userId);
  }
  function startOnline(cfg){
    if(!cfg||!cfg.channel||!cfg.userId||!Array.isArray(cfg.roster)||cfg.roster.length<2)return;
    audioReady();mode="online";net={host:!!cfg.host,userId:cfg.userId,channel:cfg.channel};spectateTarget=null;if(spectateBar)spectateBar.hidden=true;
    netInputs=Object.create(null);netInputAt=Object.create(null);netLastSend=0;netLastInput=0;netSnapshotAt=0;netSequence=0;netLastDraw=0;
    players=[];me=null;bullets=[];particles=[];effects=[];floatingTexts=[];killFeed=[];elapsed=0;winner=null;gameOver=false;superPressed=false;
    // All clients generate the exact same map from the room ID.
    var seed=0,seedText=String(cfg.seed||"restemad");
    for(var si=0;si<seedText.length;si++)seed=(Math.imul(seed,31)+seedText.charCodeAt(si))>>>0;
    var originalRandom=Math.random;
    Math.random=function(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    try{makeMap();}finally{Math.random=originalRandom;}
    zone={x:WORLD_W/2,y:WORLD_H/2,r:1780};stormStage=0;stormTime=0;stormStart=null;stormTarget=null;
    cfg.roster.forEach(function(r,i){
      var f=Number(r.fighter);
      if(!Number.isInteger(f)||f<0||f>=foods.length)f=0;
      var p=spawn(f,true);
      // Spawn evenly around the safe zone instead of stacking near its centre.
      // Deterministic candidates ensure host and guests use the same positions.
      var a=i*Math.PI*2/cfg.roster.length+.17,rad=cfg.roster.length<=2?1130:cfg.roster.length<=4?1080:1000;
      var found=false;
      for(var attempt=0;attempt<96;attempt++){
        var angle=a+(attempt%16)*Math.PI/8;
        var radius=rad-Math.floor(attempt/16)*115;
        var sx=zone.x+Math.cos(angle)*radius,sy=zone.y+Math.sin(angle)*radius;
        var safe=!obstacles.some(function(o){return obstacleHit(o,sx,sy,65);});
        var spaced=players.every(function(q){return Math.hypot(q.x-sx,q.y-sy)>(cfg.roster.length<=2?1100:cfg.roster.length<=4?650:400);});
        if(safe&&spaced){p.x=sx;p.y=sy;found=true;break;}
      }
      if(!found){
        var fallback=freeSpot(null);p.x=fallback.x;p.y=fallback.y;
      }
      p.netId=r.user_id;p.name=r.user_id===cfg.userId?"Dig":String(r.nickname||"Spiller");p.human=true;p.bot=false;p.hp=foods[f].hp;p.maxHp=foods[f].hp;p.ammo=ammoCapacity(p);p.superCharge=0;p.dash=0;p.dashCooldown=0;
      players.push(p);if(r.user_id===cfg.userId)me=p;
    });
    if(!me){net=null;return;}
    // Guard against malformed duplicate roster entries.
    if(new Set(players.map(function(p){return p.netId;})).size!==players.length){net=null;return;}
    // Map is deterministic; do not transmit large obstacle arrays over Realtime.
    root.querySelector("#arenaMenu").hidden=true;root.querySelector("#arenaHud").hidden=false;
    root.querySelector("#arenaCanvasWrap").classList.add("playing");setCanvasSize();
    root.querySelector("#arenaResult").hidden=true;root.querySelector("#arenaRestart").hidden=true;
    root.querySelector("#arenaTouch").hidden=!isTouch();
    root.querySelector("#arenaModeLabel").textContent="🌐 ONLINE SHOWDOWN";
    root.querySelector("#arenaHint").textContent=isTouch()?"Venstre: bevæg · Højre: skyd · SUPER":"WASD: bevæg · Klik: skyd · E: super · Shift: dash";
    countdownLeft=3;countdownStep=0;countdownStartAt=performance.now();countdownOverlay.hidden=false;
    countdownOverlay.classList.remove("arena-countdown-go");countdownOverlay.querySelector(".arena-countdown-bottom").textContent="ONLINE SHOWDOWN";countdownTick();
    running=true;last=performance.now();cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);
  }
  window.RESTEMAD_ONLINE_GAME={start:startOnline,receive:receiveNetSnapshot,input:function(id,cmd){
    if(!net||!net.host||id===net.userId||!players.some(function(p){return p.netId===id})||!cmd)return;
    var dx=Number(cmd.dx),dy=Number(cmd.dy),angle=Number(cmd.angle);
    if(!Number.isFinite(dx)||!Number.isFinite(dy)||!Number.isFinite(angle))return;
    netInputAt[id]=performance.now();
    netInputs[id]={dx:clamp(dx,-1,1),dy:clamp(dy,-1,1),angle:angle,fire:!!cmd.fire,super:!!cmd.super,dash:!!cmd.dash};
  },map:function(){return obstacles;}};
  function setCanvasSize(){
    var rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,isTouch()?1.25:2);
    canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
    draw();
  }
  var touchMove={x:0,y:0},touchAim={x:1,y:0,active:false},touchFire=false,touchDash=false,superPressed=false;
  function joystick(el,kind){
    var active=false,id=null,center=null;
    el.addEventListener("pointerdown",function(e){e.preventDefault();active=true;id=e.pointerId;var r=el.getBoundingClientRect();center={x:r.left+r.width/2,y:r.top+r.height/2};el.setPointerCapture(id);});
    el.addEventListener("pointermove",function(e){if(!active||e.pointerId!==id)return;e.preventDefault();var dx=e.clientX-center.x,dy=e.clientY-center.y,len=Math.max(1,Math.hypot(dx,dy)),lim=42,nx=dx/len*Math.min(1,len/lim),ny=dy/len*Math.min(1,len/lim);
      el.style.setProperty("--jx",(nx*34)+"px");el.style.setProperty("--jy",(ny*34)+"px");
      if(kind==="move"){touchMove={x:nx,y:ny};}else{touchAim={x:nx,y:ny,active:len>9};}
    });
    function end(e){if(!active||e.pointerId!==id)return;active=false;el.style.setProperty("--jx","0px");el.style.setProperty("--jy","0px");if(kind==="move")touchMove={x:0,y:0};else touchAim.active=false;}
    el.addEventListener("pointerup",end);el.addEventListener("pointercancel",end);
  }
  joystick(root.querySelector("#arenaMoveStick"),"move");joystick(root.querySelector("#arenaAimStick"),"aim");
  root.querySelector("#arenaSuper").addEventListener("pointerdown",function(e){e.preventDefault();superPressed=true;});
  root.querySelector("#arenaDash").addEventListener("pointerdown",function(e){e.preventDefault();touchDash=true;});
  ["pointerup","pointercancel","pointerleave"].forEach(function(n){root.querySelector("#arenaDash").addEventListener(n,function(){touchDash=false;});});
  root.querySelector("#arenaFire").addEventListener("pointerdown",function(e){e.preventDefault();touchFire=true;});
  ["pointerup","pointercancel","pointerleave"].forEach(function(n){root.querySelector("#arenaFire").addEventListener(n,function(){touchFire=false;});});
  root.querySelector("#arenaFighters").addEventListener("click",function(e){var b=e.target.closest("[data-fighter]");if(b)choose(+b.getAttribute("data-fighter"));});
  root.querySelector("#arenaStart").addEventListener("click",function(){startGame("showdown");});
  root.querySelector("#arenaPractice").addEventListener("click",function(){startGame("practice");});
  root.querySelector("#arenaRestart").addEventListener("click",function(){if(mode==="online"){root.querySelector("#arenaExit").click();return;}startGame(mode);});
  root.querySelector("#arenaExitResult").addEventListener("click",function(){root.querySelector("#arenaExit").click();});
  var fullscreenBtn=root.querySelector("#arenaFullscreen");
  function syncFullscreenLabel(){fullscreenBtn.textContent=document.fullscreenElement?"⤢ Afslut fuld skærm":"⛶ Fuld skærm";}
  fullscreenBtn.addEventListener("click",function(){
    var wrap=root.querySelector("#arenaCanvasWrap");
    if(!document.fullscreenElement){var request=wrap.requestFullscreen||wrap.webkitRequestFullscreen;if(request){var result=request.call(wrap);if(result&&result.catch)result.catch(function(){fullscreenBtn.textContent="Fuld skærm ikke tilgængelig";});}}
    else{var leave=document.exitFullscreen||document.webkitExitFullscreen;if(leave)leave.call(document);}
  });
  document.addEventListener("fullscreenchange",syncFullscreenLabel);
  root.querySelector("#arenaExit").addEventListener("click",function(){net=null;root.querySelector("#arenaRestart").hidden=false;countdownOverlay.hidden=true;victoryBanner.hidden=true;running=false;cancelAnimationFrame(raf);root.querySelector("#arenaMenu").hidden=false;root.querySelector("#arenaHud").hidden=true;root.querySelector("#arenaResult").hidden=true;root.querySelector("#arenaCanvasWrap").classList.remove("playing");});
  root.querySelector("#arenaOnline").addEventListener("click",function(){root.querySelector("#arenaOnlineInfo").hidden=false;});
  root.querySelector("#arenaOnlineClose").addEventListener("click",function(){root.querySelector("#arenaOnlineInfo").hidden=true;});
  window.addEventListener("keydown",function(e){var k=e.key.toLowerCase();keys[k]=true;if(k==="e"&&running){e.preventDefault();superPressed=true;}if(k==="shift"&&running){e.preventDefault();if(me&&me.alive&&me.dashCooldown<=0){me.dash=.24;me.dashCooldown=1.65;}}if([" ","arrowup","arrowdown","arrowleft","arrowright"].indexOf(k)>-1&&running)e.preventDefault();});
  window.addEventListener("keyup",function(e){keys[e.key.toLowerCase()]=false;});
  canvas.addEventListener("pointermove",function(e){var r=canvas.getBoundingClientRect();pointer.x=(e.clientX-r.left)/r.width*W;pointer.y=(e.clientY-r.top)/r.height*H;pointer.active=true;});
  canvas.addEventListener("pointerdown",function(e){if(e.pointerType==="mouse"){pointer.down=true;canvas.setPointerCapture(e.pointerId);}});
  window.addEventListener("pointerup",function(){pointer.down=false;});
  window.addEventListener("blur",function(){pointer.down=false;touchFire=false;touchDash=false;superPressed=false;touchAim.active=false;touchMove={x:0,y:0};keys=Object.create(null);});
  window.addEventListener("resize",setCanvasSize);
  buildSelect();renderStats();setCanvasSize();
})();