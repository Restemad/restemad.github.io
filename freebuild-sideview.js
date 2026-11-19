/* Standalone side-view Freebuild: Solo arena.js is unchanged. */
(()=>{"use strict";const root=document.querySelector("#arenaGame");if(!root)return;
const wrap=root.querySelector("#arenaCanvasWrap"),menu=root.querySelector("#arenaMenu"),hud=root.querySelector("#arenaHud"),exit=root.querySelector("#arenaExit"),start=root.querySelector("#arenaFreebuild");
const cv=document.createElement("canvas");cv.width=960;cv.height=600;cv.style.cssText="position:absolute;inset:0;width:100%;height:100%;z-index:19;display:none;touch-action:none";wrap.appendChild(cv);
const c=cv.getContext("2d"),T=104;let live=false,frameId=0,last=0,keys={},pieces=new Map(),p={x:0,y:445,vy:0,ground:true},camX=0,aim={x:480,y:300},editing=null,selected=new Set(),drag=false;
const help=document.createElement("div");help.style.cssText="position:absolute;left:12px;top:12px;z-index:21;background:#182a2de8;color:white;padding:10px;border-radius:9px;font:13px system-ui;display:none";help.innerHTML="<b>FREEBUILD · SIDE VIEW</b><div>A/D move · W/Space jump · Q wall · X floor · F stair · C cone · G edit · R reset</div><div>Edit: click/drag quadrants · Enter/G confirm · Esc cancel</div>";wrap.appendChild(help);
const bind=()=>{try{return Object.assign({wall:"q",floor:"x",stair:"f",cone:"c",edit:"g"},JSON.parse(localStorage.getItem("restemad-build-binds-v1")||"{}"))}catch{return {wall:"q",floor:"x",stair:"f",cone:"c",edit:"g"}}};
function target(){return {x:Math.floor((aim.x+camX)/T),y:Math.floor(aim.y/T)}}
function nearby(b){return Math.abs(b.x*T-p.x)<T*3&&Math.abs(b.y*T-p.y)<T*3}
function place(type){if(!live||editing)return;let t=target();if(!nearby(t))return;let k=t.x+","+t.y+","+type;pieces.set(k,{...t,type,mask:[1,1,1,1],flip:p.x>t.x*T+T/2})}
function pick(){let t=target(),best=null,d=Infinity;for(let b of pieces.values()){let dd=Math.hypot(b.x-t.x,b.y-t.y);if(dd<d){best=b;d=dd}}return d<=1.5?best:null}
function edit(){if(editing){confirm();return}editing=pick();selected.clear()}
function confirm(){if(!editing)return;for(let i of selected)editing.mask[i]=1-editing.mask[i];editing=null;selected.clear()}
function reset(){let b=pick();if(b)b.mask=[1,1,1,1]}
function jump(){if(p.ground){p.vy=-650;p.ground=false}}
function surface(b,x){let u=(x-b.x*T)/T;if(u<0||u>1)return null;if(b.type==="floor")return b.y*T;if(b.type==="stair")return b.y*T+(b.flip?u:1-u)*T;if(b.type==="cone")return b.y*T+Math.abs(u-.5)*T;return null}
function update(dt){let dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),oldX=p.x,oldFoot=p.y+24;p.x+=dx*330*dt;p.vy=Math.min(1100,p.vy+1600*dt);p.y+=p.vy*dt;p.ground=false;
for(let b of pieces.values()){let bx=b.x*T,by=b.y*T;
if(b.type==="wall"){if(p.x+14>bx&&p.x-14<bx+T&&p.y+24>by&&p.y-24<by+T){let col=Math.max(0,Math.min(1,Math.floor((p.x-bx)/(T/2)))),row=Math.max(0,Math.min(1,Math.floor((p.y-by)/(T/2))));if(!b.mask[row*2+col])continue;if(oldX+14<=bx)p.x=bx-14;else if(oldX-14>=bx+T)p.x=bx+T+14;else if(oldFoot<=by&&p.vy>=0){p.y=by-24;p.vy=0;p.ground=true}}}
else{let sy=surface(b,p.x);if(sy!==null&&p.vy>=0&&oldFoot<=sy+22&&p.y+24>=sy){p.y=sy-24;p.vy=0;p.ground=true}}}
if(p.y+24>=470){p.y=446;p.vy=0;p.ground=true}camX=p.x-480}
function render(){c.fillStyle="#77797b";c.fillRect(0,0,960,600);c.strokeStyle="#919397";for(let x=-(camX%T+T)%T;x<960;x+=T){c.beginPath();c.moveTo(x,0);c.lineTo(x,600);c.stroke()}for(let y=0;y<600;y+=T){c.beginPath();c.moveTo(0,y);c.lineTo(960,y);c.stroke()}c.fillStyle="#53575b";c.fillRect(0,470,960,130);
for(let b of pieces.values()){let x=b.x*T-camX,y=b.y*T;c.fillStyle=b.type==="cone"?"#e99a63":"#24d4cc";c.strokeStyle="#f4a36b";c.lineWidth=3;
if(b.type==="stair"||b.type==="cone"){c.beginPath();if(b.type==="stair"){c.moveTo(x,y+T);c.lineTo(x+T,y);c.lineTo(x+T,y+T)}else{c.moveTo(x,y+T);c.lineTo(x+T/2,y);c.lineTo(x+T,y+T)}c.closePath();c.fill();c.stroke();for(let i=1;i<5;i++){c.beginPath();c.moveTo(x,y+i*T/5);c.lineTo(x+T,y+i*T/5);c.stroke()}}
else for(let i=0;i<4;i++){if(!b.mask[i])continue;let xx=x+(i%2)*T/2,yy=y+Math.floor(i/2)*T/2;c.fillRect(xx,yy,T/2,T/2);c.strokeRect(xx,yy,T/2,T/2);c.beginPath();c.moveTo(xx,yy+T/4);c.lineTo(xx+T/2,yy+T/4);c.stroke()}
}
c.fillStyle="#203c43";c.fillRect(465,p.y-24,30,48);c.fillStyle="#f3bd9a";c.beginPath();c.arc(480,p.y-36,15,0,Math.PI*2);c.fill();
if(editing){let x=editing.x*T-camX,y=editing.y*T;for(let i=0;i<4;i++){c.fillStyle=selected.has(i)?"#ffca5d99":"#ffffff33";c.fillRect(x+(i%2)*T/2,y+Math.floor(i/2)*T/2,T/2,T/2);c.strokeStyle="white";c.strokeRect(x+(i%2)*T/2,y+Math.floor(i/2)*T/2,T/2,T/2)}}else{let t=target();if(nearby(t)){c.strokeStyle="#ffffffaa";c.strokeRect(t.x*T-camX,t.y*T,T,T)}}}
function loop(now){if(!live)return;update(Math.min(.035,(now-last)/1000||.016));last=now;render();frameId=requestAnimationFrame(loop)}
function open(e){e.preventDefault();e.stopImmediatePropagation();live=true;pieces.clear();keys={};p={x:0,y:446,vy:0,ground:true};camX=-480;aim={x:480,y:300};menu.hidden=true;hud.hidden=false;wrap.classList.add("playing");root.querySelector("#arenaResult").hidden=true;root.querySelector("#arenaTouch").hidden=true;root.querySelector("#arenaBuildTouch").hidden=true;root.querySelector("#arenaEditPanel").hidden=true;root.querySelector("#arenaModeLabel").textContent="FREEBUILD · SIDE VIEW";root.querySelector("#arenaHint").textContent="A/D · W/Space · Q/X/F/C · G edit";cv.style.display="block";help.style.display="block";wrap.style.position="relative";cv.style.height="100%";last=performance.now();frameId=requestAnimationFrame(loop)}
function close(e){if(!live)return;e.preventDefault();e.stopImmediatePropagation();live=false;cancelAnimationFrame(frameId);cv.style.display="none";help.style.display="none";wrap.classList.remove("playing");menu.hidden=false;hud.hidden=true;keys={}}
start.addEventListener("click",open,true);exit.addEventListener("click",close,true);
window.addEventListener("keydown",e=>{if(!live||e.target&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;let k=e.key.toLowerCase();keys[k]=true;if([" ","arrowup","arrowleft","arrowright"].includes(k))e.preventDefault();if(e.repeat)return;if([" ","w","arrowup"].includes(k))jump();if(k==="escape"){editing=null;selected.clear()}if(k==="enter")confirm();if(k==="r")reset();let b=bind();for(let type of ["wall","floor","stair","cone","edit"])if(k===b[type]){type==="edit"?edit():place(type);break}},true);
window.addEventListener("keyup",e=>{if(live)keys[e.key.toLowerCase()]=false},true);
function mark(){if(!editing)return;let u=(aim.x+camX-editing.x*T)/T,v=(aim.y-editing.y*T)/T;if(u>=0&&u<1&&v>=0&&v<1)selected.add((v>=.5?2:0)+(u>=.5?1:0))}
cv.addEventListener("pointermove",e=>{let r=cv.getBoundingClientRect();aim={x:(e.clientX-r.left)*960/r.width,y:(e.clientY-r.top)*600/r.height};if(drag)mark()});cv.addEventListener("pointerdown",e=>{e.preventDefault();drag=true;mark()});window.addEventListener("pointerup",()=>drag=false);
})();