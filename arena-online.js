/* RESTEMAD Online: room lobby only; combat networking not implemented yet. */
(function(){
  "use strict";
  var url="https://dvvwvviifxwappdhzzgu.supabase.co";
  var key="sb_publishable_NBtraNQhBmzKmE8CeFvKsQ_oeNYsJb7";
  var root=document.getElementById("arenaGame");
  if(!root)return;
  var el=function(id){return root.querySelector("#"+id);};
  var client=null, room=null, host=false, timer=null, busy=false;
  function message(t){el("arenaOnlineMessage").textContent=t;}
  function error(e){message("⚠️ "+(e&&e.message?e.message:"Der opstod en fejl. Prøv igen."));}
  function setup(){
    if(client)return client;
    if(!window.supabase||!window.supabase.createClient)throw Error("Kunne ikke indlæse Supabase. Tjek forbindelsen.");
    client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    return client;
  }
  async function login(){
    var c=setup(), r=await c.auth.getSession();
    if(r.error)throw r.error;
    if(!r.data.session){var signed=await c.auth.signInAnonymously();if(signed.error)throw signed.error;}
    var u=await c.auth.getUser();
    if(u.error||!u.data.user)throw u.error||Error("Login mislykkedes");
    return u.data.user.id;
  }
  function nickname(){
    var n=el("arenaOnlineName").value.trim();
    if(n.length<1||n.length>24)throw Error("Skriv et navn på 1–24 tegn.");
    return n;
  }
  function fighter(){
    var active=root.querySelector(".arena-fighter.active, .arena-fighter.selected, [data-fighter].active");
    var index=active?Number(active.dataset.fighter):0;
    return Number.isInteger(index)&&index>=0&&index<=3?index:0;
  }
  function randomCode(){
    var alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789", bytes=new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes,function(b){return alphabet[b%alphabet.length];}).join("");
  }
  async function refresh(){
    if(!room||!client)return;
    var code=room;
    var r=await client.from("arena_rooms").select("id,code,host_id,status").eq("code",code).maybeSingle();
    if(r.error)throw r.error;
    if(!r.data){message("Rummet findes ikke længere.");return;}
    var p=await client.from("arena_players").select("nickname,user_id,fighter").eq("room_id",r.data.id).order("joined_at");
    if(p.error)throw p.error;
    if(room!==code)return;
    var people=p.data||[];
    el("arenaRoomCount").textContent="👥 "+people.length+"/10 spillere";
    var ul=el("arenaRoomPlayers");ul.replaceChildren();
    people.forEach(function(person){
      var li=document.createElement("li");
      li.textContent=(person.user_id===r.data.host_id?"👑 ":"🍽️ ")+person.nickname;
      ul.appendChild(li);
    });
    var uid=(await client.auth.getUser()).data.user?.id;
    host=uid===r.data.host_id;
    var waiting=r.data.status==="waiting";
    el("arenaRoomStart").hidden=!host||!waiting;
    el("arenaRoomStart").disabled=people.length<2;
    el("arenaRoomStatus").textContent=waiting?(people.length<2?"Venter på mindst 2 spillere…":host?"I er klar! Værten kan starte.":"Venter på, at værten starter."):"Kampen er startet! Onlinekampens styring og synkronisering er ikke bygget endnu.";
  }
  function showRoom(code){
    room=code;el("arenaRoomCurrentCode").textContent=code;el("arenaRoomLobby").hidden=false;
    el("arenaRoomStart").hidden=true;
    if(timer)clearInterval(timer);
    refresh().catch(error);
    timer=setInterval(function(){refresh().catch(error);},2500);
  }
  async function act(fn){
    if(busy)return;busy=true;
    el("arenaRoomCreate").disabled=true;el("arenaRoomJoin").disabled=true;
    message("Forbinder…");
    try{await fn();message("");}catch(e){error(e);}
    finally{busy=false;el("arenaRoomCreate").disabled=false;el("arenaRoomJoin").disabled=false;}
  }
  el("arenaRoomCreate").addEventListener("click",function(){act(async function(){
    await login();var n=nickname(), c=setup(), code, r;
    for(var i=0;i<4;i++){
      code=randomCode();
      r=await c.rpc("arena_create_room",{p_code:code,p_nickname:n,p_fighter:fighter()});
      if(!r.error)break;
      if(r.error.code!=="23505")throw r.error;
    }
    if(r.error)throw r.error;
    showRoom(code);
  });});
  el("arenaRoomJoin").addEventListener("click",function(){act(async function(){
    await login();var n=nickname(), code=el("arenaRoomCode").value.trim().toUpperCase();
    if(!/^[A-Z0-9]{6}$/.test(code))throw Error("Rumkoden skal være 6 tegn.");
    var r=await setup().rpc("arena_join_room",{p_code:code,p_nickname:n,p_fighter:fighter()});
    if(r.error)throw r.error;
    showRoom(code);
  });});
  el("arenaRoomStart").addEventListener("click",function(){act(async function(){
    if(!room)throw Error("Du er ikke i et rum.");
    var r=await setup().rpc("arena_start_room",{p_code:room});
    if(r.error)throw r.error;
    await refresh();
    message("Lobbyen er startet. Onlinekampen kommer i næste trin.");
  });});
  el("arenaRoomCopy").addEventListener("click",function(){
    if(room&&navigator.clipboard)navigator.clipboard.writeText(room).then(function(){message("Rumkoden er kopieret!");}).catch(function(){message("Kopiér koden ovenfor.");});
  });
  el("arenaOnlineClose").addEventListener("click",function(){
    if(timer){clearInterval(timer);timer=null;}
  });
  el("arenaOnline").addEventListener("click",function(){
    if(room){refresh().catch(error);if(!timer)timer=setInterval(function(){refresh().catch(error);},2500);}
  });
})();
