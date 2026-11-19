/* RESTEMAD Online: room lobby only; combat networking not implemented yet. */
(function(){
  "use strict";
  var url="https://dvvwvviifxwappdhzzgu.supabase.co";
  var key="sb_publishable_NBtraNQhBmzKmE8CeFvKsQ_oeNYsJb7";
  var root=document.getElementById("arenaGame");
  if(!root)return;
  var el=function(id){return root.querySelector("#"+id);};
  var client=null, room=null, host=false, timer=null, busy=false, channel=null, launched=false, initTimer=null, launchPromise=null;
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
    var active=root.querySelector(".arena-fighter.chosen");
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
    if(!waiting&&!launched&&people.length>=2)launch(r.data,people).catch(error);
    el("arenaRoomStatus").textContent=waiting?(people.length<2?"Venter på mindst 2 spillere…":host?"I er klar! Værten kan starte.":"Venter på, at værten starter."):"Kampen er startet! Forbinder til onlinekampen…";
  }
  function showRoom(code){
    if(initTimer){clearInterval(initTimer);initTimer=null;}if(channel){setup().removeChannel(channel);channel=null;}launched=false;
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
    message("Starter onlinekampen…");
  });});
  async function launch(data,people){
    if(launched)return;launched=true;
    try{
      var uid=await login(),isHost=uid===data.host_id,game=window.RESTEMAD_ONLINE_GAME;
      if(new Set(people.map(function(p){return p.user_id;})).size!==people.length)throw Error("Spillerlisten indeholder dubletter.");
      if(!game)throw Error("Online-spilmotoren blev ikke indlæst.");
      var ch=setup().channel("arena-match-"+data.id,{config:{broadcast:{self:false}}});
      channel=ch;var started=false;
      ch.on("broadcast",{event:"input"},function(e){if(isHost&&e.payload)game.input(e.payload.userId,e.payload.input);});
      ch.on("broadcast",{event:"state"},function(e){if(!isHost&&started)game.receive(e.payload);});
      ch.on("broadcast",{event:"init"},function(e){
        if(isHost||started||!e.payload||e.payload.roomId!==data.id)return;
        if(!Array.isArray(e.payload.roster)||!e.payload.roster.some(function(p){return p.user_id===uid}))return;
        started=true;
        game.start({host:false,userId:uid,channel:ch,roster:e.payload.roster,seed:data.id});
        ch.send({type:"broadcast",event:"ready",payload:{userId:uid}});
        message("");
      });
      await new Promise(function(resolve,reject){
        var t=setTimeout(function(){reject(Error("Realtime-forbindelsen blev ikke oprettet."));},12000);
        ch.subscribe(function(status){if(status==="SUBSCRIBED"){clearTimeout(t);resolve();}else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){clearTimeout(t);reject(Error("Realtime-forbindelsen fejlede."));}});
      });
      if(isHost){
        started=true;game.start({host:true,userId:uid,channel:ch,roster:people,seed:data.id});
        var init={roomId:data.id,roster:people},ready=new Set([uid]);
        ch.on("broadcast",{event:"ready"},function(e){if(e.payload&&people.some(function(p){return p.user_id===e.payload.userId}))ready.add(e.payload.userId);});
        if(initTimer)clearInterval(initTimer);
        var sent=0;
        initTimer=setInterval(function(){
          if(!started||ready.size>=people.length||sent++>120){clearInterval(initTimer);initTimer=null;return;}
          ch.send({type:"broadcast",event:"init",payload:init});
        },450);
        ch.send({type:"broadcast",event:"init",payload:init});
      }else message("Venter på kampdata fra værten…");
    }catch(e){launched=false;if(channel){setup().removeChannel(channel);channel=null;}throw e;}
  }
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
