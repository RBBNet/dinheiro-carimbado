(() => {
  const $ = s => document.querySelector(s);
  const abi = [
    "event PaidCompany(address indexed agency,address indexed company,uint16 indexed ano,bytes32 area,uint256 amount,string agencyName,string companyName)"
  ];

  let provider, contract, isConnected=false;
  const seen = new Set(), blockCache=new Map();

  const els = {
    statusDot: $("#connectionStatus"),
    statusText: $("#statusText"),
    net: $("#networkName"),
    addr: $("#contractAddress"),
    blk: $("#lastBlock"),
    inp: $("#addrInput"),
    btnConnect: $("#connectBtn"),
    btnBackfill: $("#backfillBtn"),
    btnClear: $("#clearBtn"),
    btnSave: $("#saveAddr"),
    btnClearAddr: $("#clearAddr"),
    log: $("#eventsLog")
  };

  function shorten(a){return a?a.slice(0,6)+"…"+a.slice(-4):a;}
  function b32ToStr(b){
    if(!b) return "";
    const h=b.slice(2); let out="";
    for(let i=0;i<h.length;i+=2){ const v=parseInt(h.slice(i,i+2),16); if(!v) break; out+=String.fromCharCode(v);} 
    return out;
  }
  function setStatus(ok){
    isConnected=ok;
    els.statusDot.className="status-dot "+(ok?"online":"offline");
    els.statusText.textContent=ok?"On":"Off";
    els.btnConnect.textContent= ok?"🔌 Reconectar":"🔌 Conectar";
  }
  async function ensureBlockTime(n){
    if(!blockCache.has(n)){
      const b=await provider.getBlock(n);
      blockCache.set(n,new Date(Number(b.timestamp)*1000));
    }
    return blockCache.get(n);
  }
  function render(ev){
    const id=`${ev.transactionHash}#${ev.logIndex}`;
    if(seen.has(id)) return; seen.add(id);

    const [agency, company, ano, area, amount, agencyName, companyName] = ev.args;
    const wrap=document.createElement("article");
    wrap.className="event";
    wrap.innerHTML=`
      <div class="event-header">
        <span class="badge">PaidCompany</span>
        <div class="time" data-block="${ev.blockNumber}">bloco ${ev.blockNumber}</div>
      </div>
      <div class="field"><div class="label">Ano</div><span>${ano}</span></div>
      <div class="field"><div class="label">Área</div><span>${b32ToStr(area)}</span></div>
      <div class="field"><div class="label">Valor</div><span class="amount">${amount}</span></div>
      <div class="field"><div class="label">Agência</div><span class="entity"><strong>${agencyName||"—"}</strong><small title="${agency}">${shorten(agency)}</small></span></div>
      <div class="field"><div class="label">Empresa</div><span class="entity"><strong>${companyName||"—"}</strong><small title="${company}">${shorten(company)}</small></span></div>
      <div class="tx"><strong>Tx:</strong> ${ev.transactionHash}</div>
    `;
    els.log.prepend(wrap);
    const all = els.log.querySelectorAll(".event");
    if(all.length>300) all[all.length-1].remove();
    ensureBlockTime(ev.blockNumber).then(d=>{
      const t=wrap.querySelector('.time');
      if(t) t.textContent = d.toLocaleString('pt-BR');
    });
  }
  function listen(){
    contract.removeAllListeners();
    contract.on("PaidCompany", (...a)=>{ const ev=a[a.length-1]; render(ev); });
  }
  async function backfill(){
    if(!contract) return; try{
      const latest=await provider.getBlockNumber();
      const from= latest>4000? latest-4000:0;
      const logs=await contract.queryFilter(contract.filters.PaidCompany, from, latest);
      logs.forEach(render);
      console.log(`Backfill ${logs.length} eventos.`);
    }catch(e){console.error(e);} }
  async function tickBlocks(){ if(!provider) return; try{ els.blk.textContent=(await provider.getBlockNumber()).toString(); }catch{} }
  async function connect(){
    try{
      if(!window.ethereum){ alert("MetaMask não encontrado."); return; }
      provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const net=await provider.getNetwork();
      els.net.textContent = net.name || `Chain ${net.chainId}`;
      let addr=(els.inp.value||"").trim()||localStorage.getItem('dinheiroCarimbadoAddress');
      if(!addr) addr = prompt("Endereço do contrato:")||"";
      if(!ethers.isAddress(addr)) throw new Error("Endereço inválido");
      localStorage.setItem('dinheiroCarimbadoAddress', addr);
      els.inp.value=addr; els.addr.textContent=shorten(addr);
      contract=new ethers.Contract(addr, abi, provider);
      listen(); await backfill(); await tickBlocks(); setStatus(true);
      if(!window._blkTimer) window._blkTimer=setInterval(tickBlocks,5000);
    }catch(e){ console.error(e); alert(e.message||e); setStatus(false); }
  }
  function clearLog(){ els.log.innerHTML=`<div class="placeholder"><div>🧹</div><p>Log limpo</p><small>Aguardando novos pagamentos...</small></div>`; seen.clear(); }
  els.btnConnect.addEventListener('click', connect);
  els.btnBackfill.addEventListener('click', backfill);
  els.btnClear.addEventListener('click', clearLog);
  els.btnSave.addEventListener('click', ()=>{ const v=els.inp.value.trim(); if(!ethers.isAddress(v)){ alert("Endereço inválido"); return;} localStorage.setItem('dinheiroCarimbadoAddress', v); els.addr.textContent=shorten(v); if(isConnected) connect(); });
  els.btnClearAddr.addEventListener('click', ()=>{ localStorage.removeItem('dinheiroCarimbadoAddress'); els.inp.value=''; els.addr.textContent='—'; });
  ( ()=>{ const stored=localStorage.getItem('dinheiroCarimbadoAddress'); if(stored) els.inp.value=stored; })();
  if(window.ethereum){ window.ethereum.on('accountsChanged',()=>location.reload()); window.ethereum.on('chainChanged',()=>location.reload()); }
  console.log("Monitor carregado.");
})();
