/* RESTEMAD ARENA – spillet */
(function () {
  "use strict";
  var root = document.getElementById("arenaGame");
  if (!root) return;

  var canvas = root.querySelector("#arenaCanvas"), ctx = canvas.getContext("2d");
  var W = 960, H = 600, running = false, mode = "showdown", selected = 0;
  var players = [], bullets = [], particles = [], obstacles = [], last = 0, elapsed = 0;
  var keys = Object.create(null), pointer = {x: W/2, y:H/2, down:false};
  var me = null, winner = null, gameOver = false, raf = 0;
  var statsKey = "restemad-arena-stats-v1";
  var stats = {wins:0, eliminations:0, trophies:0, games:0};
  try { stats = Object.assign(stats, JSON.parse(localStorage.getItem(statsKey)||"{}")); } catch(e) {}
  var foods = [
    {name:"Bananpandekage", emoji:"🥞", color:"#F2C14E", hp:115, speed:205, damage:13, rate:.19, spread:0, count:1, range:430, desc:"Hurtige, præcise pandekageskud – som en hurtig maskingeværskytte."},
    {name:"Grøntsagswrap", emoji:"🌯", color:"#5BA66A", hp:155, speed:172, damage:24, rate:.58, spread:.12, count:1, range:350, desc:"Kraftige grøntsagsskud med kortere rækkevidde og højere skade."},
    {name:"Pastasalat", emoji:"🥗", color:"#E58A48", hp:135, speed:185, damage:11, rate:.72, spread:.32, count:5, range:330, desc:"Kaster en vifte af fem pastastykker – bedst på tæt hold."},
    {name:"Hjemmelavede croutoner", emoji:"🥖", color:"#B98A55", hp:125, speed:195, damage:17, rate:.43, spread:.08, count:2, range:390, desc:"Skyder to sprøde croutoner ad gangen."}
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
      return '<button type="button" class="arena-fighter'+(i===selected?" chosen":"")+'" data-fighter="'+i+'" aria-pressed="'+(i===selected)+'"><span class="fighter-emoji">'+f.emoji+'</span><b>'+f.name+'</b><small>'+f.hp+' liv · '+(f.damage*f.count)+' skade pr. salve</small></button>';
    }).join("");
    root.querySelector("#arenaFighterDesc").textContent=foods[selected].desc;
  }
  function makeMap(){
    obstacles=[];
    for(var i=0;i<15;i++){
      var x=rand(110,W-110),y=rand(90,H-90);
      if(Math.hypot(x-W/2,y-H/2)<110){i--;continue;}
      obstacles.push({x:x,y:y,w:rand(36,80),h:rand(30,66),bush:Math.random()<.35});
    }
  }
  function freeSpot(){
    var p;
    for(var i=0;i<100;i++){
      p={x:rand(55,W-55),y:rand(65,H-65)};
      if(!obstacles.some(function(o){return p.x>o.x-35&&p.x<o.x+o.w+35&&p.y>o.y-35&&p.y<o.y+o.h+35;}))return p;
    }
    return p;
  }
  function spawn(i,isHuman){
    var f=foods[i],p=freeSpot();
    return {x:p.x,y:p.y,r:19,hp:f.hp,maxHp:f.hp,fighter:i,color:f.color,emoji:f.emoji,name:isHuman?"Dig":f.name,bot:!isHuman,human:!!isHuman,alive:true,angle:rand(0,Math.PI*2),cool:rand(0,.6),speed:f.speed,damage:f.damage,rate:f.rate,spread:f.spread,count:f.count,range:f.range,ai:rand(.4,1.2),target:null,kills:0};
  }
  function startGame(which){
    mode=which; players=[];bullets=[];particles=[];elapsed=0;winner=null;gameOver=false;
    makeMap(); me=spawn(selected,true);players.push(me);
    for(var i=0;i<9;i++)players.push(spawn(Math.floor(Math.random()*foods.length),false));
    root.querySelector("#arenaMenu").hidden=true;root.querySelector("#arenaHud").hidden=false;
    root.querySelector("#arenaCanvasWrap").classList.add("playing");
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
    var nx=clamp(p.x+dx*p.speed*dt,p.r,W-p.r),ny=clamp(p.y+dy*p.speed*dt,p.r,H-p.r);
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
        var target=isTouch()?touchAim: pointer;
        if(target.active){p.angle=Math.atan2(target.y-(p.y/H*canvas.clientHeight),target.x-(p.x/W*canvas.clientWidth));}
        else p.angle=Math.atan2(pointer.y-p.y,pointer.x-p.x);
        if(pointer.down||keys[" "]||touchFire)shoot(p,p.angle);
      }else{
        p.ai-=dt;
        if(p.ai<=0){p.target=nearest(p);p.ai=rand(.35,.8);}
        var t=p.target&&p.target.alive?p.target:nearest(p);
        if(t){
          var a=Math.atan2(t.y-p.y,t.x-p.x),d=dist(p,t);p.angle=a;
          var strafe=Math.sin(elapsed*1.6+p.x*.02)*.55;
          var mx=0,my=0;
          if(d>220){mx=Math.cos(a);my=Math.sin(a);}else if(d<125){mx=-Math.cos(a);my=-Math.sin(a);}
          movePlayer(p,mx-Math.sin(a)*strafe,my+Math.cos(a)*strafe,dt);
          if(d<p.range*.9&&Math.random()<.9)shoot(p,a+rand(-.12,.12));
        }
      }
    });
    bullets=bullets.filter(function(b){
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
      var wall=obstacles.some(function(o){return b.x>o.x&&b.x<o.x+o.w&&b.y>o.y&&b.y<o.y+o.h;});
      if(b.life<=0||b.x<0||b.x>W||b.y<0||b.y>H||wall)return false;
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
  function draw(){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle="#dcebd8";ctx.fillRect(0,0,W,H);
    ctx.strokeStyle="rgba(55,105,68,.10)";ctx.lineWidth=1;
    for(var x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(var y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    obstacles.forEach(function(o){
      ctx.fillStyle=o.bush?"#8fbd78":"#a7c59a";ctx.strokeStyle=o.bush?"#6c9b5d":"#8cab80";ctx.lineWidth=3;
      ctx.beginPath();ctx.roundRect(o.x,o.y,o.w,o.h,12);ctx.fill();ctx.stroke();
      if(o.bush){ctx.fillStyle="rgba(48,110,51,.35)";for(var i=0;i<5;i++){ctx.beginPath();ctx.arc(o.x+rand(5,o.w-5),o.y+rand(5,o.h-5),5,0,Math.PI*2);ctx.fill();}}
    });
    bullets.forEach(function(b){ctx.fillStyle=b.color;ctx.shadowColor=b.color;ctx.shadowBlur=9;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;});
    players.forEach(function(p){
      if(!p.alive)return;
      ctx.save();ctx.translate(p.x,p.y);
      ctx.fillStyle="rgba(25,55,34,.18)";ctx.beginPath();ctx.ellipse(0,13,19,7,0,0,Math.PI*2);ctx.fill();
      ctx.rotate(p.angle);ctx.fillStyle=p.color;ctx.beginPath();ctx.roundRect(3,-7,25,14,7);ctx.fill();ctx.restore();
      ctx.fillStyle=p.color;ctx.strokeStyle="#fff";ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.font="22px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(p.emoji,p.x,p.y);
      ctx.fillStyle="#304331";ctx.fillRect(p.x-20,p.y-31,40,5);ctx.fillStyle="#68b95e";ctx.fillRect(p.x-20,p.y-31,40*clamp(p.hp/p.maxHp,0,1),5);
      if(p.human){ctx.fillStyle="#234B36";ctx.font="bold 12px system-ui";ctx.fillText("DIG",p.x,p.y-43);}
    });
    particles.forEach(function(p){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;});
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
      if(kind==="move"){touchMove={x:nx,y:ny};}else{touchAim={x:e.clientX,y:e.clientY,active:true};}
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
  root.querySelector("#arenaExit").addEventListener("click",function(){running=false;cancelAnimationFrame(raf);root.querySelector("#arenaMenu").hidden=false;root.querySelector("#arenaHud").hidden=true;root.querySelector("#arenaResult").hidden=true;root.querySelector("#arenaCanvasWrap").classList.remove("playing");});
  root.querySelector("#arenaOnline").addEventListener("click",function(){root.querySelector("#arenaOnlineInfo").hidden=false;});
  root.querySelector("#arenaOnlineClose").addEventListener("click",function(){root.querySelector("#arenaOnlineInfo").hidden=true;});
  window.addEventListener("keydown",function(e){var k=e.key.toLowerCase();keys[k]=true;if([" ","arrowup","arrowdown","arrowleft","arrowright"].indexOf(k)>-1&&running)e.preventDefault();});
  window.addEventListener("keyup",function(e){keys[e.key.toLowerCase()]=false;});
  canvas.addEventListener("pointermove",function(e){var r=canvas.getBoundingClientRect();pointer.x=(e.clientX-r.left)/r.width*W;pointer.y=(e.clientY-r.top)/r.height*H;});
  canvas.addEventListener("pointerdown",function(e){if(e.pointerType==="mouse"){pointer.down=true;canvas.setPointerCapture(e.pointerId);}});
  window.addEventListener("pointerup",function(){pointer.down=false;});
  window.addEventListener("blur",function(){pointer.down=false;touchFire=false;keys=Object.create(null);});
  window.addEventListener("resize",setCanvasSize);
  buildSelect();renderStats();setCanvasSize();
})();