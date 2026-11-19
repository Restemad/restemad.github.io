/* RESTEMAD ARENA – spillet */
(function () {
  "use strict";
  var root = document.getElementById("arenaGame");
  if (!root) return;

  var canvas = root.querySelector("#arenaCanvas"), ctx = canvas.getContext("2d");
  var W = 960, H = 600, WORLD_W = 3800, WORLD_H = 2400, camera = {x:0,y:0}, running = false, mode = "showdown", selected = 0;
  var players = [], bullets = [], particles = [], obstacles = [], last = 0, elapsed = 0;
  var keys = Object.create(null), pointer = {x: W/2, y:H/2, down:false};
  var me = null, winner = null, gameOver = false, raf = 0;
  var statsKey = "restemad-arena-stats-v1";
  var stats = {wins:0, eliminations:0, trophies:0, games:0};
  try { stats = Object.assign(stats, JSON.parse(localStorage.getItem(statsKey)||"{}")); } catch(e) {}
  var foods = [
    {name:"Bananpandekage", color:"#E8B84F", hp:125, speed:128, damage:13, rate:.25, spread:0, count:1, range:540, desc:"Hurtige, præcise pandekageskud – som en hurtig maskingeværskytte."},
    {name:"Grøntsagswrap", color:"#5BA66A", hp:175, speed:112, damage:25, rate:.72, spread:.08, count:1, range:440, desc:"Kraftige grøntsagsskud med kortere rækkevidde og højere skade."},
    {name:"Pastasalat", color:"#E58A48", hp:145, speed:118, damage:10, rate:.82, spread:.42, count:5, range:390, desc:"Kaster en vifte af fem pastastykker – bedst på tæt hold."},
    {name:"Hjemmelavede croutoner", color:"#B98A55", hp:145, speed:120, damage:19, rate:.58, spread:.10, count:2, range:470, desc:"Skyder to sprøde croutoner ad gangen."}
  ];
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function rand(a,b){return a+Math.random()*(b-a);}
  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
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
  function freeSpot(away){
    var p;for(var i=0;i<240;i++){p={x:rand(130,WORLD_W-130),y:rand(130,WORLD_H-130)};var clear=!obstacles.some(function(o){return p.x>o.x-55&&p.x<o.x+o.w+55&&p.y>o.y-55&&p.y<o.y+o.h+55;});if(clear&&(!away||Math.hypot(p.x-away.x,p.y-away.y)>850))return p;}return p;
  }
  function spawn(i,isHuman){
    var f=foods[i],p=freeSpot(isHuman?null:me);
    return {x:p.x,y:p.y,r:19,hp:f.hp,maxHp:f.hp,fighter:i,color:f.color,name:isHuman?"Dig":f.name,bot:!isHuman,human:!!isHuman,alive:true,angle:rand(0,Math.PI*2),cool:rand(0,.6),speed:f.speed,damage:f.damage,rate:f.rate,spread:f.spread,count:f.count,range:f.range,ai:rand(.4,1.2),target:null,kills:0};
  }
  function startGame(which){
    mode=which; players=[];bullets=[];particles=[];elapsed=0;winner=null;gameOver=false;
    makeMap(); me=spawn(selected,true);players.push(me);
    var sectors=[[350,320],[1850,300],[3450,320],[350,1200],[1850,1200],[3450,1200],[350,2100],[1850,2100],[3450,2100]];
    for(var i=0;i<9;i++){
      var f=Math.floor(Math.random()*foods.length),p=freeSpot(me),sx=sectors[i][0],sy=sectors[i][1];
      for(var tries=0;tries<100;tries++){
        var test={x:clamp(sx+rand(-240,240),120,WORLD_W-120),y:clamp(sy+rand(-190,190),120,WORLD_H-120)};
        if(!obstacles.some(function(o){return test.x>o.x-50&&test.x<o.x+o.w+50&&test.y>o.y-50&&test.y<o.y+o.h+50;})&&players.every(function(q){return Math.hypot(q.x-test.x,q.y-test.y)>540;})){p=test;break;}
      }
      var food=foods[f];players.push({x:p.x,y:p.y,r:19,hp:food.hp,maxHp:food.hp,fighter:f,color:food.color,name:food.name,bot:true,human:false,alive:true,angle:rand(0,Math.PI*2),cool:rand(.4,1.2),speed:food.speed,damage:food.damage,rate:food.rate,spread:food.spread,count:food.count,range:food.range,ai:rand(.8,1.8),target:null,kills:0});
    }
    root.querySelector("#arenaMenu").hidden=true;root.querySelector("#arenaHud").hidden=false;
    root.querySelector("#arenaCanvasWrap").classList.add("playing");setCanvasSize();
    root.querySelector("#arenaResult").hidden=true;
    root.querySelector("#arenaTouch").hidden=!isTouch();
    root.querySelector("#arenaModeLabel").textContent=which==="showdown"?"SOLO SHOWDOWN":"TRÆNING";
    root.querySelector("#arenaHint").textContent=isTouch()?"Venstre joystick: bevæg · Højre joystick: sigt · SKUD: affyr":"WASD: bevæg · Mus: sigt · Venstreklik: skyd";
    running=true;last=performance.now();cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);
  }
  function isTouch(){return window.matchMedia("(pointer: coarse)").matches||navigator.maxTouchPoints>0;}
  function shoot(p,angle){
    var f=foods[p.fighter]; if(p.cool>0||!p.alive)return;
    p.cool=p.rate;
    for(var i=0;i<p.count;i++){
      var a=angle+(i-(p.count-1)/2)*p.spread;
      bullets.push({x:p.x+Math.cos(a)*22,y:p.y+Math.sin(a)*22,vx:Math.cos(a)*470,vy:Math.sin(a)*470,owner:p,damage:p.damage,life:p.range/470,r: p.fighter===2?5:6,color:p.color});
    }
    for(var j=0;j<4;j++)particles.push({x:p.x,y:p.y,vx:rand(-45,45),vy:rand(-45,45),life:.2,color:p.color});
  }
  function nearest(p){
    var best=null,bd=Infinity;
    players.forEach(function(q){if(q!==p&&q.alive){var d=dist(p,q);if(d<bd){bd=d;best=q;}}});
    return best;
  }
  function movePlayer(p,dx,dy,dt){
    var len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len;}
    var nx=clamp(p.x+dx*p.speed*dt,p.r,WORLD_W-p.r),ny=clamp(p.y+dy*p.speed*dt,p.r,WORLD_H-p.r);
    var hit=obstacles.some(function(o){return nx+p.r>o.x&&nx-p.r<o.x+o.w&&ny+p.r>o.y&&ny-p.r<o.y+o.h;});
    if(!hit){p.x=nx;p.y=ny;}else{
      if(!obstacles.some(function(o){return nx+p.r>o.x&&nx-p.r<o.x+o.w&&p.y+p.r>o.y&&p.y-p.r<o.y+o.h;}))p.x=nx;
      if(!obstacles.some(function(o){return p.x+p.r>o.x&&p.x-p.r<o.x+o.w&&ny+p.r>o.y&&ny-p.r<o.y+o.h;}))p.y=ny;
    }
  }
  function update(dt){
    elapsed+=dt;
    players.forEach(function(p){
      if(!p.alive)return;p.cool=Math.max(0,p.cool-dt);
      if(p.human){
        var dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
        var dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);
        if(isTouch()){dx=touchMove.x;dy=touchMove.y;}
        movePlayer(p,dx,dy,dt);
        var target=isTouch()?touchAim:pointer;
        if(target.active){p.angle=Math.atan2(target.y+camera.y-p.y,target.x+camera.x-p.x);}
        else p.angle=Math.atan2(pointer.y+camera.y-p.y,pointer.x+camera.x-p.x);
        if(pointer.down||keys[" "]||touchFire)shoot(p,p.angle);
      }else{
        p.ai-=dt;
        if(p.ai<=0){p.target=nearest(p);p.ai=rand(.55,1.05);}
        var t=p.target&&p.target.alive?p.target:nearest(p);
        if(t){
          var a=Math.atan2(t.y-p.y,t.x-p.x),d=dist(p,t);p.angle=a;
          var strafe=Math.sin(elapsed*1.6+p.x*.02)*.55;
          var mx=0,my=0;
          if(d>300){mx=Math.cos(a);my=Math.sin(a);}else if(d<220){mx=-Math.cos(a);my=-Math.sin(a);}
          movePlayer(p,mx-Math.sin(a)*strafe,my+Math.cos(a)*strafe,dt);
          if(d<p.range*.82&&Math.random()<.48)shoot(p,a+rand(-.055,.055));
        }
      }
    });
    bullets=bullets.filter(function(b){
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
      var wall=obstacles.some(function(o){return b.x>o.x&&b.x<o.x+o.w&&b.y>o.y&&b.y<o.y+o.h;});
      if(b.life<=0||b.x<0||b.x>WORLD_W||b.y<0||b.y>WORLD_H||wall)return false;
      var hit=null;
      for(var i=0;i<players.length;i++){var p=players[i];if(p.alive&&p!==b.owner&&Math.hypot(p.x-b.x,p.y-b.y)<p.r+b.r){hit=p;break;}}
      if(hit){hit.hp-=b.damage;if(hit.hp<=0){hit.hp=0;hit.alive=false;b.owner.kills++;if(b.owner===me){stats.eliminations++;saveStats();}for(var k=0;k<12;k++)particles.push({x:hit.x,y:hit.y,vx:rand(-120,120),vy:rand(-120,120),life:rand(.25,.65),color:hit.color});}return false;}
      return true;
    });
    particles=particles.filter(function(p){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;return p.life>0;});
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
    var walk=running?Math.sin(now*.012+p.x*.01)*3:0;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.fillStyle="rgba(25,55,34,.22)";ctx.beginPath();ctx.ellipse(0,16,22,8,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#554331";ctx.lineWidth=5;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(-7,12);ctx.lineTo(-9+walk,22);ctx.moveTo(7,12);ctx.lineTo(9-walk,22);ctx.stroke();ctx.beginPath();ctx.moveTo(-12,-2);ctx.lineTo(-20,-7-walk*.5);ctx.moveTo(12,-2);ctx.lineTo(20,-7+walk*.5);ctx.stroke();
    if(p.fighter===0){ctx.fillStyle="#B8792E";ctx.beginPath();ctx.ellipse(0,3,19,13,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#F3C45E";ctx.beginPath();ctx.ellipse(0,-3,19,12,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#FFE39A";ctx.beginPath();ctx.ellipse(0,-9,16,8,0,0,Math.PI*2);ctx.fill();}
    else if(p.fighter===1){ctx.fillStyle="#D6A85F";ctx.beginPath();ctx.ellipse(0,0,18,14,-.25,0,Math.PI*2);ctx.fill();ctx.fillStyle="#6EAB55";ctx.beginPath();ctx.ellipse(1,-1,13,9,-.25,0,Math.PI*2);ctx.fill();ctx.fillStyle="#E85D4A";ctx.beginPath();ctx.arc(-5,-3,4,0,Math.PI*2);ctx.fill();}
    else if(p.fighter===2){ctx.fillStyle="#E9A45D";ctx.beginPath();ctx.moveTo(-18,-7);ctx.lineTo(18,-7);ctx.lineTo(12,11);ctx.quadraticCurveTo(0,19,-12,11);ctx.closePath();ctx.fill();ctx.fillStyle="#F7D18A";ctx.beginPath();ctx.ellipse(0,-8,19,9,0,0,Math.PI*2);ctx.fill();[[-9,-9,"#E66C43"],[0,-13,"#68A95C"],[9,-7,"#D85C42"]].forEach(function(q){ctx.fillStyle=q[2];ctx.beginPath();ctx.arc(q[0],q[1],4,0,Math.PI*2);ctx.fill();});}
    else{ctx.fillStyle="#9A6537";ctx.beginPath();ctx.roundRect(-16,-15,32,29,7);ctx.fill();ctx.fillStyle="#E5B66D";ctx.beginPath();ctx.roundRect(-12,-13,24,22,5);ctx.fill();}
    ctx.fillStyle="#302B26";ctx.beginPath();ctx.arc(-6,-2,2.2,0,Math.PI*2);ctx.arc(6,-2,2.2,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#302B26";ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(0,2,4,.15,Math.PI-.15);ctx.stroke();ctx.restore();
  }
  function draw(){
    ctx.clearRect(0,0,W,H);if(me){camera.x=clamp(me.x-W/2,0,WORLD_W-W);camera.y=clamp(me.y-H/2,0,WORLD_H-H);}ctx.save();ctx.translate(-camera.x,-camera.y);
    ctx.fillStyle="#B9D89B";ctx.fillRect(camera.x,camera.y,W,H);
    ctx.strokeStyle="rgba(75,125,65,.12)";ctx.lineWidth=2;for(var x=Math.floor(camera.x/90)*90;x<camera.x+W+90;x+=90){for(var y=Math.floor(camera.y/90)*90;y<camera.y+H+90;y+=90){ctx.beginPath();ctx.arc(x+17,y+21,2,0,Math.PI*2);ctx.stroke();}}
    obstacles.forEach(function(o){if(o.kind==="wall"){ctx.fillStyle="#8D9B83";ctx.strokeStyle="#65755F";ctx.lineWidth=5;ctx.beginPath();ctx.roundRect(o.x,o.y,o.w,o.h,10);ctx.fill();ctx.stroke();}else if(o.kind==="rock"){ctx.fillStyle="#8D9D91";ctx.strokeStyle="#63766A";ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(o.x+o.w/2,o.y+o.h/2,o.w/2,o.h/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();}else{ctx.fillStyle="#3F884D";ctx.beginPath();ctx.ellipse(o.x+o.w/2,o.y+o.h/2,o.w/2,o.h/2,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#65A95C";ctx.beginPath();ctx.arc(o.x+o.w*.34,o.y+o.h*.42,o.h*.25,0,Math.PI*2);ctx.arc(o.x+o.w*.65,o.y+o.h*.48,o.h*.23,0,Math.PI*2);ctx.fill();}});
    bullets.forEach(function(b){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.fillStyle="rgba(255,255,255,.45)";ctx.beginPath();ctx.ellipse(-8,0,12,4,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=b.color;ctx.shadowColor=b.color;ctx.shadowBlur=12;ctx.beginPath();ctx.ellipse(0,0,b.r+4,b.r,0,0,Math.PI*2);ctx.fill();ctx.restore();});
    players.forEach(function(p){if(!p.alive)return;drawFoodHero(p,performance.now());ctx.fillStyle="rgba(24,45,29,.55)";ctx.fillRect(p.x-22,p.y-34,44,6);ctx.fillStyle="#62C96B";ctx.fillRect(p.x-22,p.y-34,44*clamp(p.hp/p.maxHp,0,1),6);if(p.human){ctx.fillStyle="#234B36";ctx.font="bold 12px system-ui";ctx.textAlign="center";ctx.fillText("DIG",p.x,p.y-45);}});
    particles.forEach(function(p){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;});ctx.restore();
  }
  function loop(now){if(!running)return;var dt=Math.min((now-last)/1000,.035);last=now;update(dt);draw();if(running)raf=requestAnimationFrame(loop);}
  function setCanvasSize(){
    var rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
    draw();
  }
  var touchMove={x:0,y:0},touchAim={x:0,y:0,active:false},touchFire=false;
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
  root.querySelector("#arenaFire").addEventListener("pointerdown",function(e){e.preventDefault();touchFire=true;});
  ["pointerup","pointercancel","pointerleave"].forEach(function(n){root.querySelector("#arenaFire").addEventListener(n,function(){touchFire=false;});});
  root.querySelector("#arenaFighters").addEventListener("click",function(e){var b=e.target.closest("[data-fighter]");if(b)choose(+b.getAttribute("data-fighter"));});
  root.querySelector("#arenaStart").addEventListener("click",function(){startGame("showdown");});
  root.querySelector("#arenaPractice").addEventListener("click",function(){startGame("practice");});
  root.querySelector("#arenaRestart").addEventListener("click",function(){startGame(mode);});
  root.querySelector("#arenaExitResult").addEventListener("click",function(){root.querySelector("#arenaExit").click();});
  root.querySelector("#arenaExit").addEventListener("click",function(){running=false;cancelAnimationFrame(raf);root.querySelector("#arenaMenu").hidden=false;root.querySelector("#arenaHud").hidden=true;root.querySelector("#arenaResult").hidden=true;root.querySelector("#arenaCanvasWrap").classList.remove("playing");});
  root.querySelector("#arenaOnline").addEventListener("click",function(){root.querySelector("#arenaOnlineInfo").hidden=false;});
  root.querySelector("#arenaOnlineClose").addEventListener("click",function(){root.querySelector("#arenaOnlineInfo").hidden=true;});
  window.addEventListener("keydown",function(e){var k=e.key.toLowerCase();keys[k]=true;if([" ","arrowup","arrowdown","arrowleft","arrowright"].indexOf(k)>-1&&running)e.preventDefault();});
  window.addEventListener("keyup",function(e){keys[e.key.toLowerCase()]=false;});
  canvas.addEventListener("pointermove",function(e){var r=canvas.getBoundingClientRect();pointer.x=(e.clientX-r.left)/r.width*W;pointer.y=(e.clientY-r.top)/r.height*H;pointer.active=true;});
  canvas.addEventListener("pointerdown",function(e){if(e.pointerType==="mouse"){pointer.down=true;canvas.setPointerCapture(e.pointerId);}});
  window.addEventListener("pointerup",function(){pointer.down=false;});
  window.addEventListener("blur",function(){pointer.down=false;touchFire=false;keys=Object.create(null);});
  window.addEventListener("resize",setCanvasSize);
  buildSelect();renderStats();setCanvasSize();
})();