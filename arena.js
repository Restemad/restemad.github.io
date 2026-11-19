/* RESTEMAD ARENA – spillet */
(function () {
  "use strict";
  var root = document.getElementById("arenaGame");
  if (!root) return;

  var canvas = root.querySelector("#arenaCanvas"), ctx = canvas.getContext("2d");
  var W = 960, H = 600, ZOOM = .76, WORLD_W = 3800, WORLD_H = 2400, camera = {x:0,y:0}, running = false, mode = "showdown", selected = 0;
  var players = [], bullets = [], particles = [], floatingTexts = [], obstacles = [], killFeed = [], last = 0, elapsed = 0;
  var keys = Object.create(null), pointer = {x: W/2, y:H/2, down:false};
  var me = null, winner = null, gameOver = false, raf = 0, zone = {x:WORLD_W/2,y:WORLD_H/2,r:1780}, dashHeld = false;
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
    obstacles=[];
    for(var i=0;i<170;i++){var x=rand(100,WORLD_W-130),y=rand(100,WORLD_H-120),t=Math.random();obstacles.push({x:x,y:y,w:t<.3?rand(110,175):rand(48,105),h:t<.3?rand(90,145):rand(42,100),bush:t>.72,kind:t<.3?"wall":t<.72?"rock":"bush"});}
    [[650,500],[1800,380],[3000,650],[950,1650],[2350,1750],[3300,1500]].forEach(function(p){for(var j=0;j<7;j++)obstacles.push({x:p[0]+rand(-180,180),y:p[1]+rand(-150,150),w:rand(55,125),h:rand(50,110),bush:j%3===0,kind:j%3===0?"bush":"rock"});});
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
  function startGame(which){
    mode=which; players=[];bullets=[];particles=[];floatingTexts=[];killFeed=[];elapsed=0;winner=null;gameOver=false;
    makeMap(); zone={x:WORLD_W/2,y:WORLD_H/2,r:1780}; me=spawn(selected,true);me.dash=0;me.dashCooldown=0;players.push(me);
    for(var i=0;i<9;i++){
      var f=Math.floor(Math.random()*foods.length),p=freeSpot(me);
      var food=foods[f],botHp=Math.round(food.hp*1.35);players.push({x:p.x,y:p.y,r:19,hitRx:24,hitRy:23,hp:botHp,maxHp:botHp,fighter:f,color:food.color,name:food.name,bot:true,human:false,alive:true,angle:rand(0,Math.PI*2),cool:rand(.4,1.2),speed:food.speed,damage:food.damage*.85,rate:food.rate*1.25,spread:food.spread,count:food.count,range:food.range,ai:rand(.8,1.8),target:null,kills:0,walkPhase:rand(0,6.28),recoil:0,hurt:0,siphonFlash:0});
    }
    root.querySelector("#arenaMenu").hidden=true;root.querySelector("#arenaHud").hidden=false;
    root.querySelector("#arenaCanvasWrap").classList.add("playing");setCanvasSize();
    root.querySelector("#arenaResult").hidden=true;
    root.querySelector("#arenaTouch").hidden=!isTouch();
    root.querySelector("#arenaModeLabel").textContent=which==="showdown"?"SOLO SHOWDOWN":"TRÆNING";
    root.querySelector("#arenaHint").textContent=isTouch()?"Venstre joystick: bevæg · Højre joystick: sigt · SKUD: affyr · Følg skudlinjerne":"WASD: bevæg · Mus: sigt · Venstreklik: skyd · Følg skudlinjerne";
    running=true;last=performance.now();cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);
  }
  function isTouch(){return window.matchMedia("(pointer: coarse)").matches||navigator.maxTouchPoints>0;}
  function shoot(p,angle,target){
    var f=foods[p.fighter]; if(p.cool>0||!p.alive)return;
    p.cool=p.rate;p.recoil=.16;
    for(var i=0;i<p.count;i++){
      var a=angle+(i-(p.count-1)/2)*p.spread;
      bullets.push({x:p.x+Math.cos(a)*22,y:p.y+Math.sin(a)*22,vx:Math.cos(a)*470,vy:Math.sin(a)*470,owner:p,target:target||null,damage:p.damage,life:p.range/470,r: p.fighter===2?5:6,color:p.color});
    }
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
    var nx=clamp(p.x+dx*p.speed*boost*dt,p.r,WORLD_W-p.r),ny=clamp(p.y+dy*p.speed*boost*dt,p.r,WORLD_H-p.r);
    var hit=obstacles.some(function(o){return obstacleHit(o,nx,ny,p.r);});
    if(!hit){p.x=nx;p.y=ny;}else{
      if(!obstacles.some(function(o){return obstacleHit(o,nx,p.y,p.r);}))p.x=nx;
      if(!obstacles.some(function(o){return obstacleHit(o,p.x,ny,p.r);}))p.y=ny;
    }
  }
  function update(dt){
    elapsed+=dt;
    if(elapsed>5&&zone.r>260)zone.r=Math.max(260,zone.r-62*dt);
    players.forEach(function(p){
      if(!p.alive)return;p.cool=Math.max(0,p.cool-dt);p.recoil=Math.max(0,(p.recoil||0)-dt);p.hurt=Math.max(0,(p.hurt||0)-dt);p.siphonFlash=Math.max(0,(p.siphonFlash||0)-dt);if(p.walking)p.walkPhase=(p.walkPhase||0)+dt*10;else p.walkPhase=(p.walkPhase||0)+dt*2.1;
      if(Math.hypot(p.x-zone.x,p.y-zone.y)>zone.r){p.hp-=19*dt;if(p.hp<=0){p.hp=0;p.alive=false;addKillFeed(null,p);if(p===me){finish(false);}}}
      if(p.human){
        p.dash=Math.max(0,(p.dash||0)-dt);p.dashCooldown=Math.max(0,(p.dashCooldown||0)-dt);
        if(touchDash&&p.dashCooldown<=0){p.dash=.24;p.dashCooldown=1.65;}
        var dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
        var dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);
        if(isTouch()){dx=touchMove.x;dy=touchMove.y;}
        p.walking=Math.hypot(dx,dy)>.08;
        if(p.dash>0){if(Math.hypot(dx,dy)<.1){dx=Math.cos(p.angle);dy=Math.sin(p.angle);}movePlayer(p,dx,dy,dt,2.9);if(Math.random()<.8)particles.push({x:p.x,y:p.y,vx:rand(-35,35),vy:rand(-35,35),life:.28,color:"#fff0a8"});}else movePlayer(p,dx,dy,dt);
        var target=isTouch()?touchAim:pointer;
        if(target.active){p.angle=Math.atan2(target.y/ZOOM+camera.y-p.y,target.x/ZOOM+camera.x-p.x);}
        else p.angle=Math.atan2(pointer.y/ZOOM+camera.y-p.y,pointer.x/ZOOM+camera.x-p.x);
        if(pointer.down||keys[" "]||touchFire)shoot(p,p.angle);
      }else{
        p.walking=false;
        p.ai-=dt;
        if(p.ai<=0){p.target=nearest(p,true)||nearest(p,false);p.ai=rand(.32,.62);}
        var t=p.target&&p.target.alive?p.target:nearest(p,true)||nearest(p,false);
        if(t){
          var a=Math.atan2(t.y-p.y,t.x-p.x),d=dist(p,t),visible=clearShot(p,t);p.angle=a;
          var strafe=Math.sin(elapsed*1.8+p.x*.018)*.62;
          var mx=0,my=0;
          bullets.forEach(function(b){if(b.owner===p||!b.owner.alive)return;var bx=p.x-b.x,by=p.y-b.y,bd=Math.hypot(bx,by);var closing=b.vx*bx+b.vy*by<0;if(bd<125&&closing){mx+=bx/Math.max(1,bd)*1.25;my+=by/Math.max(1,bd)*1.25;}});
          if(d>285){mx=Math.cos(a);my=Math.sin(a);}else if(d<205){mx=-Math.cos(a);my=-Math.sin(a);}
          if(!visible){var side=(Math.sin(elapsed+p.y*.01)>0?1:-1);mx+=-Math.sin(a)*side*.85;my+=Math.cos(a)*side*.85;}
          else {mx-=Math.sin(a)*strafe;my+=Math.cos(a)*strafe;}
          p.walking=Math.hypot(mx,my)>.08;
          movePlayer(p,mx,my,dt);
          if(visible&&d<p.range*.9&&Math.random()<.44)shoot(p,a+rand(-.045,.045),t);
        }
      }
    });
    bullets=bullets.filter(function(b){
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
      var wall=obstacles.some(function(o){return obstacleHit(o,b.x,b.y,b.r);});
      if(b.life<=0||b.x<0||b.x>WORLD_W||b.y<0||b.y>WORLD_H||wall)return false;
      var hit=null;
      for(var i=0;i<players.length;i++){var p=players[i];if(p.alive&&p!==b.owner){var rx=(p.hitRx||p.r)+b.r,ry=(p.hitRy||p.r)+b.r,dx=(b.x-p.x)/rx,dy=(b.y-p.y)/ry;if(dx*dx+dy*dy<=1){hit=p;break;}}}
      if(hit){hit.hp-=b.damage;hit.hurt=.13;if(hit.hp<=0){hit.hp=0;hit.alive=false;b.owner.kills++;addKillFeed(b.owner,hit);var heal=Math.min(b.owner.maxHp-b.owner.hp,Math.ceil(b.owner.maxHp*.75));if(heal>0){b.owner.hp+=heal;b.owner.siphonFlash=.7;floatingTexts.push({x:b.owner.x,y:b.owner.y-48,text:"+"+heal+" LIV",color:"#7dff91",life:1.05,max:1.05});for(var h=0;h<16;h++){var ha=Math.PI*2*h/16;particles.push({x:b.owner.x,y:b.owner.y,vx:Math.cos(ha)*rand(65,145),vy:Math.sin(ha)*rand(65,145),life:rand(.35,.7),color:"#73f58b",r:rand(2,5)});}}floatingTexts.push({x:hit.x,y:hit.y-35,text:"ELIMINERET!",color:"#ffe39a",life:1.65,max:1.65});if(b.owner===me){stats.eliminations++;saveStats();}for(var k=0;k<24;k++)particles.push({x:hit.x,y:hit.y,vx:rand(-175,175),vy:rand(-175,175),life:rand(.3,.8),color:[hit.color,"#fff0b0","#ffffff"][k%3],r:rand(2,6)});}return false;}
      return true;
    });
    killFeed=killFeed.filter(function(entry){entry.life-=dt;return entry.life>0;});particles=particles.filter(function(p){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.08,dt);p.vy*=Math.pow(.08,dt);p.life-=dt;return p.life>0;});floatingTexts=floatingTexts.filter(function(t){t.y-=34*dt;t.life-=dt;return t.life>0;});
    var alive=players.filter(function(p){return p.alive;});
    root.querySelector("#arenaAlive").textContent=alive.length;
    root.querySelector("#arenaKills").textContent=me.kills;
    root.querySelector("#arenaClock").textContent=Math.floor(elapsed/60)+":"+String(Math.floor(elapsed%60)).padStart(2,"0");
    if(!me.alive||alive.length===1){
      finish(me.alive&&alive.length===1);
    }
  }
  function finish(won){
    if(gameOver)return;gameOver=true;running=false;cancelAnimationFrame(raf);
    stats.games++;if(won){stats.wins++;stats.trophies+=8;}else stats.trophies=Math.max(0,stats.trophies-1);
    stats.trophies+=me.kills*2;saveStats();
    root.querySelector("#arenaResultTitle").textContent=won?"DU VANDT! 🏆":"DU BLEV SLÅET UD!";
    root.querySelector("#arenaResultText").textContent=won?"Fantastisk! Du er den sidste tilbage.":"God kamp! Prøv igen, og se om du kan blive den sidste.";
    root.querySelector("#arenaResultStats").textContent=me.kills+" elimineringer · "+stats.trophies+" trofæer i alt";
    root.querySelector("#arenaResult").hidden=false;root.querySelector("#arenaTouch").hidden=true;
  }
  function drawFoodHero(p,now){
    var f=foods[p.fighter],phase=p.walkPhase||now*.006+p.x*.013,step=(p.walking?Math.sin(phase):Math.sin(phase*.22)*.07),bob=p.walking?Math.abs(step)*2.8:Math.sin(phase*.22)*1.35,breath=1+Math.sin(phase*.22)*.025,lean=p.walking?Math.cos(phase)*.055:Math.sin(phase*.22)*.012;
    var faceX=Math.cos(p.angle),faceY=Math.sin(p.angle),dark="#4b3024";
    // Eye tracking is subtle, while the body keeps its own readable silhouette.
    var eyeShift=clamp(faceX*2.2,-2.2,2.2),stride=clamp(step,-1,1);
    ctx.save();ctx.translate(p.x-Math.cos(p.angle)*(p.recoil||0)*17,p.y-bob-Math.sin(p.angle)*(p.recoil||0)*17);ctx.rotate(lean);ctx.scale(1.12,1.12*breath);
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
    ctx.clearRect(0,0,W,H);ctx.fillStyle="#acd18d";ctx.fillRect(0,0,W,H);if(me){camera.x=me.x-W/(2*ZOOM);camera.y=me.y-H/(2*ZOOM);}ctx.save();ctx.translate(-camera.x*ZOOM,-camera.y*ZOOM);ctx.scale(ZOOM,ZOOM);
    var viewWorldW=W/ZOOM,viewWorldH=H/ZOOM;var ground=ctx.createLinearGradient(camera.x,camera.y,camera.x+viewWorldW,camera.y+viewWorldH);ground.addColorStop(0,"#cce5a9");ground.addColorStop(.52,"#acd18d");ground.addColorStop(1,"#8fbd79");ctx.fillStyle=ground;ctx.fillRect(camera.x-3,camera.y-3,viewWorldW+6,viewWorldH+6);
    ctx.strokeStyle="rgba(75,125,65,.12)";ctx.lineWidth=2;for(var x=Math.floor(camera.x/90)*90;x<camera.x+viewWorldW+90;x+=90){for(var y=Math.floor(camera.y/90)*90;y<camera.y+viewWorldH+90;y+=90){ctx.beginPath();ctx.arc(x+17,y+21,2,0,Math.PI*2);ctx.stroke();ctx.strokeStyle="rgba(66,111,57,.16)";ctx.beginPath();ctx.moveTo(x+48,y+57);ctx.lineTo(x+53,y+49);ctx.moveTo(x+53,y+49);ctx.lineTo(x+57,y+59);ctx.stroke();ctx.strokeStyle="rgba(75,125,65,.12)";}}
    // Storm tint uses a full viewport rectangle and a circular cutout, even when the ring is off screen.
    ctx.save();var stormPulse=.5+.5*Math.sin(elapsed*5);ctx.beginPath();ctx.rect(camera.x-3,camera.y-3,viewWorldW+6,viewWorldH+6);ctx.moveTo(zone.x+zone.r,zone.y);ctx.arc(zone.x,zone.y,zone.r,0,Math.PI*2);ctx.fillStyle="rgba(102,35,139,"+(.32+stormPulse*.06)+")";ctx.fill("evenodd");ctx.shadowColor="#ff5c9d";ctx.shadowBlur=18+stormPulse*12;ctx.strokeStyle="#ff5b96";ctx.lineWidth=17;ctx.setLineDash([26,11]);ctx.lineDashOffset=-elapsed*48;ctx.beginPath();ctx.arc(zone.x,zone.y,zone.r,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.setLineDash([]);ctx.strokeStyle="#fff0fc";ctx.lineWidth=4;ctx.beginPath();ctx.arc(zone.x,zone.y,zone.r-11,0,Math.PI*2);ctx.stroke();ctx.restore();
    // The world boundary stays visible, while the camera can follow the hero to its edge.
    ctx.save();ctx.strokeStyle="rgba(56,85,57,.6)";ctx.lineWidth=10;ctx.setLineDash([30,15]);ctx.strokeRect(0,0,WORLD_W,WORLD_H);ctx.restore();
    obstacles.forEach(function(o){
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
        var pulse=Math.sin(performance.now()*.002+o.x*.02)*2;
        ctx.fillStyle="#285e38";ctx.beginPath();ctx.ellipse(o.x+o.w/2,o.y+o.h/2+lift,o.w/2,o.h/2,0,0,Math.PI*2);ctx.fill();
        [[.3,.48,.32],[.58,.36,.34],[.72,.58,.25],[.42,.24,.27],[.18,.66,.22],[.82,.28,.2]].forEach(function(v){var gg=ctx.createRadialGradient(o.x+o.w*v[0]-5,o.y+o.h*v[1]-7,2,o.x+o.w*v[0],o.y+o.h*v[1],o.h*v[2]);gg.addColorStop(0,"#a5e58a");gg.addColorStop(.55,"#5eae58");gg.addColorStop(1,"#28633a");ctx.fillStyle=gg;ctx.beginPath();ctx.arc(o.x+o.w*v[0],o.y+o.h*v[1]-pulse*.15,o.h*v[2],0,Math.PI*2);ctx.fill();});
        ctx.strokeStyle="rgba(225,255,205,.35)";ctx.lineWidth=1.5;for(var leaf=0;leaf<5;leaf++){var lx=o.x+o.w*(.2+leaf*.14),ly=o.y+o.h*(.35+(leaf%2)*.22)-pulse*.15;ctx.beginPath();ctx.moveTo(lx-4,ly+3);ctx.quadraticCurveTo(lx,ly-7,lx+5,ly);ctx.stroke();}
      }
    });
    bullets.forEach(function(b){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.fillStyle="rgba(255,255,255,.5)";ctx.beginPath();ctx.ellipse(-10,0,16,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=b.color;ctx.shadowColor=b.color;ctx.shadowBlur=12;ctx.beginPath();ctx.ellipse(0,0,b.r+4,b.r,0,0,Math.PI*2);ctx.fill();ctx.restore();});
    players.forEach(function(p){if(!p.alive)return;drawFoodHero(p,performance.now());drawFoodWeapon(p);ctx.fillStyle="rgba(24,45,29,.55)";ctx.beginPath();ctx.roundRect(p.x-22,p.y-34,44,6,3);ctx.fill();ctx.fillStyle="#62C96B";ctx.beginPath();ctx.roundRect(p.x-22,p.y-34,44*clamp(p.hp/p.maxHp,0,1),6,3);ctx.fill();ctx.fillStyle="#234B36";ctx.font="bold 12px system-ui";ctx.textAlign="center";ctx.fillText(p.human?"DIG":foods[p.fighter].name,p.x,p.y-48);});
    drawAimGuide();
    particles.forEach(function(p){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=p.r?8:0;ctx.beginPath();ctx.arc(p.x,p.y,p.r||4,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;});floatingTexts.forEach(function(t){ctx.globalAlpha=clamp(t.life/t.max,0,1);ctx.font="900 19px system-ui";ctx.textAlign="center";ctx.lineWidth=4;ctx.strokeStyle="rgba(35,53,35,.8)";ctx.strokeText(t.text,t.x,t.y);ctx.fillStyle=t.color;ctx.fillText(t.text,t.x,t.y);ctx.globalAlpha=1;});ctx.restore();
    drawMinimap();drawStormStatus();
  }
  // Screen-space storm indicator remains readable even if the ring is offscreen.
  function drawStormStatus(){
    if(!running||!me||!me.alive)return;
    var distance=Math.hypot(me.x-zone.x,me.y-zone.y),outside=distance>zone.r;
    var until=Math.max(0,5-elapsed),remaining=Math.max(0,zone.r-260);
    var label=outside?"UDEN FOR ZONEN!":until>0?"ZONEN LUKKER OM "+Math.ceil(until)+"s":remaining>0?"ZONEN KRYMPER":"SIDSTE ZONE";
    var x=22,y=18,w=outside?248:214,h=43;
    ctx.save();ctx.fillStyle=outside?"rgba(113,26,73,.96)":"rgba(29,42,43,.88)";
    ctx.beginPath();ctx.roundRect(x,y,w,h,12);ctx.fill();
    ctx.strokeStyle=outside?"#ff8bb6":"rgba(255,255,255,.18)";ctx.lineWidth=2;ctx.stroke();
    ctx.font="800 14px system-ui";ctx.textAlign="left";ctx.textBaseline="middle";
    ctx.fillStyle=outside?"#fff":"#ffe3f1";ctx.fillText(label,x+13,y+16);
    ctx.fillStyle="#f3a8cc";ctx.fillRect(x+13,y+30,w-26,4);
    ctx.fillStyle="#fff";ctx.fillRect(x+13,y+30,(w-26)*clamp(zone.r/1780,0,1),4);
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
    ctx.fillStyle="#b3d19b";ctx.fillRect(mx+pad,mapTop,mw,mh);
    obstacles.forEach(function(o){
      ctx.fillStyle=o.kind==="wall"?"#64786b":o.kind==="rock"?"#889c8b":"#4d9956";
      ctx.fillRect(mx+pad+o.x/WORLD_W*mw,mapTop+o.y/WORLD_H*mh,Math.max(1,o.w/WORLD_W*mw),Math.max(1,o.h/WORLD_H*mh));
    });
    ctx.strokeStyle="#ff5e9b";ctx.lineWidth=3.5;ctx.beginPath();
    ctx.ellipse(mx+pad+zone.x/WORLD_W*mw,mapTop+zone.y/WORLD_H*mh,zone.r/WORLD_W*mw,zone.r/WORLD_H*mh,0,0,Math.PI*2);ctx.stroke();
    // Only the local player is visible on the minimap.
    var px=mx+pad+me.x/WORLD_W*mw,py=mapTop+me.y/WORLD_H*mh;
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
  function loop(now){if(!running)return;var dt=Math.min((now-last)/1000,.035);last=now;update(dt);draw();if(running)raf=requestAnimationFrame(loop);}
  function setCanvasSize(){
    var rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
    draw();
  }
  var touchMove={x:0,y:0},touchAim={x:0,y:0,active:false},touchFire=false,touchDash=false;
  function joystick(el,kind){
    var active=false,id=null,center=null;
    el.addEventListener("pointerdown",function(e){e.preventDefault();active=true;id=e.pointerId;center={x:e.clientX,y:e.clientY};el.setPointerCapture(id);});
    el.addEventListener("pointermove",function(e){if(!active||e.pointerId!==id)return;e.preventDefault();var dx=e.clientX-center.x,dy=e.clientY-center.y,len=Math.max(1,Math.hypot(dx,dy)),lim=42,nx=dx/len*Math.min(1,len/lim),ny=dy/len*Math.min(1,len/lim);
      el.style.setProperty("--jx",(nx*34)+"px");el.style.setProperty("--jy",(ny*34)+"px");
      if(kind==="move"){touchMove={x:nx,y:ny};}else{var cr=canvas.getBoundingClientRect();touchAim={x:(e.clientX-cr.left)/cr.width*W,y:(e.clientY-cr.top)/cr.height*H,active:true};}
    });
    function end(e){if(!active||e.pointerId!==id)return;active=false;el.style.setProperty("--jx","0px");el.style.setProperty("--jy","0px");if(kind==="move")touchMove={x:0,y:0};else touchAim.active=false;}
    el.addEventListener("pointerup",end);el.addEventListener("pointercancel",end);
  }
  joystick(root.querySelector("#arenaMoveStick"),"move");joystick(root.querySelector("#arenaAimStick"),"aim");
  root.querySelector("#arenaDash").addEventListener("pointerdown",function(e){e.preventDefault();touchDash=true;});
  ["pointerup","pointercancel","pointerleave"].forEach(function(n){root.querySelector("#arenaDash").addEventListener(n,function(){touchDash=false;});});
  root.querySelector("#arenaFire").addEventListener("pointerdown",function(e){e.preventDefault();touchFire=true;});
  ["pointerup","pointercancel","pointerleave"].forEach(function(n){root.querySelector("#arenaFire").addEventListener(n,function(){touchFire=false;});});
  root.querySelector("#arenaFighters").addEventListener("click",function(e){var b=e.target.closest("[data-fighter]");if(b)choose(+b.getAttribute("data-fighter"));});
  root.querySelector("#arenaStart").addEventListener("click",function(){startGame("showdown");});
  root.querySelector("#arenaPractice").addEventListener("click",function(){startGame("practice");});
  root.querySelector("#arenaRestart").addEventListener("click",function(){startGame(mode);});
  root.querySelector("#arenaExitResult").addEventListener("click",function(){root.querySelector("#arenaExit").click();});
  var fullscreenBtn=root.querySelector("#arenaFullscreen");
  function syncFullscreenLabel(){fullscreenBtn.textContent=document.fullscreenElement?"⤢ Afslut fuld skærm":"⛶ Fuld skærm";}
  fullscreenBtn.addEventListener("click",function(){
    var wrap=root.querySelector("#arenaCanvasWrap");
    if(!document.fullscreenElement){var request=wrap.requestFullscreen||wrap.webkitRequestFullscreen;if(request){var result=request.call(wrap);if(result&&result.catch)result.catch(function(){fullscreenBtn.textContent="Fuld skærm ikke tilgængelig";});}}
    else{var leave=document.exitFullscreen||document.webkitExitFullscreen;if(leave)leave.call(document);}
  });
  document.addEventListener("fullscreenchange",syncFullscreenLabel);
  root.querySelector("#arenaExit").addEventListener("click",function(){running=false;cancelAnimationFrame(raf);root.querySelector("#arenaMenu").hidden=false;root.querySelector("#arenaHud").hidden=true;root.querySelector("#arenaResult").hidden=true;root.querySelector("#arenaCanvasWrap").classList.remove("playing");});
  root.querySelector("#arenaOnline").addEventListener("click",function(){root.querySelector("#arenaOnlineInfo").hidden=false;});
  root.querySelector("#arenaOnlineClose").addEventListener("click",function(){root.querySelector("#arenaOnlineInfo").hidden=true;});
  window.addEventListener("keydown",function(e){var k=e.key.toLowerCase();keys[k]=true;if(k==="shift"&&running){e.preventDefault();if(me&&me.alive&&me.dashCooldown<=0){me.dash=.24;me.dashCooldown=1.65;}}if([" ","arrowup","arrowdown","arrowleft","arrowright"].indexOf(k)>-1&&running)e.preventDefault();});
  window.addEventListener("keyup",function(e){keys[e.key.toLowerCase()]=false;});
  canvas.addEventListener("pointermove",function(e){var r=canvas.getBoundingClientRect();pointer.x=(e.clientX-r.left)/r.width*W;pointer.y=(e.clientY-r.top)/r.height*H;pointer.active=true;});
  canvas.addEventListener("pointerdown",function(e){if(e.pointerType==="mouse"){pointer.down=true;canvas.setPointerCapture(e.pointerId);}});
  window.addEventListener("pointerup",function(){pointer.down=false;});
  window.addEventListener("blur",function(){pointer.down=false;touchFire=false;keys=Object.create(null);});
  window.addEventListener("resize",setCanvasSize);
  buildSelect();renderStats();setCanvasSize();
})();