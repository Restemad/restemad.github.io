/* Standalone side-view Freebuild: Solo arena.js is unchanged. */
(()=>{"use strict";const root=document.querySelector("#arenaGame");if(!root)return;
const wrap=root.querySelector("#arenaCanvasWrap"),menu=root.querySelector("#arenaMenu"),hud=root.querySelector("#arenaHud"),exit=root.querySelector("#arenaExit"),start=root.querySelector("#arenaFreebuild");
const cv=document.createElement("canvas");cv.width=960;cv.height=600;cv.style.cssText="position:absolute;inset:0;width:100%;height:100%;z-index:19;display:none;touch-action:none";wrap.appendChild(cv);
const c=cv.getContext("2d"),T=104;let live=false,frameId=0,last=0,keys={},pieces=new Map(),p={x:0,y:445,vy:0,ground:true},camX=0,camY=0,aim={x:480,y:300},editing=null,selected=new Set(),drag=false,selectedBuild=null,turboAt=0;
const help=document.createElement("div");help.style.cssText="position:absolute;left:12px;top:12px;z-index:21;background:#182a2de8;color:white;padding:10px;border-radius:9px;font:13px system-ui;display:none";help.innerHTML="<b>FREEBUILD · SIDE VIEW</b><div>A/D move · W/Space jump · Q/X/F/C select build · HOLD CLICK for Turbo Build · G edit · R reset</div><div>Simple Edit: G vælg væg · klik nederst = døråbning, øverst = øvre åbning · R reset</div>";wrap.appendChild(help);

// iPad/touch controls stay inside Freebuild and never alter Solo controls.
const touchUI=document.createElement("div");touchUI.style.cssText="position:absolute;left:8px;right:8px;bottom:12px;z-index:23;display:none;justify-content:space-between;align-items:flex-end;pointer-events:none;gap:8px";
wrap.appendChild(touchUI);
function touchBtn(label,fn,hold){const b=document.createElement("button");b.type="button";b.textContent=label;b.style.cssText="pointer-events:auto;touch-action:none;min-width:44px;min-height:44px;padding:8px;border:2px solid #87ded7;border-radius:9px;background:#193a42e8;color:white;font-weight:800";b.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();if(hold){keys[hold]=true;b.setPointerCapture(e.pointerId)}else fn()});if(hold){const release=()=>keys[hold]=false;b.addEventListener("pointerup",release);b.addEventListener("pointercancel",release);b.addEventListener("lostpointercapture",release)}return b}
const movePad=document.createElement("div"),buildPad=document.createElement("div");for(const el of [movePad,buildPad])el.style.cssText="display:flex;flex-wrap:wrap;gap:5px;max-width:48%;pointer-events:none";
movePad.append(touchBtn("◀",null,"a"),touchBtn("▶",null,"d"),touchBtn("⬆ HOP",jump));
for(const [label,type] of [["🧱","wall"],["▰","floor"],["╱","stair"],["△","cone"]])buildPad.append(touchBtn(label,()=>{selectedBuild=type;editing=null}));
buildPad.append(touchBtn("EDIT",()=>{selectedBuild=null;edit()}),touchBtn("OK",confirm),touchBtn("RESET",reset));
touchUI.append(movePad,buildPad);
const bind=()=>{try{return Object.assign({wall:"q",floor:"x",stair:"f",cone:"c",edit:"g"},JSON.parse(localStorage.getItem("restemad-build-binds-v1")||"{}"))}catch{return {wall:"q",floor:"x",stair:"f",cone:"c",edit:"g"}}};
function target(){return {x:Math.floor((aim.x+camX)/T),y:Math.floor((aim.y+camY)/T)}}
function nearby(b){return Math.abs(b.x*T-p.x)<T*3&&Math.abs(b.y*T-p.y)<T*3}
function place(type){if(!live||editing)return;let t=target();if(!nearby(t))return;let k=t.x+","+t.y+","+type;pieces.set(k,{...t,type,mask:[1,1,1,1],editShape:null,flip:p.x>t.x*T+T/2})}
function pick(){let t=target(),best=null,d=Infinity;for(let b of pieces.values()){let dd=Math.hypot(b.x-t.x,b.y-t.y);if(dd<d){best=b;d=dd}}return d<=1.5?best:null}
function edit(){editing=editing?null:pick();selected.clear()}
function confirm(){editing=null;selected.clear()}
function simpleEdit(){if(!editing||editing.type!=="wall")return;let row=(aim.y+camY-editing.y*T)>=T/2?1:0;editing.editShape=row===1?"door":"upper";editing.mask=[1,1,1,1];editing=null;selected.clear()}
function reset(){let b=editing||pick();if(b){b.mask=[1,1,1,1];b.editShape=null}editing=null;selected.clear()}
function jump(){if(p.ground){p.vy=-650;p.ground=false}}
function surface(b,x){let u=(x-b.x*T)/T;if(u<0||u>1)return null;if(b.type==="floor")return b.y*T+8;if(b.type==="stair")return b.y*T+(b.flip?u:1-u)*T;if(b.type==="cone")return b.y*T+Math.abs(u-.5)*T;return null}
// Collision rectangles are shared by rendering and physics, so edits are true openings.
function wallRects(b){let x=b.x*T,y=b.y*T;
if(b.editShape==="door")return [{x,y,w:T,h:T*.24},{x,y:y+T*.24,w:T*.20,h:T*.76},{x:x+T*.80,y:y+T*.24,w:T*.20,h:T*.76}];
if(b.editShape==="upper")return [{x,y:y+T*.76,w:T,h:T*.24},{x,y,w:T*.20,h:T*.76},{x:x+T*.80,y,w:T*.20,h:T*.76}];
let out=[];for(let i=0;i<4;i++)if(b.mask[i])out.push({x:x+(i%2)*T/2,y:y+Math.floor(i/2)*T/2,w:T/2,h:T/2});return out}
function solids(){let out=[];for(let b of pieces.values())if(b.type==="wall")out.push(...wallRects(b));return out}
function overlaps(x,y,r){return x+14>r.x&&x-14<r.x+r.w&&y+24>r.y&&y-24<r.y+r.h}
function update(dt){
const dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),vx=dx*330,oldY=p.y,rects=solids();
let steps=Math.max(1,Math.ceil(Math.max(Math.abs(vx*dt),Math.abs(p.vy*dt+800*dt*dt))/7)),step=dt/steps,grounded=false;
for(let n=0;n<steps;n++){
p.vy=Math.min(1100,p.vy+1600*step);
let nx=p.x+vx*step;
for(let r of rects)if(overlaps(nx,p.y,r)){
if(vx>0&&p.x+14<=r.x+.01)nx=Math.min(nx,r.x-14);
else if(vx<0&&p.x-14>=r.x+r.w-.01)nx=Math.max(nx,r.x+r.w+14);
else if(overlaps(p.x,p.y,r))nx=p.x;
}
p.x=nx;
let ny=p.y+p.vy*step,oldFoot=p.y+24,newFoot=ny+24;
for(let r of rects)if(overlaps(p.x,ny,r)){
if(p.vy>=0&&oldFoot<=r.y+.1){ny=Math.min(ny,r.y-24);p.vy=0;grounded=true}
else if(p.vy<0&&p.y-24>=r.y+r.h-.1){ny=Math.max(ny,r.y+r.h+24);p.vy=0}
else if(overlaps(p.x,p.y,r)){ny=p.y;p.vy=0}
}
for(let b of pieces.values()){if(b.type==="wall")continue;
let sy=surface(b,p.x),prev=surface(b,p.x-vx*step);
if(sy!==null&&p.vy>=0&&oldFoot<=Math.max(sy,prev===null?sy:prev)+6&&newFoot>=sy){ny=Math.min(ny,sy-24);p.vy=0;grounded=true}
}
if(ny+24>=470&&oldFoot<=470+8){ny=446;p.vy=0;grounded=true}
p.y=ny;
}
p.ground=grounded;
camX=p.x-480;camY+=(p.y-355-camY)*Math.min(1,dt*12);
}
function render(){c.save();c.translate(0,-camY);c.fillStyle="#77797b";c.fillRect(0,camY,960,600);c.strokeStyle="#919397";for(let x=-(camX%T+T)%T;x<960;x+=T){c.beginPath();c.moveTo(x,0);c.lineTo(x,600);c.stroke()}for(let y=Math.floor(camY/T)*T;y<camY+600;y+=T){c.beginPath();c.moveTo(0,y);c.lineTo(960,y);c.stroke()}c.fillStyle="#53575b";c.fillRect(0,470,960,Math.max(130,camY+600-470));
for(let b of pieces.values()){let x=b.x*T-camX,y=b.y*T;c.fillStyle=b.type==="cone"?"#e99a63":"#24d4cc";c.strokeStyle="#f4a36b";c.lineWidth=3;
if(b.type==="stair"||b.type==="cone"){c.beginPath();if(b.type==="stair"){c.moveTo(x,y+T);c.lineTo(x+T,y);c.lineTo(x+T,y+T)}else{c.moveTo(x,y+T);c.lineTo(x+T/2,y);c.lineTo(x+T,y+T)}c.closePath();c.fill();c.stroke();for(let i=1;i<5;i++){c.beginPath();c.moveTo(x,y+i*T/5);c.lineTo(x+T,y+i*T/5);c.stroke()}}
else{for(let r of wallRects(b)){let xx=r.x-camX,yy=r.y;c.fillRect(xx,yy,r.w,r.h);c.strokeRect(xx,yy,r.w,r.h);c.save();c.strokeStyle="#0f9997";c.lineWidth=1.3;for(let by=yy+13;by<yy+r.h;by+=14){c.beginPath();c.moveTo(xx,by);c.lineTo(xx+r.w,by);c.stroke();for(let bx=xx+((Math.floor((by-yy)/14)%2)?15:30);bx<xx+r.w;bx+=30){c.beginPath();c.moveTo(bx,by-14);c.lineTo(bx,by);c.stroke()}}c.restore()}}
}
c.fillStyle="#203c43";c.fillRect(465,p.y-24,30,48);c.fillStyle="#f3bd9a";c.beginPath();c.arc(480,p.y-36,15,0,Math.PI*2);c.fill();
if(selectedBuild&&!editing){let t=target();if(nearby(t)){let xx=t.x*T-camX,yy=t.y*T;c.save();c.globalAlpha=.36;c.fillStyle="#5affdf";c.fillRect(xx,yy,T,T);c.restore();}}if(editing){let x=editing.x*T-camX,y=editing.y*T;c.fillStyle="#ffffff28";c.fillRect(x,y,T,T);c.fillStyle="#ffcb5880";c.fillRect(x,y+(aim.y+camY-editing.y*T>=T/2?T/2:0),T,T/2);c.strokeStyle="white";c.lineWidth=2;c.strokeRect(x,y,T,T);c.beginPath();c.moveTo(x,y+T/2);c.lineTo(x+T,y+T/2);c.stroke()}else{let t=target();if(nearby(t)){c.strokeStyle="#ffffffaa";c.strokeRect(t.x*T-camX,t.y*T,T,T)}}c.restore()}
function loop(now){if(!live)return;let dt=Math.min(.035,(now-last)/1000||.016);update(dt);if(drag&&selectedBuild&&!editing&&now-turboAt>=45){place(selectedBuild);turboAt=now;}last=now;render();frameId=requestAnimationFrame(loop)}
function open(e){if(window.matchMedia("(pointer: coarse)").matches)return;e.preventDefault();e.stopImmediatePropagation();live=true;pieces.clear();keys={};selectedBuild=null;p={x:0,y:446,vy:0,ground:true};camX=-480;camY=90;aim={x:480,y:300};drag=false;menu.hidden=true;hud.hidden=false;wrap.classList.add("playing");root.querySelector("#arenaResult").hidden=true;root.querySelector("#arenaTouch").hidden=true;root.querySelector("#arenaBuildTouch").hidden=true;root.querySelector("#arenaEditPanel").hidden=true;root.querySelector("#arenaModeLabel").textContent="FREEBUILD · SIDE VIEW";root.querySelector("#arenaHint").textContent="Q/X/F/C vælg · klik placér · G edit · W/Space hop";cv.style.display="block";help.style.display="block";touchUI.style.display="none";wrap.style.position="relative";cv.style.height="100%";last=performance.now();frameId=requestAnimationFrame(loop)}
function close(e){if(!live)return;e.preventDefault();e.stopImmediatePropagation();live=false;drag=false;cancelAnimationFrame(frameId);cv.style.display="none";help.style.display="none";touchUI.style.display="none";selectedBuild=null;wrap.classList.remove("playing");menu.hidden=false;hud.hidden=true;keys={}}
const desktopOnly=window.matchMedia("(pointer: coarse)");function syncDesktop(){start.hidden=desktopOnly.matches;start.style.display=desktopOnly.matches?"none":"";}syncDesktop();if(desktopOnly.addEventListener)desktopOnly.addEventListener("change",syncDesktop);start.addEventListener("click",open,true);exit.addEventListener("click",close,true);
window.addEventListener("keydown",e=>{if(!live||e.target&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;let k=e.key.toLowerCase();e.stopImmediatePropagation();keys[k]=true;if([" ","arrowup","arrowleft","arrowright"].includes(k))e.preventDefault();if(e.repeat)return;if([" ","w","arrowup"].includes(k))jump();if(k==="escape"){editing=null;selectedBuild=null;selected.clear()}if(k==="enter")confirm();if(k==="r"){reset()}let b=bind();for(let type of ["wall","floor","stair","cone","edit"])if(k===b[type]){if(type==="edit"){selectedBuild=null;edit()}else{selectedBuild=type;editing=null}break}},true);
window.addEventListener("keyup",e=>{if(live){e.stopImmediatePropagation();keys[e.key.toLowerCase()]=false}},true);
function mark(){}
cv.addEventListener("pointermove",e=>{let r=cv.getBoundingClientRect();aim={x:(e.clientX-r.left)*960/r.width,y:(e.clientY-r.top)*600/r.height};if(drag&&editing)mark()});cv.addEventListener("pointerdown",e=>{e.preventDefault();let r=cv.getBoundingClientRect();aim={x:(e.clientX-r.left)*960/r.width,y:(e.clientY-r.top)*600/r.height};drag=true;turboAt=performance.now();if(editing){simpleEdit();drag=false}else if(selectedBuild)place(selectedBuild);});window.addEventListener("pointerup",()=>drag=false);cv.addEventListener("pointercancel",()=>drag=false);window.addEventListener("blur",()=>drag=false);
})();