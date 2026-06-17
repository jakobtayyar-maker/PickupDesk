// PIN wird serverseitig geprüft
// Admin-PIN wird serverseitig geprüft
// API calls gehen über /api/ — keine Keys im Frontend
var SCHOOL='Grundschule am Hengstbach';
var currentDay='';
var gefundenId=null;
var syncLock=false;
var adminLoggedIn=false;
var FARBEN=[{bg:'#D8F3DC',fg:'#1B4332'},{bg:'#FEF3C7',fg:'#78350F'},{bg:'#DBEAFE',fg:'#1E3A5F'},{bg:'#FCE7F3',fg:'#831843'},{bg:'#EDE9FE',fg:'#4C1D95'},{bg:'#FFEDD5',fg:'#7C2D12'}];

// ── Speicher ──
function ls(k){try{return JSON.parse(localStorage.getItem(k));}catch(e){return null;}}
function ss(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function ssConsent(k,v){if(localStorage.getItem('cookie_ok')||k==='cookie_ok'){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}}
function getKinder(){return ls('pd_kinder')||[];}
function saveKinder(l){ss('pd_kinder',l);}
function getEntries(){return ls('pd_entries')||[];}
function sbPost(e){fetch('/api/entries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(e)}).catch(function(){});}
function sbDel(id){fetch('/api/entries?id=eq.'+encodeURIComponent(String(id)),{method:'DELETE',headers:{'Content-Type':'application/json'}}).catch(function(){});}
function sbPatch(id,d){fetch('/api/entries?id=eq.'+encodeURIComponent(String(id)),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).catch(function(){});}
function kbPost(k){fetch('/api/kinder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(k)}).catch(function(){});}
function kbDel(name){fetch('/api/kinder?name=eq.'+encodeURIComponent(name),{method:'DELETE',headers:{'Content-Type':'application/json'}}).catch(function(){});}
function kbClear(){fetch('/api/kinder?name=not.is.null',{method:'DELETE',headers:{'Content-Type':'application/json'}}).catch(function(){});}
function kbLoad(cb){
  fetch('/api/kinder',{method:'GET'})
  .then(function(r){return r.json();})
  .then(function(d){if(Array.isArray(d)){ss('pd_kinder',d);}if(cb)cb();})
  .catch(function(){if(cb)cb();});
}
function sbLoad(cb){
  if(syncLock){if(cb)cb();return;}
  fetch('/api/entries',{method:'GET'})
  .then(function(r){return r.json();})
  .then(function(d){if(Array.isArray(d)&&!syncLock){ss('pd_entries',d);}if(cb)cb();})
  .catch(function(){if(cb)cb();});
}
function saveEntries(l){ss('pd_entries',l);}

// Mitternacht
(function(){
  var n=new Date(),ms=new Date(n.getFullYear(),n.getMonth(),n.getDate()+1)-n;
  setTimeout(function(){
    var tage=['','mo','di','mi','do','fr',''];
    var gestern=tage[new Date().getDay()===0?5:new Date().getDay()-1]||'';
    if(!gestern)return;
    var entries=JSON.parse(localStorage.getItem('pd_entries')||'[]');
    var keep=entries.filter(function(e){return e.tag!==gestern;});
    localStorage.setItem('pd_entries',JSON.stringify(keep));
    fetch('/api/entries?tag=eq.'+gestern,{method:'DELETE',headers:{'Content-Type':'application/json'}}).catch(function(){});
  },ms);
})();

// ── Navigation ──
function goLand(){document.getElementById('pg-land').style.display='';document.getElementById('pg-app').style.display='none';}
function openApp(t){document.getElementById('pg-land').style.display='none';document.getElementById('pg-app').style.display='block';go(t);}
function go(t){
  var tabs=document.querySelectorAll('.tab');for(var i=0;i<tabs.length;i++)tabs[i].className='tab';
  var views=document.querySelectorAll('.view');for(var i=0;i<views.length;i++)views[i].className='view';
  var te=document.getElementById('tab-'+t);if(te)te.className='tab on';
  var ve=document.getElementById('v-'+t);if(ve)ve.className='view on';
  if(t==='liste')renderListe();
  if(t==='admin')renderAdmin();
}

// ── Helpers ──
function show(id,t){var e=document.getElementById(id);if(e){e.innerHTML=t;e.style.display='block';}}
function hide(id){var e=document.getElementById(id);if(e)e.style.display='none';}
function tog(id){var e=document.getElementById(id);if(e){e.classList.toggle('on');e.textContent=e.classList.contains('on')?'\u2713':'';}}
function inits(v,n){return((v||'')[0]||'').toUpperCase()+((n||'')[0]||'').toUpperCase();}

// ── Eltern: Consent ──
function acceptConsent(){
  var box=document.getElementById('ec');
  hide('ec-err');
  if(!box.classList.contains('on')){show('ec-err','Bitte der Datenschutzerklärung zustimmen.');return;}
  consentOk=true;
  document.getElementById('e-consent-step').style.display='none';
  document.getElementById('e-form').style.display='block';
  kbLoad(function(){});
}
var consentOk=false;

// ── Eltern: Sub-Tabs ──
function eSub(n){
  document.getElementById('st1').className=n===1?'stab on':'stab';
  document.getElementById('st2').className=n===2?'stab on':'stab';
  document.getElementById('ep1').style.display=n===1?'block':'none';
  document.getElementById('ep2').style.display=n===2?'block':'none';
  if(n===2)sDay(elternDay);
}

// ── Eltern: Melden ──
function melden(){
  hide('e-ok');hide('e-err');
  var v=document.getElementById('e-vn').value.trim();
  var n=document.getElementById('e-nn').value.trim();
  var zeit=document.getElementById('e-zeit').value;
  var abhol=document.getElementById('e-abhol').value.trim();
  var hw='';
  if(!elternDay){show('e-err','Bitte Wochentag auswählen.');return;}
  if(!v){show('e-err','Bitte Vorname eingeben.');return;}
  if(!n){show('e-err','Bitte Nachname eingeben.');return;}
  if(!zeit){show('e-err','Bitte Abholzeit wählen.');return;}
  var name=v+' '+n;
  // Kinder von Supabase laden falls nötig
  var kinder=getKinder();
  var found=false;
  for(var i=0;i<kinder.length;i++){if(kinder[i].name.toLowerCase()===name.toLowerCase()){found=true;break;}}
  if(!found){
    // Nochmal versuchen - vielleicht sind lokale Daten veraltet
    show('e-err','Das Kind "'+name+'" ist nicht im System registriert. Bitte wenden Sie sich an die Betreuung.');
    kbLoad(function(){});
    return;
  }
  var entries=getEntries().filter(function(e){return !(e.name.toLowerCase()===name.toLowerCase()&&e.tag===elternDay&&e.src!=='admin');});
  var newEntry={id:'e'+Date.now(),name:name,v:v,n:n,zeit:zeit,abhol:abhol,hw:'',done:false,tag:elternDay};
  entries.push(newEntry);
  entries.sort(function(a,b){return a.zeit.localeCompare(b.zeit);});
  saveEntries(entries);
  // Supabase sync
  syncLock=true;
  setTimeout(function(){syncLock=false;},8000);
  fetch('/api/entries?name=eq.'+encodeURIComponent(name)+'&tag=eq.'+elternDay,{method:'DELETE',headers:{'Content-Type':'application/json'}}).then(function(){sbPost(newEntry);}).catch(function(){sbPost(newEntry);});
  show('e-ok','<b>'+name+'</b> → '+zeit+' Uhr'+(abhol?' · '+abhol:''));
  document.getElementById('e-vn').value='';document.getElementById('e-nn').value='';
  document.getElementById('e-zeit').value='';document.getElementById('e-abhol').value='';
  setTimeout(function(){hide('e-ok');},4000);
}

// ── Eltern: Suchen/Ändern/Löschen ──
function suchen(){
  hide('s-err');
  document.getElementById('s-found').style.display='none';
  document.getElementById('s-results').style.display='none';
  gefundenId=null;
  var v=document.getElementById('s-vn').value.trim();
  var n=document.getElementById('s-nn').value.trim();
  if(!suchenDay){show('s-err','Bitte Wochentag auswählen.');return;}
  if(!v||!n){show('s-err','Bitte Vor- und Nachname eingeben.');return;}
  var name=v+' '+n;
  var raw=localStorage.getItem('pd_entries');
  var entries=raw?JSON.parse(raw):[];
  var tage={mo:'Montag',di:'Dienstag',mi:'Mittwoch',do:'Donnerstag',fr:'Freitag'};
  var found=null;
  for(var i=0;i<entries.length;i++){
    if(entries[i].name.toLowerCase()===name.toLowerCase()&&entries[i].tag===suchenDay){found=entries[i];break;}
  }
  var tage={mo:'Montag',di:'Dienstag',mi:'Mittwoch',do:'Donnerstag',fr:'Freitag'};
  if(!found){show('s-err','Kein Eintrag für "'+name+'" am '+(tage[suchenDay]||'')+' gefunden.');return;}
  selectEntry(found);
}

function selectEntry(entry){
  var tage={mo:'Montag',di:'Dienstag',mi:'Mittwoch',do:'Donnerstag',fr:'Freitag'};
  gefundenId=entry.id;
  document.getElementById('s-results').style.display='none';
  var meta=entry.abhol?' \u00b7 '+entry.abhol:'';
  show('s-info','<b>'+entry.name+'</b> — '+(tage[entry.tag]||'?')+' '+entry.zeit+' Uhr'+meta);
  document.getElementById('s-zeit').value=entry.zeit||'';
  document.getElementById('s-abhol').value=entry.abhol||'';
  document.getElementById('s-found').style.display='block';
  document.getElementById('s-locked').style.display=entry.done?'block':'none';
  document.getElementById('s-edit').style.display=entry.done?'none':'block';
}

function aendern(){
  if(!gefundenId)return;
  var zeit=document.getElementById('s-zeit').value;
  var abhol=document.getElementById('s-abhol').value.trim();
  if(!zeit)return;
  
  // Direkt aus localStorage lesen
  var raw=localStorage.getItem('pd_entries');
  if(!raw){show('s-err','Kein Speicher.');return;}
  var arr=JSON.parse(raw);
  var sid=String(gefundenId);
  var ok=false;
  
  for(var i=0;i<arr.length;i++){
    if(String(arr[i].id)===sid){
      arr[i].zeit=zeit;
      arr[i].abhol=abhol;
      ok=true;
      break;
    }
  }
  
  if(!ok){show('s-err','Eintrag nicht gefunden.');return;}
  
  // Direkt speichern
  localStorage.setItem('pd_entries',JSON.stringify(arr));
  
  // Supabase: alten löschen + neuen posten (zuverlässiger als PATCH)
  syncLock=true;
  setTimeout(function(){syncLock=false;},8000);
  var updated=arr.find(function(x){return String(x.id)===sid;});
  sbDel(sid);
  if(updated)setTimeout(function(){sbPost(updated);},500);
  // Info aktualisieren aber NICHT die ID ändern
  show('s-ok','\u2705 Geändert auf '+zeit+' Uhr!');
  document.getElementById('s-info').innerHTML='<b>'+arr.find(function(x){return String(x.id)===sid;}).name+'</b> — '+zeit+' Uhr'+(abhol?' \u00b7 '+abhol:'');
  document.getElementById('s-zeit').value=zeit;
}

function eLoeschen(){
  if(!gefundenId)return;
  if(!confirm('Eintrag wirklich löschen?'))return;
  var raw=localStorage.getItem('pd_entries');
  var entries=raw?JSON.parse(raw):[];
  var sid=String(gefundenId);
  var keep=[];
  for(var i=0;i<entries.length;i++){
    if(String(entries[i].id)!==sid)keep.push(entries[i]);
  }
  localStorage.setItem('pd_entries',JSON.stringify(keep));
  sbDel(sid);
  gefundenId=null;
  document.getElementById('s-found').style.display='none';
  document.getElementById('s-vn').value='';
  document.getElementById('s-nn').value='';
}

// ── Betreuer Login ──
function login(){
  hide('p-err');
  var box=document.getElementById('bc');
  if(!box.classList.contains('on')){show('p-err','Bitte Datenschutz zustimmen.');return;}
  var pin=document.getElementById('pin').value.trim();
  if(pin!==PIN){show('p-err','Falscher PIN.');return;}
  document.getElementById('tab-liste').style.display='';
  document.getElementById('tab-admin').style.display='';
  
  go('liste');
}

// ── Tage ──
function setDay(d){
  currentDay=d;
  var days=document.getElementById('b-days').querySelectorAll('.day');
  for(var i=0;i<days.length;i++){
    var dd=['mo','di','mi','do','fr'][i];
    days[i].className=dd===d?'day on':'day';
  }
  renderListe();
}

// ── Liste ──
function lSub(n){
  document.getElementById('lt1').className=n===1?'stab on':'stab';
  document.getElementById('lt2').className=n===2?'stab on':'stab';
  document.getElementById('lt3').className=n===3?'stab on':'stab';
  document.getElementById('lp1').style.display=n===1?'block':'none';
  document.getElementById('lp2').style.display=n===2?'block':'none';
  document.getElementById('lp3').style.display=n===3?'block':'none';
}

function renderListe(){
  kbLoad(function(){sbLoad(function(){doRenderListe();});});
}
function doRenderListe(){
  if(!currentDay){
    document.getElementById('s-tot').textContent='–';
    document.getElementById('s-open').textContent='–';
    document.getElementById('s-done').textContent='–';
    document.getElementById('list-alle').innerHTML='<div class="empty">Bitte Wochentag wählen.</div>';
    document.getElementById('list-frueh').innerHTML='<div class="empty">Bitte Wochentag wählen.</div>';
    document.getElementById('list-abgeholt').innerHTML='';
    return;
  }
  var search=(document.getElementById('l-search').value||'').toLowerCase();

  // "Alle Kinder" = Admin-Liste mit Abhak-Status aus Einträgen
  var kinder=getKinder();
  if(search){kinder=kinder.filter(function(k){return k.name.toLowerCase().indexOf(search)>=0;});}
  var allEntries=getEntries();
  var alleList=[];
  var seen={};
  kinder.forEach(function(k){
    var key=k.name.toLowerCase();
    if(seen[key])return;
    seen[key]=true;
    var parts=k.name.split(' ');
    var existing=allEntries.find(function(e){return e.name.toLowerCase()===key&&e.tag===currentDay;});
    if(existing){
      existing.abhol=existing.abhol||'Klasse '+k.klasse;
      alleList.push(existing);
    }else{
      var regId='reg_'+k.name.replace(/\s/g,'_');
      alleList.push({id:regId,name:k.name,v:parts[0],n:parts.slice(1).join(' '),zeit:k.zeit||'15:00',abhol:'Klasse '+k.klasse,hw:'',done:false,regular:true});
    }
  });
  alleList.sort(function(a,b){return(a.zeit||'').localeCompare(b.zeit||'');});
  buildList(alleList,'list-alle','Keine Kinder registriert. Bitte im Admin-Bereich hinzufügen.');

  // "Früher gehen" = Eltern-Meldungen für den ausgewählten Tag
  var entries=getEntries().filter(function(e){return e.tag===currentDay&&e.src!=='admin';});
  if(search){entries=entries.filter(function(e){return e.name.toLowerCase().indexOf(search)>=0;});}
  // Deduplicate - nur letzter Eintrag pro Name
  var seenF={};
  var uniqueEntries=[];
  for(var ei=entries.length-1;ei>=0;ei--){
    var ek=entries[ei].name.toLowerCase();
    if(!seenF[ek]){seenF[ek]=true;uniqueEntries.unshift(entries[ei]);}
  }
  entries=uniqueEntries;
  entries.sort(function(a,b){return a.zeit.localeCompare(b.zeit);});

  var alleKinder=getKinder().length;
  var fruehCount=entries.length;
  var allEntries=getEntries();
  var abgeholtCount=allEntries.filter(function(e){return e.done&&e.tag===currentDay;}).length;
  document.getElementById('s-tot').textContent=alleKinder;
  document.getElementById('s-open').textContent=fruehCount;
  document.getElementById('s-done').textContent=abgeholtCount;

  buildList(entries,'list-frueh','Keine Sonder-Abholungen für diesen Tag.');

  // Abgeholt = alle abgehakten Kinder
  var abgeholt=getEntries().filter(function(e){return e.done&&e.tag===currentDay;});
  if(search){abgeholt=abgeholt.filter(function(e){return e.name.toLowerCase().indexOf(search)>=0;});}
  var seenA={};
  abgeholt=abgeholt.filter(function(e){var k=e.name.toLowerCase();if(seenA[k])return false;seenA[k]=true;return true;});
  abgeholt.sort(function(a,b){return a.zeit.localeCompare(b.zeit);});
  buildList(abgeholt,'list-abgeholt','Noch keine Kinder abgeholt.');
}

function buildList(list,containerId,emptyMsg){
  var box=document.getElementById(containerId);
  if(!list.length){box.innerHTML='<div class="empty">'+emptyMsg+'</div>';return;}
  var grp={};
  list.forEach(function(e){var t=e.zeit||'?';if(!grp[t])grp[t]=[];grp[t].push(e);});
  var html='';
  var keys=Object.keys(grp).sort();
  for(var k=0;k<keys.length;k++){
    var t=keys[k];
    var g=grp[t];
    var allD=g.every(function(x){return x.done;});
    html+='<div class="tg-h">'+t+' Uhr <button class="gc'+(allD?' on':'')+'" onclick="toggleGroup(this)" data-time="'+t+'">'+(allD?'\u2713 Alle':'Alle '+g.length)+'</button></div>';
    for(var j=0;j<g.length;j++){
      var e=g[j];
      var f=FARBEN[e.name.length%FARBEN.length];
      var ini=inits(e.v,e.n);
      var meta=[e.abhol,e.hw].filter(Boolean).join(' \u00b7 ');
      if(e.regular)meta='regul\u00e4r'+(meta?' \u00b7 '+meta:'');
      if(!meta)meta='\u2013';
      html+='<div class="entry'+(e.done?' done':'')+'">';
      html+='<div class="av" style="background:'+f.bg+';color:'+f.fg+'">'+ini+'</div>';
      html+='<div class="einfo"><div class="ename">'+e.name+'</div><div class="emeta">'+meta+'</div></div>';
      html+='<div class="etime">'+t+'</div>';
      if(e.id){html+='<button class="ck'+(e.done?' on':'')+'" data-eid="'+e.id+'">'+(e.done?'\u2713':'\u25cb')+'</button>';}
      html+='</div>';
    }
  }
  box.innerHTML=html;
  var ckBtns=box.querySelectorAll('.ck');
  for(var ci=0;ci<ckBtns.length;ci++){
    ckBtns[ci].addEventListener('click',function(){toggleDone(this.getAttribute('data-eid'));});
  }
}

function toggleGroup(btn){
  var time=btn.getAttribute('data-time');
  var entries=getEntries();
  var grp=entries.filter(function(e){return e.zeit===time;});
  var allD=grp.every(function(e){return e.done;});
  for(var i=0;i<entries.length;i++){if(entries[i].zeit===time)entries[i].done=!allD;}
  saveEntries(entries);renderListe();
}
function toggleDone(id){
  var sid=String(id);
  var entries=getEntries();
  // Check if this is a regular entry (from Alle Kinder)
  if(sid.indexOf('reg_')===0){
    var childName=sid.substring(4).replace(/_/g,' ');
    var existing=entries.find(function(e){return e.name.toLowerCase()===childName.toLowerCase()&&e.tag===currentDay;});
    if(existing){
      existing.done=!existing.done;
    }else{
      var k=getKinder().find(function(x){return x.name.toLowerCase()===childName.toLowerCase();});
      if(k){
        var parts=k.name.split(' ');
        entries.push({id:'e'+Date.now(),name:k.name,v:parts[0],n:parts.slice(1).join(' '),zeit:k.zeit||'15:00',abhol:'',hw:'',done:true,tag:currentDay,src:'admin'});
      }
    }
  }else{
    for(var i=0;i<entries.length;i++){
      if(String(entries[i].id)===sid){entries[i].done=!entries[i].done;break;}
    }
  }
  saveEntries(entries);
  var ue=entries.find(function(x){return String(x.id)===sid;});
  if(ue)sbPatch(ue.id,{done:ue.done});renderListe();
}
function clearEntries(){
  var alle=getEntries();
  if(alle.length===0){alert('Keine Sonder-Abholungen zum Löschen.');return;}
  if(!confirm('Alle '+alle.length+' Sonder-Abholungen löschen?'))return;
  saveEntries([]);
  fetch('/api/entries?id=not.is.null',{method:'DELETE',headers:{'Content-Type':'application/json'}}).catch(function(){});
  lSub(2);
  renderListe();
}

// ── Admin ──
function adminCheck(){
  if(adminLoggedIn){go('admin');return;}
  var code=prompt('Admin-Code eingeben:');
  if(!code)return;
  if(code!==ADMIN_PIN){alert('Falscher Admin-Code.');return;}
  adminLoggedIn=true;
  go('admin');
}

function kindHinzu(){
  hide('k-ok');hide('k-err');
  var v=document.getElementById('k-vn').value.trim();
  var n=document.getElementById('k-nn').value.trim();
  var kl=document.getElementById('k-kl').value.trim();
  var zeit=document.getElementById('k-zeit').value;
  if(!v||!n){show('k-err','Bitte Vor- und Nachname eingeben.');return;}
  if(!kl)kl='–';
  var name=v+' '+n;
  var kinder=getKinder();
  if(kinder.find(function(k){return k.name.toLowerCase()===name.toLowerCase();})){show('k-err','"'+name+'" ist bereits registriert.');return;}
  kinder.push({name:name,klasse:kl,zeit:zeit||'15:00'});
  kinder.sort(function(a,b){return a.name.localeCompare(b.name);});
  saveKinder(kinder);
  kbPost({name:name,klasse:kl,zeit:zeit||'15:00'});
  show('k-ok','✅ '+name+' hinzugefügt!');
  document.getElementById('k-vn').value='';document.getElementById('k-nn').value='';
  document.getElementById('k-kl').value='';document.getElementById('k-zeit').value='';
  renderAdmin();
  setTimeout(function(){hide('k-ok');},3000);
}

function renderAdmin(){
  kbLoad(function(){doRenderAdmin();});
}
function doRenderAdmin(){
  var kinder=getKinder();
  var search=(document.getElementById('k-search').value||'').toLowerCase();
  if(search){kinder=kinder.filter(function(k){return k.name.toLowerCase().indexOf(search)>=0;});}
  var box=document.getElementById('admin-list');
  if(!kinder.length){box.innerHTML='<div class="empty">Keine Kinder registriert.'+(search?' Suche anpassen.':'')+'</div>';return;}
  var html='';
  for(var i=0;i<kinder.length;i++){
    var k=kinder[i];
    html+='<div class="admin-item"><div><div class="admin-name">'+k.name+'</div>';
    html+='<div class="admin-detail">Klasse: '+k.klasse+' · '+k.zeit+' Uhr</div></div>';
    html+='<button class="del" data-idx="'+i+'">✕</button></div>';
  }
  box.innerHTML=html;
  var dels=box.querySelectorAll('.del');
  for(var i=0;i<dels.length;i++){
    dels[i].addEventListener('click',function(){
      var idx=parseInt(this.getAttribute('data-idx'));
      var alle=getKinder();
      var name;
      if(search){
        var filtered=alle.filter(function(k){return k.name.toLowerCase().indexOf(search)>=0;});
        name=filtered[idx]?filtered[idx].name:'';
      }else{
        name=alle[idx]?alle[idx].name:'';
      }
      if(!name)return;
      if(!confirm(name+' wirklich entfernen?'))return;
      saveKinder(alle.filter(function(k){return k.name!==name;}));
      kbDel(name);
      renderAdmin();
    });
    dels[i].addEventListener('touchend',function(ev){ev.preventDefault();this.click();});
  }
}

function alleKinderLoeschen(){
  var k=getKinder();
  if(k.length===0){alert('Keine Kinder vorhanden.');return;}
  if(!confirm('Alle '+k.length+' Kinder wirklich loeschen?'))return;
  saveKinder([]);
  kbClear();
  renderAdmin();
}

// ── Eltern Tag ──
var elternDay='';
var suchenDay='';
function eDay(d){
  elternDay=d;
  var btns=document.getElementById('e-days').querySelectorAll('.day');
  for(var i=0;i<btns.length;i++){
    var dd=['mo','di','mi','do','fr'][i];
    btns[i].className=dd===d?'day on':'day';
  }
}
function sDay(d){
  suchenDay=d;
  var btns=document.getElementById('s-days').querySelectorAll('.day');
  for(var i=0;i<btns.length;i++){
    var dd=['mo','di','mi','do','fr'][i];
    btns[i].className=dd===d?'day on':'day';
  }
}

// Kein Tag vorausgewählt - Eltern müssen wählen

// ── Init ──

// Auto-set day
var dayMap=[null,'mo','di','mi','do','fr',null];
var today=new Date().getDay();
if(dayMap[today])setDay(dayMap[today]);

// Auto-refresh
setInterval(function(){if(document.getElementById('v-liste').className.indexOf('on')>=0)renderListe();},5000);

// Enter key for PIN
document.addEventListener('keydown',function(e){if(e.key==='Enter'&&document.getElementById('v-pin').className.indexOf('on')>=0)login();});

function setLang(l){
  var t={
    tr:{e:'Ebeveyn Bölümü',es:'Alış saatini bildirin veya güncelleyin.',n:'Yeni bildir',a:'Güncelle',vn:'Çocuğun adı',nn:'Çocuğun soyadı',z:'Alış saati',ab:'Kim alıyor?',btn:'Saati bildir',sb:'Kaydı ara',ds:'Gizlilik Politikası',dc:'Kabul ediyorum',w:'İleri'},
    ar:{e:'قسم الوالدين',es:'أبلغ عن وقت الاستلام.',n:'إبلاغ جديد',a:'تعديل',vn:'اسم الطفل',nn:'لقب الطفل',z:'وقت الاستلام',ab:'من سيستلم؟',btn:'إبلاغ',sb:'بحث',ds:'سياسة الخصوصية',dc:'أوافق',w:'التالي'},
    ru:{e:'Раздел родителей',es:'Сообщите время забора.',n:'Новая запись',a:'Изменить',vn:'Имя ребёнка',nn:'Фамилия',z:'Время забора',ab:'Кто забирает?',btn:'Сообщить',sb:'Найти',ds:'Конфиденциальность',dc:'Я согласен',w:'Далее'},
    en:{e:'Parent Section',es:'Report or update pickup time.',n:'New entry',a:'Edit',vn:'First name',nn:'Last name',z:'Pickup time',ab:'Who picks up?',btn:'Submit',sb:'Find entry',ds:'Privacy Policy',dc:'I agree',w:'Continue'},
    fr:{e:'Section parents',es:'Signalez ou modifiez.',n:'Nouvelle entrée',a:'Modifier',vn:'Prénom',nn:'Nom',z:'Heure',ab:'Qui récupère?',btn:'Enregistrer',sb:'Trouver',ds:'Confidentialité',dc:'J\u2019accepte',w:'Continuer'},
    pl:{e:'Sekcja rodziców',es:'Zgłoś godzinę odbioru.',n:'Nowy wpis',a:'Edytuj',vn:'Imię',nn:'Nazwisko',z:'Godzina',ab:'Kto odbiera?',btn:'Zgłoś',sb:'Szukaj',ds:'Prywatność',dc:'Akceptuję',w:'Dalej'},
    it:{e:'Sezione genitori',es:'Inserisci o aggiorna.',n:'Nuovo',a:'Modifica',vn:'Nome',nn:'Cognome',z:'Orario',ab:'Chi ritira?',btn:'Invia',sb:'Cerca',ds:'Privacy',dc:'Accetto',w:'Continua'},
    es:{e:'Sección padres',es:'Informa el horario.',n:'Nueva entrada',a:'Editar',vn:'Nombre',nn:'Apellido',z:'Hora',ab:'¿Quién recoge?',btn:'Enviar',sb:'Buscar',ds:'Privacidad',dc:'Acepto',w:'Continuar'},
    ro:{e:'Secțiunea părinți',es:'Raportați ora.',n:'Intrare nouă',a:'Editați',vn:'Prenume',nn:'Nume',z:'Ora',ab:'Cine preia?',btn:'Trimite',sb:'Caută',ds:'Confidențialitate',dc:'Accept',w:'Continuă'},
    uk:{e:'Розділ батьків',es:'Повідомте час забору.',n:'Новий запис',a:'Змінити',vn:'Ім\u2019я',nn:'Прізвище',z:'Час',ab:'Хто забирає?',btn:'Надіслати',sb:'Знайти',ds:'Конфіденційність',dc:'Приймаю',w:'Далі'},
    hr:{e:'Odjeljak za roditelje',es:'Javite vrijeme.',n:'Novi unos',a:'Uredi',vn:'Ime',nn:'Prezime',z:'Vrijeme',ab:'Tko preuzima?',btn:'Pošalji',sb:'Traži',ds:'Privatnost',dc:'Prihvaćam',w:'Nastavi'},
    fa:{e:'بخش والدین',es:'زمان تحویل را گزارش کنید.',n:'ورود جدید',a:'ویرایش',vn:'نام',nn:'نام خانوادگی',z:'زمان',ab:'چه کسی؟',btn:'ارسال',sb:'جستجو',ds:'حریم خصوصی',dc:'می\u2019پذیرم',w:'ادامه'}
  };
  var d=(l==='de')?null:t[l];
  document.documentElement.dir=(l==='ar'||l==='fa')?'rtl':'ltr';
  if(!d)d={e:'Eltern-Bereich',es:'Abholzeit melden oder ändern.',n:'Neu melden',a:'Ändern',vn:'Vorname des Kindes',nn:'Nachname des Kindes',z:'Abholzeit',ab:'Wer holt ab?',btn:'Abholzeit melden',sb:'Eintrag suchen',ds:'Datenschutzerklärung',dc:'Ich stimme der Datenschutzerklärung zu',w:'Weiter'};
  var s=function(id,txt){var el=document.getElementById(id);if(el)el.textContent=txt;};
  s('t-vt',d.e);s('t-vs',d.es);s('st1',d.n);s('st2',d.a);
  s('t-btn-melden',d.btn);s('t-btn-suchen',d.sb);s('t-btn-weiter',d.w);
  var ct=document.getElementById('t-consent-title');if(ct)ct.textContent='🔒 '+d.ds;
  var cc=document.getElementById('t-consent-check');if(cc)cc.textContent=d.dc;
  // Landing page
  // Homepage translations
  var hpx={
    de:{h1:'Abholzeiten<br><em>einfach</em> verwalten.',label:'F\u00fcr Schulen & Kitas',b1:'Als Elternteil starten',b2:'Betreuer-Login',sub:'Eltern melden die Abholzeit \u2014 Betreuer sehen sofort eine \u00fcbersichtliche Liste.',ctah:'Jetzt kostenlos testen',ctap:'Direkt im Browser \u2014 auf jedem Handy und Computer.',f1h:'Schnell melden',f1p:'Uhrzeit w\u00e4hlen \u2014 in Sekunden.',f2h:'Jederzeit \u00e4ndern',f2p:'Plan ge\u00e4ndert? Sofort aktualisieren.',f3h:'Gruppe abhaken',f3p:'Alle 15-Uhr-Kinder auf einmal.',f4h:'PIN-gesch\u00fctzt',f4p:'Liste nur f\u00fcr autorisierte Betreuer.'},
    tr:{h1:'Al\u0131\u015f saatlerini<br><em>kolayca</em> y\u00f6netin.',label:'Okullar ve Kre\u015fler',b1:'Ebeveyn olarak ba\u015fla',b2:'Bak\u0131c\u0131 giri\u015fi',sub:'Ebeveynler saati bildirir \u2014 bak\u0131c\u0131lar listeyi g\u00f6r\u00fcr.',ctah:'\u00dccretsiz deneyin',ctap:'Do\u011frudan taray\u0131c\u0131da.',f1h:'H\u0131zl\u0131 bildir',f1p:'Saat se\u00e7 \u2014 saniyeler i\u00e7inde.',f2h:'De\u011fi\u015ftir',f2p:'Plan de\u011fi\u015fti? G\u00fcncelle.',f3h:'Grubu i\u015faretle',f3p:'15:00 \u00e7ocuklar\u0131 tek t\u0131kla.',f4h:'PIN korumal\u0131',f4p:'Yaln\u0131zca yetkili bak\u0131c\u0131lar.'},
    ar:{h1:'\u0625\u062f\u0627\u0631\u0629 \u0623\u0648\u0642\u0627\u062a \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645<br><em>\u0628\u0633\u0647\u0648\u0644\u0629</em>.',label:'\u0644\u0644\u0645\u062f\u0627\u0631\u0633 \u0648\u0627\u0644\u062d\u0636\u0627\u0646\u0627\u062a',b1:'\u0627\u0628\u062f\u0623 \u0643\u0648\u0644\u064a \u0623\u0645\u0631',b2:'\u062f\u062e\u0648\u0644 \u0627\u0644\u0645\u0634\u0631\u0641\u064a\u0646',sub:'\u064a\u0628\u0644\u063a \u0627\u0644\u0648\u0627\u0644\u062f\u0627\u0646 \u2014 \u064a\u0631\u0649 \u0627\u0644\u0645\u0634\u0631\u0641\u0648\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629.',ctah:'\u062c\u0631\u0628\u0647 \u0645\u062c\u0627\u0646\u0627\u064b',ctap:'\u0645\u0628\u0627\u0634\u0631\u0629 \u0641\u064a \u0627\u0644\u0645\u062a\u0635\u0641\u062d.',f1h:'\u0625\u0628\u0644\u0627\u063a \u0633\u0631\u064a\u0639',f1p:'\u0627\u062e\u062a\u0631 \u0627\u0644\u0648\u0642\u062a \u2014 \u0641\u064a \u062b\u0648\u0627\u0646\u064d.',f2h:'\u062a\u063a\u064a\u064a\u0631',f2p:'\u062a\u063a\u064a\u0631\u062a \u0627\u0644\u062e\u0637\u0629\u061f \u062d\u062f\u0651\u062b.',f3h:'\u062a\u062d\u062f\u064a\u062f \u0627\u0644\u0645\u062c\u0645\u0648\u0639\u0629',f3p:'\u0623\u0637\u0641\u0627\u0644 \u0627\u0644\u0633\u0627\u0639\u0629 3 \u0628\u0646\u0642\u0631\u0629.',f4h:'\u0645\u062d\u0645\u064a \u0628\u0640 PIN',f4p:'\u0644\u0644\u0645\u0634\u0631\u0641\u064a\u0646 \u0641\u0642\u0637.'},
    ru:{h1:'\u0423\u043f\u0440\u0430\u0432\u043b\u044f\u0439\u0442\u0435<br><em>\u043b\u0435\u0433\u043a\u043e</em>.',label:'\u0414\u043b\u044f \u0448\u043a\u043e\u043b',b1:'\u041a\u0430\u043a \u0440\u043e\u0434\u0438\u0442\u0435\u043b\u044c',b2:'\u0412\u0445\u043e\u0434',sub:'\u0420\u043e\u0434\u0438\u0442\u0435\u043b\u0438 \u0441\u043e\u043e\u0431\u0449\u0430\u044e\u0442 \u2014 \u0432\u043e\u0441\u043f\u0438\u0442\u0430\u0442\u0435\u043b\u0438 \u0432\u0438\u0434\u044f\u0442.',ctah:'\u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435',ctap:'\u041f\u0440\u044f\u043c\u043e \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435.',f1h:'\u0411\u044b\u0441\u0442\u0440\u043e',f1p:'\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0432\u0440\u0435\u043c\u044f.',f2h:'\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c',f2p:'\u041f\u043b\u0430\u043d\u044b? \u041e\u0431\u043d\u043e\u0432\u0438\u0442\u0435.',f3h:'\u0413\u0440\u0443\u043f\u043f\u0430',f3p:'\u0412\u0441\u0435 \u0434\u0435\u0442\u0438 15:00 \u043e\u0434\u043d\u0438\u043c \u043d\u0430\u0436\u0430\u0442\u0438\u0435\u043c.',f4h:'PIN',f4p:'\u0422\u043e\u043b\u044c\u043a\u043e \u0434\u043b\u044f \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d\u043d\u044b\u0445.'},
    en:{h1:'Manage pickup times<br><em>easily</em>.',label:'For Schools & Daycare',b1:'Start as parent',b2:'Staff login',sub:'Parents report pickup time \u2014 staff see the list instantly.',ctah:'Try for free',ctap:'Directly in the browser.',f1h:'Quick entry',f1p:'Pick time \u2014 done in seconds.',f2h:'Change anytime',f2p:'Plans changed? Update.',f3h:'Check off groups',f3p:'All 3pm children one click.',f4h:'PIN protected',f4p:'Authorized staff only.'},
    fr:{h1:'G\u00e9rez les horaires<br><em>facilement</em>.',label:'\u00c9coles et garderies',b1:'Comme parent',b2:'Connexion',sub:'Les parents signalent \u2014 le personnel voit la liste.',ctah:'Essayez',ctap:'Dans le navigateur.',f1h:'Saisie rapide',f1p:'Choisissez \u2014 en secondes.',f2h:'Modifier',f2p:'Plans chang\u00e9s? Mettez \u00e0 jour.',f3h:'Cocher le groupe',f3p:'Enfants de 15h en un clic.',f4h:'Prot\u00e9g\u00e9 par PIN',f4p:'Personnel autoris\u00e9.'},
    pl:{h1:'\u0141atwo zarz\u0105dzaj<br><em>godzinami</em>.',label:'Dla szk\u00f3\u0142',b1:'Jako rodzic',b2:'Logowanie',sub:'Rodzice zg\u0142aszaj\u0105 \u2014 opiekunowie widz\u0105.',ctah:'Wypr\u00f3buj',ctap:'W przegl\u0105darce.',f1h:'Szybko',f1p:'Wybierz godzin\u0119.',f2h:'Zmie\u0144',f2p:'Plany? Zaktualizuj.',f3h:'Grupa',f3p:'15:00 jednym klikni\u0119ciem.',f4h:'PIN',f4p:'Tylko upowa\u017cnieni.'},
    it:{h1:'Gestisci gli orari<br><em>facilmente</em>.',label:'Scuole e asili',b1:'Come genitore',b2:'Accesso',sub:'I genitori segnalano \u2014 il personale vede.',ctah:'Prova',ctap:'Nel browser.',f1h:'Rapido',f1p:'Scegli l\u2019orario.',f2h:'Modifica',f2p:'Piani cambiati? Aggiorna.',f3h:'Gruppo',f3p:'Bambini delle 15 un clic.',f4h:'PIN',f4p:'Solo personale.'},
    es:{h1:'Gestiona horarios<br><em>f\u00e1cilmente</em>.',label:'Escuelas',b1:'Como padre',b2:'Acceso',sub:'Los padres informan \u2014 el personal ve la lista.',ctah:'Prueba',ctap:'En el navegador.',f1h:'R\u00e1pido',f1p:'Elige la hora.',f2h:'Cambiar',f2p:'Planes? Actualiza.',f3h:'Grupo',f3p:'Ni\u00f1os de las 15h un clic.',f4h:'PIN',f4p:'Solo autorizado.'},
    ro:{h1:'Gestiona\u021bi orele<br><em>u\u0219or</em>.',label:'\u0218coli',b1:'Ca p\u0103rinte',b2:'Autentificare',sub:'P\u0103rin\u021bii raporteaz\u0103 \u2014 personalul vede.',ctah:'\u00cencerca\u021bi',ctap:'\u00cen browser.',f1h:'Rapid',f1p:'Alege\u021bi ora.',f2h:'Modifica\u021bi',f2p:'Planuri? Actualiza\u021bi.',f3h:'Grup',f3p:'15:00 un clic.',f4h:'PIN',f4p:'Personal autorizat.'},
    uk:{h1:'\u041b\u0435\u0433\u043a\u043e \u043a\u0435\u0440\u0443\u0439\u0442\u0435<br><em>\u0447\u0430\u0441\u043e\u043c</em>.',label:'\u0428\u043a\u043e\u043b\u0438',b1:'\u042f\u043a \u0431\u0430\u0442\u044c\u043a\u043e',b2:'\u0412\u0445\u0456\u0434',sub:'\u0411\u0430\u0442\u044c\u043a\u0438 \u043f\u043e\u0432\u0456\u0434\u043e\u043c\u043b\u044f\u044e\u0442\u044c \u2014 \u0432\u0438\u0445\u043e\u0432\u0430\u0442\u0435\u043b\u0456 \u0431\u0430\u0447\u0430\u0442\u044c.',ctah:'\u0421\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435',ctap:'\u0412 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0456.',f1h:'\u0428\u0432\u0438\u0434\u043a\u043e',f1p:'\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u0447\u0430\u0441.',f2h:'\u0417\u043c\u0456\u043d\u0438\u0442\u0438',f2p:'\u041f\u043b\u0430\u043d\u0438? \u041e\u043d\u043e\u0432\u0456\u0442\u044c.',f3h:'\u0413\u0440\u0443\u043f\u0430',f3p:'15:00 \u043e\u0434\u043d\u0438\u043c \u043a\u043b\u0456\u043a\u043e\u043c.',f4h:'PIN',f4p:'\u041b\u0438\u0448\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d\u0456.'},
    hr:{h1:'Jednostavno<br><em>upravljajte</em>.',label:'\u0160kole i vrti\u0107i',b1:'Kao roditelj',b2:'Prijava',sub:'Roditelji javljaju \u2014 osoblje vidi.',ctah:'Isprobajte',ctap:'U pregledniku.',f1h:'Brzo',f1p:'Odaberite vrijeme.',f2h:'Promijeni',f2p:'Planovi? A\u017euriraj.',f3h:'Grupa',f3p:'15h jednim klikom.',f4h:'PIN',f4p:'Samo ovla\u0161teni.'},
    fa:{h1:'\u0645\u062f\u06cc\u0631\u06cc\u062a \u0622\u0633\u0627\u0646<br><em>\u0632\u0645\u0627\u0646\u200c\u0647\u0627</em>.',label:'\u0645\u062f\u0627\u0631\u0633',b1:'\u0648\u0627\u0644\u062f\u06cc\u0646',b2:'\u0648\u0631\u0648\u062f',sub:'\u0648\u0627\u0644\u062f\u06cc\u0646 \u0627\u0637\u0644\u0627\u0639 \u0645\u06cc\u200c\u062f\u0647\u0646\u062f \u2014 \u0645\u0631\u0627\u0642\u0628\u0627\u0646 \u0645\u06cc\u200c\u0628\u06cc\u0646\u0646\u062f.',ctah:'\u0631\u0627\u06cc\u06af\u0627\u0646',ctap:'\u062f\u0631 \u0645\u0631\u0648\u0631\u06af\u0631.',f1h:'\u0633\u0631\u06cc\u0639',f1p:'\u0632\u0645\u0627\u0646 \u0631\u0627 \u0627\u0646\u062a\u062e\u0627\u0628 \u06a9\u0646\u06cc\u062f.',f2h:'\u062a\u063a\u06cc\u06cc\u0631',f2p:'\u0628\u0647\u200c\u0631\u0648\u0632 \u06a9\u0646\u06cc\u062f.',f3h:'\u06af\u0631\u0648\u0647',f3p:'\u0633\u0627\u0639\u062a \u06f3 \u06cc\u06a9 \u06a9\u0644\u06cc\u06a9.',f4h:'PIN',f4p:'\u0641\u0642\u0637 \u0645\u062c\u0627\u0632.'}
  };
  var hx=hpx[l]||hpx['de'];
  s('t-hb1',hx.b1);s('t-hb2',hx.b2);s('t-nav',hx.b2);s('t-hsub',hx.sub);
  s('t-ctah',hx.ctah);s('t-cb1',hx.b1);s('t-cb2',hx.b2);
  s('t-hlabel',hx.label);s('t-ctap',hx.ctap);
  s('t-f1h',hx.f1h);s('t-f1p',hx.f1p);s('t-f2h',hx.f2h);s('t-f2p',hx.f2p);
  s('t-f3h',hx.f3h);s('t-f3p',hx.f3p);s('t-f4h',hx.f4h);s('t-f4p',hx.f4p);
  var h1el=document.getElementById('t-h1');if(h1el)h1el.innerHTML=hx.h1;

  // Weitere Übersetzungen
  var tx={
    de:{lt1:'Alle Kinder',lt2:'Früher gehen',lt3:'Abgeholt',clear:'Sonder-Abholungen leeren',back:'Zurück',s1:'Gesamt',s2:'Früher gehen',s3:'Abgeholt',pin:'PIN-Code',login:'Einloggen',vtpin:'Betreuer-Login',vspin:'Nur für autorisiertes Personal.',vtadmin:'Admin – Kinderliste',vsadmin:'Kinder hinzufügen, suchen oder entfernen.',addkind:'Kind hinzufügen',bulk:'Alle hinzufügen',delall:'Alle Kinder löschen',aendernbtn:'Änderung speichern',loeschenbtn:'Eintrag löschen',tag:'Wochentag'},
    tr:{lt1:'Tüm Çocuklar',lt2:'Erken gidenler',lt3:'Alındı',clear:'Temizle',back:'Geri',s1:'Toplam',s2:'Erken',s3:'Alındı',pin:'PIN kodu',login:'Giriş',vtpin:'Bakıcı Girişi',vspin:'Yalnızca yetkili personel.',vtadmin:'Admin – Çocuk Listesi',vsadmin:'Çocuk ekle, ara veya sil.',addkind:'Çocuk ekle',bulk:'Tümünü ekle',delall:'Tümünü sil',aendernbtn:'Kaydet',loeschenbtn:'Sil',tag:'Gün'},
    ar:{lt1:'جميع الأطفال',lt2:'مغادرة مبكرة',lt3:'تم الاستلام',clear:'مسح',back:'رجوع',s1:'الإجمالي',s2:'مبكر',s3:'تم',pin:'رمز PIN',login:'دخول',vtpin:'دخول المشرفين',vspin:'للموظفين المعتمدين فقط.',vtadmin:'إدارة – قائمة الأطفال',vsadmin:'إضافة أو بحث أو حذف.',addkind:'إضافة طفل',bulk:'إضافة الكل',delall:'حذف الكل',aendernbtn:'حفظ',loeschenbtn:'حذف',tag:'اليوم'},
    ru:{lt1:'Все дети',lt2:'Ранний уход',lt3:'Забраны',clear:'Очистить',back:'Назад',s1:'Всего',s2:'Ранний',s3:'Забраны',pin:'PIN-код',login:'Войти',vtpin:'Вход',vspin:'Только для персонала.',vtadmin:'Админ – Список детей',vsadmin:'Добавить, найти или удалить.',addkind:'Добавить',bulk:'Добавить все',delall:'Удалить все',aendernbtn:'Сохранить',loeschenbtn:'Удалить',tag:'День'},
    en:{lt1:'All Children',lt2:'Early pickup',lt3:'Picked up',clear:'Clear list',back:'Back',s1:'Total',s2:'Early',s3:'Done',pin:'PIN code',login:'Login',vtpin:'Staff Login',vspin:'Authorized personnel only.',vtadmin:'Admin – Children',vsadmin:'Add, search or remove children.',addkind:'Add child',bulk:'Add all',delall:'Delete all',aendernbtn:'Save changes',loeschenbtn:'Delete entry',tag:'Day'},
    fr:{lt1:'Tous les enfants',lt2:'Départ anticipé',lt3:'Récupérés',clear:'Vider',back:'Retour',s1:'Total',s2:'Anticipé',s3:'Récupérés',pin:'Code PIN',login:'Connexion',vtpin:'Connexion',vspin:'Personnel autorisé.',vtadmin:'Admin – Enfants',vsadmin:'Ajouter, chercher ou supprimer.',addkind:'Ajouter',bulk:'Ajouter tout',delall:'Tout supprimer',aendernbtn:'Enregistrer',loeschenbtn:'Supprimer',tag:'Jour'},
    pl:{lt1:'Wszystkie dzieci',lt2:'Wcześniej',lt3:'Odebrane',clear:'Wyczyść',back:'Wstecz',s1:'Łącznie',s2:'Wcześniej',s3:'Odebrane',pin:'Kod PIN',login:'Zaloguj',vtpin:'Logowanie',vspin:'Tylko upoważnieni.',vtadmin:'Admin – Dzieci',vsadmin:'Dodaj, szukaj lub usuń.',addkind:'Dodaj',bulk:'Dodaj wszystko',delall:'Usuń wszystko',aendernbtn:'Zapisz',loeschenbtn:'Usuń',tag:'Dzień'},
    it:{lt1:'Tutti i bambini',lt2:'Uscita anticipata',lt3:'Ritirati',clear:'Svuota',back:'Indietro',s1:'Totale',s2:'Anticipata',s3:'Ritirati',pin:'Codice PIN',login:'Accedi',vtpin:'Accesso',vspin:'Solo personale.',vtadmin:'Admin – Bambini',vsadmin:'Aggiungi, cerca o rimuovi.',addkind:'Aggiungi',bulk:'Aggiungi tutti',delall:'Elimina tutti',aendernbtn:'Salva',loeschenbtn:'Elimina',tag:'Giorno'},
    es:{lt1:'Todos los niños',lt2:'Salida anticipada',lt3:'Recogidos',clear:'Vaciar',back:'Volver',s1:'Total',s2:'Anticipada',s3:'Recogidos',pin:'Código PIN',login:'Entrar',vtpin:'Acceso',vspin:'Solo autorizado.',vtadmin:'Admin – Niños',vsadmin:'Añadir, buscar o eliminar.',addkind:'Añadir',bulk:'Añadir todos',delall:'Eliminar todos',aendernbtn:'Guardar',loeschenbtn:'Eliminar',tag:'Día'},
    ro:{lt1:'Toți copiii',lt2:'Plecare devreme',lt3:'Preluați',clear:'Golește',back:'Înapoi',s1:'Total',s2:'Devreme',s3:'Preluați',pin:'Cod PIN',login:'Autentificare',vtpin:'Autentificare',vspin:'Numai personal.',vtadmin:'Admin – Copii',vsadmin:'Adăugați, căutați sau ștergeți.',addkind:'Adaugă',bulk:'Adaugă tot',delall:'Șterge tot',aendernbtn:'Salvează',loeschenbtn:'Șterge',tag:'Zi'},
    uk:{lt1:'Всі діти',lt2:'Раніше',lt3:'Забрані',clear:'Очистити',back:'Назад',s1:'Всього',s2:'Раніше',s3:'Забрані',pin:'PIN-код',login:'Увійти',vtpin:'Вхід',vspin:'Лише персонал.',vtadmin:'Адмін – Діти',vsadmin:'Додати, шукати або видалити.',addkind:'Додати',bulk:'Додати все',delall:'Видалити все',aendernbtn:'Зберегти',loeschenbtn:'Видалити',tag:'День'},
    hr:{lt1:'Sva djeca',lt2:'Ranije',lt3:'Preuzeti',clear:'Očisti',back:'Natrag',s1:'Ukupno',s2:'Ranije',s3:'Preuzeti',pin:'PIN kod',login:'Prijava',vtpin:'Prijava',vspin:'Samo ovlašteni.',vtadmin:'Admin – Djeca',vsadmin:'Dodaj, traži ili obriši.',addkind:'Dodaj',bulk:'Dodaj sve',delall:'Obriši sve',aendernbtn:'Spremi',loeschenbtn:'Obriši',tag:'Dan'},
    fa:{lt1:'همه کودکان',lt2:'زودتر',lt3:'تحویل شده',clear:'پاک کردن',back:'بازگشت',s1:'مجموع',s2:'زودتر',s3:'تحویل',pin:'کد PIN',login:'ورود',vtpin:'ورود',vspin:'فقط مجاز.',vtadmin:'مدیریت – کودکان',vsadmin:'اضافه، جستجو یا حذف.',addkind:'اضافه',bulk:'اضافه همه',delall:'حذف همه',aendernbtn:'ذخیره',loeschenbtn:'حذف',tag:'روز'}
  };
  var xx=tx[l]||tx['de'];
  s('t-lt1',xx.lt1);s('t-lt2',xx.lt2);s('t-lt3',xx.lt3);
  s('t-btn-clear',xx.clear);s('t-back',xx.back);
  s('t-s1',xx.s1);s('t-s2',xx.s2);s('t-s3',xx.s3);
  s('t-fl-pin',xx.pin);s('t-btn-login',xx.login);
  s('t-vt-pin',xx.vtpin);s('t-vs-pin',xx.vspin);
  s('t-vt-admin',xx.vtadmin);s('t-vs-admin',xx.vsadmin);
  s('t-btn-kind',xx.addkind);s('t-btn-bulk',xx.bulk);s('t-btn-allekind',xx.delall);
  s('t-btn-aendern',xx.aendernbtn);s('t-btn-eloeschen',xx.loeschenbtn);
  s('t-consent-title','🔒 '+(d.ds||'Datenschutzerklärung'));
  s('t-consent-check',d.dc||'Ich stimme der Datenschutzerklärung zu');

  // Rest
  var rx={
    de:{tabe:'Eltern',tabp:'Login',tabl:'Liste',taba:'Admin',hint:'🔒 Daten werden um Mitternacht automatisch gelöscht.',bct:'🔒 Datenschutz für Betreuer',bctext:'Ich verpflichte mich, die Daten vertraulich zu behandeln und nicht an Dritte weiterzugeben.',bccheck:'Ich stimme zu und verpflichte mich zur Vertraulichkeit',badge:'🏫 Grundschule am Hengstbach',dstrip:'🔒 Liste wird täglich um Mitternacht gelöscht.',akvn:'Vorname',aknn:'Nachname',akkl:'Klasse',akzeit:'Reguläre Abholzeit',akbulk:'Mehrere Kinder auf einmal hinzufügen',akfmt:'Format: Name oder Name, Klasse oder Name, Klasse, Uhrzeit',ectext:'Ich bin damit einverstanden, dass die Abholzeiten meines Kindes digital erfasst und den Betreuern angezeigt werden. Alle Daten werden täglich um Mitternacht gelöscht.'},
    tr:{tabe:'Ebeveyn',tabp:'Giriş',tabl:'Liste',taba:'Admin',hint:'🔒 Veriler gece yarısı otomatik silinir.',bct:'🔒 Bakıcı Gizliliği',bctext:'Verileri gizli tutmayı ve üçüncü şahıslarla paylaşmamayı taahhüt ediyorum.',bccheck:'Kabul ediyorum',badge:'🏫 Grundschule am Hengstbach',dstrip:'🔒 Liste her gece yarısı silinir.',akvn:'Ad',aknn:'Soyad',akkl:'Sınıf',akzeit:'Normal alış saati',akbulk:'Birden fazla çocuk ekle',akfmt:'Format: Ad veya Ad, Sınıf veya Ad, Sınıf, Saat',ectext:'Çocuğumun alış saatlerinin kaydedilmesini kabul ediyorum. Veriler gece yarısı silinir.'},
    ar:{tabe:'الوالدان',tabp:'دخول',tabl:'القائمة',taba:'إدارة',hint:'🔒 تُحذف البيانات تلقائياً عند منتصف الليل.',bct:'🔒 خصوصية المشرفين',bctext:'أتعهد بالحفاظ على سرية البيانات وعدم مشاركتها.',bccheck:'أوافق وأتعهد بالسرية',badge:'🏫 Grundschule am Hengstbach',dstrip:'🔒 تُحذف القائمة يومياً عند منتصف الليل.',akvn:'الاسم',aknn:'اللقب',akkl:'الصف',akzeit:'وقت الاستلام المعتاد',akbulk:'إضافة عدة أطفال',akfmt:'الصيغة: اسم أو اسم، صف أو اسم، صف، وقت',ectext:'أوافق على تسجيل أوقات استلام طفلي. تُحذف البيانات عند منتصف الليل.'},
    ru:{tabe:'Родители',tabp:'Вход',tabl:'Список',taba:'Админ',hint:'🔒 Данные удаляются в полночь.',bct:'🔒 Конфиденциальность',bctext:'Обязуюсь сохранять конфиденциальность данных.',bccheck:'Согласен и обязуюсь',badge:'🏫 Grundschule am Hengstbach',dstrip:'🔒 Список удаляется ежедневно в полночь.',akvn:'Имя',aknn:'Фамилия',akkl:'Класс',akzeit:'Обычное время',akbulk:'Добавить несколько детей',akfmt:'Формат: Имя или Имя, Класс или Имя, Класс, Время',ectext:'Согласен на регистрацию времени. Данные удаляются в полночь.'},
    en:{tabe:'Parents',tabp:'Login',tabl:'List',taba:'Admin',hint:'🔒 Data is automatically deleted at midnight.',bct:'🔒 Staff Privacy',bctext:'I commit to treating all data confidentially.',bccheck:'I agree and commit to confidentiality',badge:'🏫 Grundschule am Hengstbach',dstrip:'🔒 List is automatically deleted at midnight.',akvn:'First name',aknn:'Last name',akkl:'Class',akzeit:'Regular pickup time',akbulk:'Add multiple children at once',akfmt:'Format: Name or Name, Class or Name, Class, Time',ectext:'I agree that my child pickup times are recorded. Data is deleted at midnight.'},
    fr:{tabe:'Parents',tabp:'Connexion',tabl:'Liste',taba:'Admin',hint:'🔒 Données supprimées à minuit.',bct:'🔒 Confidentialité',bctext:'Je m\u2019engage à traiter les données confidentiellement.',bccheck:'J\u2019accepte',badge:'🏫 Grundschule am Hengstbach',dstrip:'🔒 Liste supprimée chaque nuit.',akvn:'Prénom',aknn:'Nom',akkl:'Classe',akzeit:'Heure habituelle',akbulk:'Ajouter plusieurs enfants',akfmt:'Format: Nom ou Nom, Classe ou Nom, Classe, Heure',ectext:'J\u2019accepte l\u2019enregistrement des horaires. Données supprimées à minuit.'},
    pl:{tabe:'Rodzice',tabp:'Logowanie',tabl:'Lista',taba:'Admin',hint:'🔒 Dane usuwane o północy.',bct:'🔒 Poufność',bctext:'Zobowiązuję się do poufności danych.',bccheck:'Akceptuję i zobowiązuję się',badge:'🏫 Grundschule am Hengstbach',dstrip:'🔒 Lista usuwana codziennie o północy.',akvn:'Imię',aknn:'Nazwisko',akkl:'Klasa',akzeit:'Zwykła godzina',akbulk:'Dodaj wiele dzieci',akfmt:'Format: Imię lub Imię, Klasa lub Imię, Klasa, Godzina',ectext:'Wyrażam zgodę na rejestrację godzin. Dane usuwane o północy.'},
    it:{tabe:'Genitori',tabp:'Accesso',tabl:'Lista',taba:'Admin',hint:'🔒 Dati cancellati a mezzanotte.',bct:'🔒 Riservatezza',bctext:'Mi impegno a trattare i dati in modo confidenziale.',bccheck:'Accetto e mi impegno',badge:'🏫 Grundschule am Hengstbach',dstrip:'🔒 Lista cancellata ogni notte.',akvn:'Nome',aknn:'Cognome',akkl:'Classe',akzeit:'Orario abituale',akbulk:'Aggiungi più bambini',akfmt:'Formato: Nome o Nome, Classe o Nome, Classe, Ora',ectext:'Acconsento alla registrazione degli orari. Dati cancellati a mezzanotte.'},
    es:{tabe:'Padres',tabp:'Acceso',tabl:'Lista',taba:'Admin',hint:'🔒 Datos eliminados a medianoche.',bct:'🔒 Confidencialidad',bctext:'Me comprometo a tratar los datos confidencialmente.',bccheck:'Acepto y me comprometo',badge:'🏫 Grundschule am Hengstbach',dstrip:'🔒 Lista eliminada cada noche.',akvn:'Nombre',aknn:'Apellido',akkl:'Clase',akzeit:'Hora habitual',akbulk:'Añadir varios niños',akfmt:'Formato: Nombre o Nombre, Clase o Nombre, Clase, Hora',ectext:'Acepto el registro de horarios. Datos eliminados a medianoche.'},
    ro:{tabe:'Părinți',tabp:'Autentificare',tabl:'Lista',taba:'Admin',hint:'🔒 Date șterse la miezul nopții.',bct:'🔒 Confidențialitate',bctext:'Mă angajez să tratez datele confidențial.',bccheck:'Accept și mă angajez',badge:'🏫 Grundschule am Hengstbach',dstrip:'🔒 Lista ștearsă în fiecare noapte.',akvn:'Prenume',aknn:'Nume',akkl:'Clasă',akzeit:'Ora obișnuită',akbulk:'Adaugă mai mulți copii',akfmt:'Format: Nume sau Nume, Clasă sau Nume, Clasă, Oră',ectext:'Accept înregistrarea orelor. Date șterse la miezul nopții.'},
    uk:{tabe:'Батьки',tabp:'Вхід',tabl:'Список',taba:'Адмін',hint:'🔒 Дані видаляються опівночі.',bct:'🔒 Конфіденційність',bctext:'Зобов\u2019язуюсь зберігати конфіденційність даних.',bccheck:'Погоджуюсь і зобов\u2019язуюсь',badge:'🏫 Grundschule am Hengstbach',dstrip:'🔒 Список видаляється щоночі.',akvn:'Ім\u2019я',aknn:'Прізвище',akkl:'Клас',akzeit:'Звичайний час',akbulk:'Додати кількох дітей',akfmt:'Формат: Ім\u2019я або Ім\u2019я, Клас або Ім\u2019я, Клас, Час',ectext:'Погоджуюсь на реєстрацію часу. Дані видаляються опівночі.'},
    hr:{tabe:'Roditelji',tabp:'Prijava',tabl:'Popis',taba:'Admin',hint:'🔒 Podaci se brišu u ponoć.',bct:'🔒 Povjerljivost',bctext:'Obvezujem se čuvati podatke povjerljivima.',bccheck:'Prihvaćam i obvezujem se',badge:'🏫 Grundschule am Hengstbach',dstrip:'🔒 Popis se briše svake noći.',akvn:'Ime',aknn:'Prezime',akkl:'Razred',akzeit:'Uobičajeno vrijeme',akbulk:'Dodaj više djece',akfmt:'Format: Ime ili Ime, Razred ili Ime, Razred, Vrijeme',ectext:'Pristajem na bilježenje vremena. Podaci se brišu u ponoć.'},
    fa:{tabe:'والدین',tabp:'ورود',tabl:'لیست',taba:'مدیریت',hint:'🔒 داده\u200cها در نیمه\u200cشب حذف می\u200cشوند.',bct:'🔒 حریم خصوصی',bctext:'متعهد می\u200cشوم داده\u200cها را محرمانه نگه دارم.',bccheck:'می\u200cپذیرم و متعهد می\u200cشوم',badge:'🏫 Grundschule am Hengstbach',dstrip:'🔒 لیست هر شب حذف می\u200cشود.',akvn:'نام',aknn:'نام خانوادگی',akkl:'کلاس',akzeit:'زمان معمول',akbulk:'اضافه کردن چند کودک',akfmt:'فرمت: نام یا نام، کلاس یا نام، کلاس، زمان',ectext:'موافقم که زمان تحویل ثبت شود. داده\u200cها در نیمه\u200cشب حذف می\u200cشوند.'}
  };
  var rr=rx[l]||rx['de'];
  s('t-tab-e',rr.tabe);s('t-tab-p',rr.tabp);s('t-tab-l',rr.tabl);s('t-tab-a',rr.taba);
  s('t-hint',rr.hint);s('t-bc-title',rr.bct);s('t-bc-text',rr.bctext);s('t-bc-check',rr.bccheck);
  s('t-badge',rr.badge);s('t-dstrip',rr.dstrip);
  s('t-ak-vn',rr.akvn);s('t-ak-nn',rr.aknn);s('t-ak-kl',rr.akkl);s('t-ak-zeit',rr.akzeit);
  s('t-ak-bulk',rr.akbulk);s('t-ak-fmt',rr.akfmt);s('t-ec-text',rr.ectext);

  var fls=document.querySelectorAll('#ep1 .fl');
  if(fls.length>=4){fls[0].textContent='Tag';fls[1].textContent=d.vn;fls[2].textContent=d.nn;fls[3].textContent=d.z;}
  if(fls.length>=5)fls[4].innerHTML=d.ab+' <span class="opt">(optional)</span>';
}

function bulkAdd(){
  hide('kb-ok');hide('kb-err');
  var text=document.getElementById('k-bulk').value.trim();
  if(!text){show('kb-err','Bitte Namen eingeben.');return;}
  var lines=text.split('\n');
  var kinder=getKinder();
  var added=0;
  var skipped=[];
  for(var i=0;i<lines.length;i++){
    var line=lines[i].trim();
    if(!line)continue;
    var parts=line.split(',');
    var name=parts[0].trim();
    var klasse=parts[1]?parts[1].trim():'–';
    var zeit=parts[2]?parts[2].trim():'15:00';
    if(!name)continue;
    if(name.indexOf(' ')<0){skipped.push(name+' (Vor- und Nachname nötig)');continue;}
    if(kinder.find(function(k){return k.name.toLowerCase()===name.toLowerCase();})){skipped.push(name+' (bereits vorhanden)');continue;}
    kinder.push({name:name,klasse:klasse,zeit:zeit});
    kbPost({name:name,klasse:klasse,zeit:zeit});
    added++;
  }
  kinder.sort(function(a,b){return a.name.localeCompare(b.name);});
  saveKinder(kinder);
  var msg=added+' Kind'+(added!==1?'er':'')+' hinzugefügt.';
  if(skipped.length)msg+=' Übersprungen: '+skipped.join(', ');
  show('kb-ok',msg);
  document.getElementById('k-bulk').value='';
  renderAdmin();
}

document.addEventListener('DOMContentLoaded',function(){
  if(!localStorage.getItem('cookie_ok'))document.getElementById('cookie-banner').style.display='block';
  var b=document.querySelectorAll('button,.tab,.stab,.day,.crow');
  for(var i=0;i<b.length;i++){b[i].addEventListener('touchend',function(e){e.preventDefault();this.click();});}
});
