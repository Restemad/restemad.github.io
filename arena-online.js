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
    if(waiting||!launched)el("arenaRoomStatus").textContent=waiting?(people.length<2?"Venter på mindst 2 spillere…":host?"I er klar! Værten kan starte.":"Venter på, at værten starter."):"Kampen er startet! Forbinder til onlinekampen…";
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
    var ch=null;
    try{
      var uid=await login(),isHost=uid===data.host_id,game=window.RESTEMAD_ONLINE_GAME;
      if(!game)throw Error("Online-spilmotoren blev ikke indlæst.");
      if(new Set(people.map(function(p){return p.user_id;})).size!==people.length)throw Error("Spillerlisten indeholder dubletter.");
      if(!people.some(function(p){return p.user_id===uid}))throw Error("Din spiller findes ikke i rummet.");
      ch=setup().channel("arena-match-"+data.id,{config:{broadcast:{self:false,ack:true}}});
      channel=ch;
      var started=false, ready=new Set([uid]), init={roomId:data.id,roster:people};
      var statusEl=el("arenaRoomStatus");
      function broadcast(event,payload){return ch.send({type:"broadcast",event:event,payload:payload});}
      function begin(){
        if(started||!isHost||ready.size<people.length)return;
        started=true;
        if(initTimer){clearInterval(initTimer);initTimer=null;}
        game.start({host:true,userId:uid,channel:ch,roster:people,seed:data.id});
        // Repeat GO because a client can miss one packet during subscription.
        var count=0;
        var go=setInterval(function(){if(count++>=16){clearInterval(go);return;}broadcast("go",{roomId:data.id});},350);
        broadcast("go",{roomId:data.id});
      }
      ch.on("broadcast",{event:"input"},function(e){if(isHost&&started&&e.payload)game.input(e.payload.userId,e.payload.input);});
      ch.on("broadcast",{event:"state"},function(e){if(!isHost&&started&&e.payload)game.receive(e.payload);});
      ch.on("broadcast",{event:"hello"},function(e){
        if(isHost&&e.payload&&people.some(function(p){return p.user_id===e.payload.userId}))broadcast("init",init);
      });
      ch.on("broadcast",{event:"ready"},function(e){
        if(!isHost||!e.payload||!people.some(function(p){return p.user_id===e.payload.userId}))return;
        ready.add(e.payload.userId);
        statusEl.textContent="Forbundet: "+ready.size+"/"+people.length+" spillere";
        begin();
      });
      ch.on("broadcast",{event:"init"},function(e){
        if(isHost||!e.payload||e.payload.roomId!==data.id)return;
        if(!Array.isArray(e.payload.roster)||!e.payload.roster.some(function(p){return p.user_id===uid}))return;
        broadcast("ready",{userId:uid});
        statusEl.textContent="Forbundet til værten. Venter på alle spillere…";
      });
      ch.on("broadcast",{event:"go"},function(e){
        if(isHost||started||!e.payload||e.payload.roomId!==data.id)return;
        started=true;
        if(initTimer){clearInterval(initTimer);initTimer=null;}
        game.start({host:false,userId:uid,channel:ch,roster:people,seed:data.id});
        message("");
      });
      await new Promise(function(resolve,reject){
        var t=setTimeout(function(){reject(Error("Realtime kunne ikke forbinde. Prøv et nyt rum."));},12000);
        ch.subscribe(function(status){
          if(status==="SUBSCRIBED"){clearTimeout(t);resolve();}
          else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED"){clearTimeout(t);reject(Error("Realtime-forbindelsen fejlede: "+status));}
        });
      });
      var tries=0;
      if(isHost){
        statusEl.textContent="Venter på at din ven forbinder (1/"+people.length+")…";
        initTimer=setInterval(function(){
          if(started||!launched){clearInterval(initTimer);initTimer=null;return;}
          if(tries++>80){clearInterval(initTimer);initTimer=null;error(Error("Din ven blev ikke forbundet. Start et nyt rum, og genindlæs begge sider."));return;}
          broadcast("init",init);
        },500);
        broadcast("init",init);
      }else{
        statusEl.textContent="Forbinder til værten…";
        initTimer=setInterval(function(){
          if(started||!launched){clearInterval(initTimer);initTimer=null;return;}
          if(tries++>80){clearInterval(initTimer);initTimer=null;error(Error("Kunne ikke forbinde til værten. Start et nyt rum."));return;}
          broadcast("hello",{userId:uid});
        },500);
        broadcast("hello",{userId:uid});
      }
    }catch(e){
      launched=false;
      if(initTimer){clearInterval(initTimer);initTimer=null;}
      if(ch){setup().removeChannel(ch);if(channel===ch)channel=null;}
      throw e;
    }
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
