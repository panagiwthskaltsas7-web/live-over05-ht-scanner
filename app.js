const $ = id => document.getElementById(id);
let threshold = 10;
let signals = [];
// DEMO ONLY: replace this adapter with a licensed live-odds provider.
// Never scrape bookmaker sites or bypass access controls.
let games = [
 {id:"demo-1",name:"Demo FC – Sample United",minute:32,stoiximan:1.48,bet365:1.46,baselineS:1.82,baselineB:1.79,drop:18.9,state:"high"},
 {id:"demo-2",name:"Example City – Test Rovers",minute:26,stoiximan:1.62,bet365:1.64,baselineS:1.75,baselineB:1.77,drop:7.4,state:"watch"},
 {id:"demo-3",name:"Preview Athletic – Mock Town",minute:18,stoiximan:1.85,bet365:1.87,baselineS:1.90,baselineB:1.92,drop:2.6,state:"normal"}
];
function render(){
 $("count").textContent=games.length;
 $("signals").textContent=signals.length;
 $("updated").textContent=new Date().toLocaleTimeString("el-GR",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
 $("matches").innerHTML=games.map(g=>{
  const state=g.state==="high"?"high":g.state==="watch"?"watch":"normal";
  const label=g.state==="high"?"Ισχυρή κίνηση":g.state==="watch"?"Υπό παρακολούθηση":"Κανονική κίνηση";
  return `<article class="match">
   <div class="matchhead"><div><div class="matchname">${g.name}</div><div class="minute">${g.minute}' · Over 0.5 HT</div></div><span class="status ${state}">${label}</span></div>
   <div class="odds">${g.baselineS.toFixed(2)} → ${g.stoiximan.toFixed(2)}</div>
   <div class="drop">Μεταβολή περίπου -${g.drop.toFixed(1)}% · ενδεικτική</div>
   <div class="sourcegrid"><div class="source"><small>Stoiximan · demo</small><b>${g.stoiximan.toFixed(2)}</b></div><div class="source"><small>Bet365 · demo</small><b>${g.bet365.toFixed(2)}</b></div></div>
   <div class="bar"><span style="width:${Math.min(g.drop*3,100)}%"></span></div>
  </article>`;
 }).join("");
 $("historyList").innerHTML=signals.length?signals.map(s=>`<div class="historyitem"><span>${s.name} · ${s.minute}'</span><b>-${s.drop.toFixed(1)}%</b></div>`).join(""):"Δεν υπάρχουν ακόμη σήματα.";
}
function detect(g){
 // A real implementation must compare time-adjusted odds using a historical baseline.
 const avgDrop=(1-((g.stoiximan+g.bet365)/2)/((g.baselineS+g.baselineB)/2))*100;
 return avgDrop>=threshold && g.minute>=15 && g.minute<=43;
}
function demoTick(){
 // Synthetic movement to demonstrate UI only; not connected to bookmaker feeds.
 games=games.map(g=>{
  if(g.minute<43 && Math.random()>.35){
   const delta=Math.random()*.035;
   return {...g,minute:Math.min(43,g.minute+1),stoiximan:Math.max(1.05,g.stoiximan-delta),bet365:Math.max(1.05,g.bet365-delta*.9)};
  }
  return g;
 }).map(g=>{
  const drop=(1-((g.stoiximan+g.bet365)/2)/((g.baselineS+g.baselineB)/2))*100;
  return {...g,drop,state:detect({...g,drop})?"high":drop>=threshold*.55?"watch":"normal"};
 });
 const newHigh=games.filter(g=>g.state==="high"&&!signals.some(s=>s.id===g.id));
 newHigh.forEach(g=>{signals.unshift({...g});notify(g);});
 render();
}
function notify(g){
 if("Notification" in window && Notification.permission==="granted"){
  new Notification("Live HT Scanner – κίνηση απόδοσης",{body:`${g.name}: ασυνήθιστη πτώση στην αγορά Over 0.5 HT (DEMO).`});
 }
}
$("threshold").addEventListener("input",e=>{threshold=Number(e.target.value);$("thresholdValue").textContent=threshold;});
$("notifyBtn").addEventListener("click",async()=>{
 if(!("Notification" in window)){alert("Οι ειδοποιήσεις δεν υποστηρίζονται σε αυτό το περιβάλλον.");return;}
 const p=await Notification.requestPermission();
 alert(p==="granted"?"Οι ειδοποιήσεις ενεργοποιήθηκαν για αυτή τη δοκιμή.":"Δεν δόθηκε άδεια ειδοποιήσεων.");
});
if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
render();
setInterval(demoTick,5000);
