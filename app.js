// ============================================================
// CONFIG
// ============================================================
const CONFIG_KEY = 'jr_config_v2';
function getConfig() { try { return JSON.parse(localStorage.getItem(CONFIG_KEY)); } catch { return null; } }

function saveConfig() {
  const url = document.getElementById('setup-url').value.trim().replace(/\/$/, '');
  const key = document.getElementById('setup-key').value.trim();
  if (!url || !key) { alert('请填写 Supabase URL 和 Key'); return; }
  const claudeKey = document.getElementById('setup-claude-key').value.trim();
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, key, claudeKey }));
  initApp();
}

function saveSettings() {
  const cfg = getConfig() || {};
  cfg.url = document.getElementById('settings-url').value.trim().replace(/\/$/, '');
  cfg.key = document.getElementById('settings-key').value.trim();
  cfg.claudeKey = document.getElementById('settings-claude-key').value.trim();
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  SB_URL = cfg.url; SB_KEY = cfg.key;
  closeModal('settings');
  toast('设置已保存 ✓');
}

function openSettings() {
  const cfg = getConfig() || {};
  document.getElementById('settings-url').value = cfg.url || '';
  document.getElementById('settings-key').value = cfg.key || '';
  document.getElementById('settings-claude-key').value = cfg.claudeKey || '';
  openModal('settings');
}

// ============================================================
// SUPABASE
// ============================================================
let SB_URL, SB_KEY;
function sbH() { return { 'Content-Type':'application/json','apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`,'Prefer':'return=representation' }; }
async function sbSelect(t,f='') { const r=await fetch(`${SB_URL}/rest/v1/${t}?${f}&order=created_at.desc`,{headers:sbH()}); if(!r.ok) throw new Error(await r.text()); return r.json(); }
async function sbInsert(t,d) { const r=await fetch(`${SB_URL}/rest/v1/${t}`,{method:'POST',headers:sbH(),body:JSON.stringify(d)}); if(!r.ok) throw new Error(await r.text()); return r.json(); }
async function sbUpdate(t,id,d) { const r=await fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`,{method:'PATCH',headers:sbH(),body:JSON.stringify(d)}); if(!r.ok) throw new Error(await r.text()); return r.json(); }
async function sbDelete(t,id) { const r=await fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`,{method:'DELETE',headers:sbH()}); if(!r.ok) throw new Error(await r.text()); }

// ============================================================
// CACHE
// ============================================================
const cache = { wishlist:[], tracker:[], events:[], reviews:[], analyses:[] };

async function loadAll() {
  setSyncStatus('同步中…');
  try {
    const [w,t,e,r,a] = await Promise.all([
      sbSelect('wishlist'), sbSelect('tracker'), sbSelect('events'), sbSelect('reviews'),
      sbSelect('analyses').catch(()=>[])
    ]);
    cache.wishlist=w||[]; cache.tracker=t||[]; cache.events=e||[]; cache.reviews=r||[]; cache.analyses=a||[];
    setSyncStatus('☁ 已同步');
  } catch(err) { setSyncStatus('⚠ 同步失败'); toast('同步失败，请检查配置'); }
}
function setSyncStatus(m) { const el=document.getElementById('sync-status'); if(el) el.textContent=m; }

// ============================================================
// NAVIGATION
// ============================================================
function navigate(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item,.mobile-nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  const pages=['dashboard','wishlist','tracker','calendar','review','aimatch'];
  const idx=pages.indexOf(page);
  document.querySelectorAll('.nav-item')[idx]?.classList.add('active');
  document.querySelectorAll('.mobile-nav-item')[idx]?.classList.add('active');
  if(page==='dashboard') renderDashboard();
  if(page==='wishlist') renderWishlist();
  if(page==='tracker') renderTracker();
  if(page==='calendar') renderCalendar();
  if(page==='review') renderReview();
  if(page==='aimatch') { renderAnalysisHistory(); checkClaudeKey(); }
  if(page==='jddecode') checkDecodeKey();
}

// ============================================================
// MODAL & TOAST
// ============================================================
let editingId = { wishlist:null, tracker:null };
function openModal(n,id) { document.getElementById('modal-'+n).classList.add('open'); if(n==='wishlist') initWishlistForm(id); if(n==='tracker') initTrackerForm(id); if(n==='event') document.getElementById('e-date').value=todayStr(); if(n==='review') document.getElementById('r-date').value=todayStr(); }
function closeModal(n) { document.getElementById('modal-'+n).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o) o.classList.remove('open');}));
function toast(msg) { const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2400); }

// ============================================================
// HELPERS
// ============================================================
function todayStr() { return new Date().toISOString().slice(0,10); }
function formatDate(s) { if(!s) return '—'; const d=new Date(s+'T00:00:00'); return `${d.getMonth()+1}月${d.getDate()}日`; }
function daysUntil(s) { if(!s) return null; const t=new Date();t.setHours(0,0,0,0); return Math.ceil((new Date(s+'T00:00:00')-t)/86400000); }
const statusMap={pending:{label:'已投递',cls:'badge-pending'},written:{label:'笔试',cls:'badge-written'},interview1:{label:'一面',cls:'badge-interview1'},interview2:{label:'二面',cls:'badge-interview2'},offer:{label:'Offer ✓',cls:'badge-offer'},rejected:{label:'已凉',cls:'badge-rejected'}};
const priorityMap={high:{dot:'dot-high',label:'高'},mid:{dot:'dot-mid',label:'中'},low:{dot:'dot-low',label:'低'}};

// ============================================================
// WISHLIST
// ============================================================
function initWishlistForm(editId) {
  editingId.wishlist=editId||null;
  const item=editId?cache.wishlist.find(x=>x.id===editId):null;
  ['company','position','deadline','salary','link','note'].forEach(f=>document.getElementById('w-'+f).value=item?.[f]||'');
  document.getElementById('w-type').value=item?.type||'大厂';
  document.getElementById('w-priority').value=item?.priority||'mid';
}
async function saveWishlist() {
  const company=document.getElementById('w-company').value.trim();
  const position=document.getElementById('w-position').value.trim();
  if(!company||!position){toast('请填写公司和岗位名称');return;}
  const data={company,position,type:document.getElementById('w-type').value,priority:document.getElementById('w-priority').value,deadline:document.getElementById('w-deadline').value||null,salary:document.getElementById('w-salary').value.trim(),link:document.getElementById('w-link').value.trim(),note:document.getElementById('w-note').value.trim()};
  try {
    if(editingId.wishlist){await sbUpdate('wishlist',editingId.wishlist,data);const i=cache.wishlist.findIndex(x=>x.id===editingId.wishlist);if(i!==-1)cache.wishlist[i]={...cache.wishlist[i],...data};toast('已更新 ✓');}
    else{const [row]=await sbInsert('wishlist',data);cache.wishlist.unshift(row);toast('已添加目标岗位 ✓');}
    closeModal('wishlist');renderWishlist();renderDashboard();editingId.wishlist=null;
  }catch(e){toast('保存失败：'+e.message);}
}
async function deleteWishlist(id) {if(!confirm('确认删除？'))return;try{await sbDelete('wishlist',id);cache.wishlist=cache.wishlist.filter(x=>x.id!==id);renderWishlist();renderDashboard();toast('已删除');}catch(e){toast('删除失败');}}
async function moveToTracker(id) {
  const item=cache.wishlist.find(x=>x.id===id);if(!item)return;
  try{const[row]=await sbInsert('tracker',{company:item.company,position:item.position,status:'pending',date:todayStr(),salary:item.salary,note:item.note});cache.tracker.unshift(row);await sbDelete('wishlist',id);cache.wishlist=cache.wishlist.filter(x=>x.id!==id);renderWishlist();toast('已移到投递追踪 🚀');}catch(e){toast('操作失败');}
}
function renderWishlist() {
  const tbody=document.getElementById('wishlist-tbody');
  if(!cache.wishlist.length){tbody.innerHTML=`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">○</div><p>还没有目标岗位</p></div></td></tr>`;return;}
  tbody.innerHTML=cache.wishlist.map(item=>{
    const p=priorityMap[item.priority]||priorityMap.mid;
    const days=daysUntil(item.deadline);
    const ds=days===null?'—':days<0?`<span style="color:var(--danger)">已过期</span>`:days===0?`<span style="color:var(--danger)">今天！</span>`:days<=3?`<span style="color:var(--warn)">${days}天后</span>`:formatDate(item.deadline);
    return `<tr><td><div class="company-name">${item.company}</div><div class="position-name">${item.position}</div></td><td><span class="badge badge-pending">${item.type||'—'}</span></td><td><span class="dot ${p.dot}"></span> ${p.label}</td><td>${ds}</td><td>${item.salary||'—'}</td><td>${item.link?`<a href="${item.link}" target="_blank" style="color:var(--accent);font-size:12px;">查看JD</a>`:'—'}</td><td><button class="action-btn" onclick="moveToTracker('${item.id}')" title="移至投递">→投</button><button class="action-btn" onclick="openModal('wishlist','${item.id}')">✎</button><button class="action-btn" onclick="deleteWishlist('${item.id}')">✕</button></td></tr>`;
  }).join('');
}

// ============================================================
// TRACKER
// ============================================================
function initTrackerForm(editId) {
  editingId.tracker=editId||null;
  const item=editId?cache.tracker.find(x=>x.id===editId):null;
  document.getElementById('t-company').value=item?.company||'';
  document.getElementById('t-position').value=item?.position||'';
  document.getElementById('t-status').value=item?.status||'pending';
  document.getElementById('t-date').value=item?.date||todayStr();
  document.getElementById('t-next').value=item?.next_date||'';
  document.getElementById('t-salary').value=item?.salary||'';
  document.getElementById('t-note').value=item?.note||'';
}
async function saveTracker() {
  const company=document.getElementById('t-company').value.trim();
  const position=document.getElementById('t-position').value.trim();
  if(!company||!position){toast('请填写公司和岗位名称');return;}
  const data={company,position,status:document.getElementById('t-status').value,date:document.getElementById('t-date').value||null,next_date:document.getElementById('t-next').value||null,salary:document.getElementById('t-salary').value.trim(),note:document.getElementById('t-note').value.trim()};
  try{
    if(editingId.tracker){await sbUpdate('tracker',editingId.tracker,data);const i=cache.tracker.findIndex(x=>x.id===editingId.tracker);if(i!==-1)cache.tracker[i]={...cache.tracker[i],...data};toast('已更新 ✓');}
    else{const[row]=await sbInsert('tracker',data);cache.tracker.unshift(row);toast('已添加投递记录 ✓');}
    closeModal('tracker');renderTracker();renderDashboard();editingId.tracker=null;
  }catch(e){toast('保存失败：'+e.message);}
}
async function deleteTracker(id){if(!confirm('确认删除？'))return;try{await sbDelete('tracker',id);cache.tracker=cache.tracker.filter(x=>x.id!==id);renderTracker();renderDashboard();toast('已删除');}catch(e){toast('删除失败');}}
function renderTracker() {
  const fs=document.getElementById('filter-status').value;
  let data=cache.tracker;if(fs) data=data.filter(x=>x.status===fs);
  const tbody=document.getElementById('tracker-tbody');
  if(!data.length){tbody.innerHTML=`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">◎</div><p>没有投递记录</p></div></td></tr>`;return;}
  tbody.innerHTML=data.map(item=>{
    const s=statusMap[item.status]||statusMap.pending;
    const days=daysUntil(item.next_date);
    const ns=days===null?'—':days<0?`<span style="color:var(--ink-faint)">${formatDate(item.next_date)}</span>`:days===0?`<span style="color:var(--danger)">今天</span>`:days<=3?`<span style="color:var(--warn)">${formatDate(item.next_date)}</span>`:formatDate(item.next_date);
    return `<tr><td><div class="company-name">${item.company}</div><div class="position-name">${item.position}</div></td><td><span class="badge ${s.cls}">${s.label}</span></td><td>${formatDate(item.date)}</td><td>${ns}</td><td>${item.salary||'—'}</td><td style="max-width:160px;font-size:12px;color:var(--ink-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.note||'—'}</td><td><button class="action-btn" onclick="openModal('tracker','${item.id}')">✎</button><button class="action-btn" onclick="deleteTracker('${item.id}')">✕</button></td></tr>`;
  }).join('');
}

// ============================================================
// CALENDAR
// ============================================================
let calYear,calMonth;
function initCal(){const n=new Date();calYear=n.getFullYear();calMonth=n.getMonth();}
function changeMonth(d){calMonth+=d;if(calMonth>11){calMonth=0;calYear++;}if(calMonth<0){calMonth=11;calYear--;}renderCalendar();}
async function saveEvent(){
  const title=document.getElementById('e-title').value.trim();
  const date=document.getElementById('e-date').value;
  if(!title||!date){toast('请填写描述和日期');return;}
  try{const data={title,type:document.getElementById('e-type').value,date,note:document.getElementById('e-note').value.trim()};const[row]=await sbInsert('events',data);cache.events.unshift(row);closeModal('event');renderCalendar();renderDashboard();toast('事件已添加 ✓');document.getElementById('e-title').value='';document.getElementById('e-note').value='';}catch(e){toast('保存失败：'+e.message);}
}
function renderCalendar(){
  const mn=['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  document.getElementById('cal-month-title').textContent=`${calYear} · ${mn[calMonth]}`;
  const evMap={};cache.events.forEach(e=>{if(!evMap[e.date])evMap[e.date]=[];evMap[e.date].push(e);});
  let sd=new Date(calYear,calMonth,1).getDay();sd=sd===0?6:sd-1;
  const dim=new Date(calYear,calMonth+1,0).getDate();
  const dip=new Date(calYear,calMonth,0).getDate();
  const today=todayStr();
  const cells=[];
  for(let i=sd-1;i>=0;i--) cells.push({day:dip-i,m:calMonth-1,y:calYear,o:true});
  for(let d=1;d<=dim;d++) cells.push({day:d,m:calMonth,y:calYear,o:false});
  const rem=42-cells.length;for(let d=1;d<=rem;d++) cells.push({day:d,m:calMonth+1,y:calYear,o:true});
  const grid=document.getElementById('calendar-grid');
  grid.innerHTML=cells.map(c=>{
    const pad=n=>n.toString().padStart(2,'0');
    const mm=((c.m%12)+12)%12;const yy=c.m<0?c.y-1:c.m>11?c.y+1:c.y;
    const ds=`${yy}-${pad(mm+1)}-${pad(c.day)}`;
    const evs=evMap[ds]||[];
    return `<div class="cal-cell ${c.o?'other-month':''} ${ds===today?'today':''}"><div class="cal-date">${c.day}</div>${evs.slice(0,3).map(e=>`<div class="cal-event ${e.type}">${e.title}</div>`).join('')}</div>`;
  }).join('');
}

// ============================================================
// REVIEW
// ============================================================
async function saveReview(){
  const company=document.getElementById('r-company').value.trim();if(!company){toast('请填写公司名称');return;}
  const tr=document.getElementById('r-tags').value.trim();
  try{const data={company,round:document.getElementById('r-round').value,date:document.getElementById('r-date').value||null,questions:document.getElementById('r-questions').value.trim(),feeling:document.getElementById('r-feeling').value.trim(),tags:tr?tr.split(',').map(t=>t.trim()).filter(Boolean):[]};const[row]=await sbInsert('reviews',data);cache.reviews.unshift(row);closeModal('review');renderReview();toast('复盘已保存 ✓');['r-company','r-questions','r-feeling','r-tags'].forEach(id=>document.getElementById(id).value='');}catch(e){toast('保存失败：'+e.message);}
}
async function deleteReview(id){if(!confirm('确认删除？'))return;try{await sbDelete('reviews',id);cache.reviews=cache.reviews.filter(x=>x.id!==id);renderReview();toast('已删除');}catch(e){toast('删除失败');}}
function showReviewDetail(id){
  const item=cache.reviews.find(x=>x.id===id);if(!item)return;
  document.getElementById('detail-title').textContent=`${item.company} · ${item.round}`;
  const qs=(item.questions||'').split('\n').filter(Boolean);
  document.getElementById('detail-body').innerHTML=`<p style="font-size:12px;color:var(--ink-faint);margin-bottom:16px;">${formatDate(item.date)}</p>${qs.length?`<div style="margin-bottom:16px;"><div style="font-size:12px;font-weight:500;color:var(--ink-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em;">被问到的问题</div>${qs.map((q,i)=>`<div style="padding:8px 12px;margin-bottom:6px;background:var(--bg);border-radius:6px;font-size:13px;border-left:2px solid var(--border);">${i+1}. ${q}</div>`).join('')}</div>`:''} ${item.feeling?`<div style="margin-bottom:16px;"><div style="font-size:12px;font-weight:500;color:var(--ink-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em;">感受与反思</div><div style="font-size:13px;line-height:1.8;">${item.feeling}</div></div>`:''} ${(item.tags||[]).length?`<div>${item.tags.map(t=>`<span class="review-tag">${t}</span>`).join('')}</div>`:''}<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-light);"><button class="btn btn-ghost btn-sm" onclick="deleteReview('${item.id}');closeModal('review-detail')">删除此复盘</button></div>`;
  openModal('review-detail');
}
function renderReview(){
  const grid=document.getElementById('review-grid');
  if(!cache.reviews.length){grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">◇</div><p>还没有复盘记录</p></div>`;return;}
  grid.innerHTML=cache.reviews.map(r=>{const qs=(r.questions||'').split('\n').filter(Boolean);return`<div class="review-card" onclick="showReviewDetail('${r.id}')"><div class="review-card-header"><div class="review-company">${r.company}</div><div class="review-date">${formatDate(r.date)}</div></div><div class="review-round">${r.round} · ${qs.length} 道题</div><div class="review-questions">${qs.slice(0,2).map(q=>`· ${q}`).join('<br>')}</div><div>${(r.tags||[]).map(t=>`<span class="review-tag">${t}</span>`).join('')}</div></div>`;}).join('');
}

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard(){
  const tracker=cache.tracker,wishlist=cache.wishlist,events=cache.events;
  const applied=tracker.length,inInterview=tracker.filter(x=>['interview1','interview2'].includes(x.status)).length,offers=tracker.filter(x=>x.status==='offer').length;
  const rate=applied>0?Math.round(inInterview/applied*100)+'%':'—';
  const today=new Date();today.setHours(0,0,0,0);const in7=new Date(today);in7.setDate(in7.getDate()+7);
  const upcoming=events.filter(e=>{const d=new Date(e.date+'T00:00:00');return d>=today&&d<=in7;}).sort((a,b)=>a.date.localeCompare(b.date));
  document.getElementById('stat-wishlist').textContent=wishlist.length;
  document.getElementById('stat-applied').textContent=applied;
  document.getElementById('stat-interview').textContent=inInterview;
  document.getElementById('stat-rate').textContent=rate;
  document.getElementById('stat-offer').textContent=offers;
  document.getElementById('stat-deadline').textContent=upcoming.length;
  const now=new Date();
  document.getElementById('dashboard-subtitle').textContent=`${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 · 加油，一切都在可控范围内 💪`;
  const stages=[{label:'投递',count:applied,color:'#4a7c5f'},{label:'笔试',count:tracker.filter(x=>['written','interview1','interview2','offer'].includes(x.status)).length,color:'#3a5a8a'},{label:'面试',count:inInterview,color:'#c17b3a'},{label:'Offer',count:offers,color:'#2d5a3d'}];
  const maxC=Math.max(...stages.map(s=>s.count),1);
  document.getElementById('funnel-chart').innerHTML=stages.map(s=>`<div class="funnel-bar"><div class="funnel-label">${s.label}</div><div class="funnel-track"><div class="funnel-fill" style="width:${Math.max(s.count/maxC*100,s.count>0?8:0)}%;background:${s.color};">${s.count>0?s.count:''}</div></div><div class="funnel-num">${s.count}</div></div>`).join('');
  const typeCount={};[...wishlist,...tracker].forEach(x=>{const t=x.type||'未分类';typeCount[t]=(typeCount[t]||0)+1;});
  const typeColors={'大厂':'#2d5a3d','独角兽':'#3a5a8a','外企':'#8a5a3a','国企':'#5a3a8a','中小厂':'#8a8a3a','未分类':'#aaa'};
  const types=Object.entries(typeCount);
  const canvas=document.getElementById('donut-canvas'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,100,100);
  const total=types.reduce((s,[,v])=>s+v,0);
  if(total>0){let a=-Math.PI/2;types.forEach(([k,v])=>{const sl=(v/total)*Math.PI*2;ctx.beginPath();ctx.moveTo(50,50);ctx.arc(50,50,42,a,a+sl);ctx.closePath();ctx.fillStyle=typeColors[k]||'#999';ctx.fill();a+=sl;});ctx.beginPath();ctx.arc(50,50,26,0,Math.PI*2);ctx.fillStyle='#fdfcf9';ctx.fill();}
  document.getElementById('donut-legend').innerHTML=types.map(([k,v])=>`<div class="legend-item"><div class="legend-dot" style="background:${typeColors[k]||'#999'}"></div>${k} <span style="color:var(--ink);font-weight:500;margin-left:4px;">${v}</span></div>`).join('')||'<div style="color:var(--ink-faint);font-size:12px;">暂无数据</div>';
  const dl=document.getElementById('upcoming-deadlines');
  if(!upcoming.length){dl.innerHTML=`<div style="padding:20px;text-align:center;color:var(--ink-faint);font-size:13px;">7天内没有截止日期，稍微喘口气 😮‍💨</div>`;return;}
  dl.innerHTML=upcoming.map(e=>{const days=daysUntil(e.date);const cls=days===0?'urgent':days<=2?'soon':'normal';const dl2=days===0?'今天！':`${days}天后`;const d=new Date(e.date+'T00:00:00');const tl={deadline:'截止',written:'笔试',interview:'面试'};return`<div class="deadline-item ${cls}"><div class="deadline-date-box"><div class="deadline-month">${d.getMonth()+1}月</div><div class="deadline-day">${d.getDate()}</div></div><div class="deadline-info"><div class="deadline-company">${e.title}</div><div class="deadline-type">${tl[e.type]||e.type}${e.note?' · '+e.note:''}</div></div><div class="days-left ${cls}">${dl2}</div></div>`;}).join('');
}

// ============================================================
// AI MATCH
// ============================================================
let resumeBase64 = null;
let currentResult = null;

function checkClaudeKey() {
  const cfg = getConfig();
  const warning = document.getElementById('no-key-warning');
  if (!cfg?.claudeKey) { warning.style.display = 'block'; } else { warning.style.display = 'none'; }
}

function handleResumeDrop(e) {
  e.preventDefault();
  document.getElementById('resume-drop').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processResumeFile(file);
}

function handleResumeUpload(input) {
  const file = input.files[0];
  if (file) processResumeFile(file);
}

function processResumeFile(file) {
  document.getElementById('resume-filename').textContent = file.name;
  document.getElementById('resume-badge').style.display = 'flex';
  document.getElementById('resume-drop').style.display = 'none';
  const reader = new FileReader();
  reader.onload = (e) => { resumeBase64 = e.target.result.split(',')[1]; };
  reader.readAsDataURL(file);
}

function clearResume() {
  resumeBase64 = null;
  document.getElementById('resume-file').value = '';
  document.getElementById('resume-badge').style.display = 'none';
  document.getElementById('resume-drop').style.display = 'block';
}

async function runAIAnalysis() {
  const cfg = getConfig();
  if (!cfg?.claudeKey) { toast('请先在设置里填写 Claude API Key'); return; }

  const resumeText = document.getElementById('resume-text').value.trim();
  const jdText = document.getElementById('jd-text').value.trim();
  if (!resumeBase64 && !resumeText) { toast('请上传简历或粘贴简历文字'); return; }
  if (!jdText) { toast('请粘贴岗位 JD'); return; }

  const company = document.getElementById('jd-company').value.trim();
  const position = document.getElementById('jd-position').value.trim();

  // Show loading
  document.getElementById('result-empty').style.display = 'none';
  document.getElementById('result-content').style.display = 'none';
  document.getElementById('result-loading').style.display = 'flex';

  const btn = document.getElementById('analyze-btn');
  btn.disabled = true; btn.textContent = '分析中…';

  try {
    // Build messages
    const userContent = [];
    if (resumeBase64) {
      userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: resumeBase64 } });
    }
    const textPrompt = `请分析以下简历与岗位JD的匹配程度。

${resumeText ? `【简历内容】\n${resumeText}\n\n` : ''}【岗位JD】
公司：${company || '未填写'}
职位：${position || '未填写'}
${jdText}

请严格按照以下JSON格式返回，不要有任何其他文字：
{
  "score": 75,
  "verdict": "较好匹配，有一定竞争力",
  "strengths": ["优势1（具体说明）", "优势2", "优势3"],
  "gaps": ["不足1（具体说明）", "不足2", "不足3"],
  "suggestions": ["建议1（具体可操作的简历修改建议）", "建议2", "建议3"],
  "interview_topics": ["面试高频考点1", "面试高频考点2", "面试高频考点3", "面试高频考点4"],
  "summary": "两三句话的综合总结，包括整体评价和最关键的一两个行动建议"
}

评分标准：0-100分，80+非常匹配，60-79较好匹配，40-59有差距，40以下差距较大。每个数组至少3条，建议要具体可操作。`;

    userContent.push({ type: 'text', text: textPrompt });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.claudeKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || response.statusText);
    }

    const data = await response.json();
    const rawText = data.content.map(b => b.text || '').join('');
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI 返回格式异常，请重试');

    const result = JSON.parse(jsonMatch[0]);
    result.company = company; result.position = position;
    currentResult = result;
    renderResult(result);
  } catch (e) {
    document.getElementById('result-loading').style.display = 'none';
    document.getElementById('result-empty').style.display = 'flex';
    toast('分析失败：' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '✦ 开始 AI 分析';
  }
}

function renderResult(r) {
  document.getElementById('result-loading').style.display = 'none';
  document.getElementById('result-empty').style.display = 'none';
  document.getElementById('result-content').style.display = 'block';

  // Score
  const score = parseInt(r.score) || 0;
  const scoreEl = document.getElementById('score-circle');
  scoreEl.className = 'score-circle ' + (score >= 75 ? 'high' : score >= 50 ? 'mid' : 'low');
  document.getElementById('score-num').textContent = score;
  document.getElementById('score-company').textContent = [r.company, r.position].filter(Boolean).join(' · ') || '匹配分析';
  document.getElementById('score-verdict').textContent = r.verdict || '';
  document.getElementById('score-tags').innerHTML = (score >= 75 ? ['高匹配','值得投递'] : score >= 50 ? ['中等匹配','需要准备'] : ['差距较大','需要提升']).map(t => `<span class="score-tag">${t}</span>`).join('');

  // Lists
  const renderList = (id, items, cls) => {
    document.getElementById(id).innerHTML = (items||[]).map(item => `<div class="result-item ${cls}">${item}</div>`).join('') || '<div class="result-item">暂无数据</div>';
  };
  renderList('result-strengths', r.strengths, 'strength');
  renderList('result-gaps', r.gaps, 'gap');
  renderList('result-suggestions', r.suggestions, 'suggestion');
  renderList('result-interviews', r.interview_topics, 'interview');
  document.getElementById('result-summary').textContent = r.summary || '';
}

async function saveAnalysisResult() {
  if (!currentResult) return;
  const cfg = getConfig();
  if (!cfg?.claudeKey) { toast('请先配置 API Key'); return; }
  try {
    const data = {
      company: currentResult.company || '未知',
      position: currentResult.position || '未知',
      score: currentResult.score,
      verdict: currentResult.verdict,
      result_json: JSON.stringify(currentResult),
      analyzed_at: new Date().toISOString()
    };
    const [row] = await sbInsert('analyses', data);
    cache.analyses.unshift(row);
    renderAnalysisHistory();
    toast('分析结果已保存 ✓');
  } catch (e) {
    // If table doesn't exist, save to localStorage as fallback
    const local = JSON.parse(localStorage.getItem('jr_analyses') || '[]');
    local.unshift({ ...currentResult, id: Date.now().toString(), analyzed_at: new Date().toISOString() });
    localStorage.setItem('jr_analyses', JSON.stringify(local.slice(0, 20)));
    renderAnalysisHistory();
    toast('已保存到本地 ✓');
  }
}

function renderAnalysisHistory() {
  const grid = document.getElementById('analysis-history-grid');
  // Merge cloud + local
  const local = JSON.parse(localStorage.getItem('jr_analyses') || '[]');
  const all = [...cache.analyses, ...local].slice(0, 20);

  if (!all.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">✦</div><p>还没有分析记录</p></div>`;
    return;
  }

  grid.innerHTML = all.map((item, idx) => {
    const score = item.score || (item.result_json ? JSON.parse(item.result_json).score : '—');
    const scoreColor = score >= 75 ? 'var(--success)' : score >= 50 ? 'var(--warn)' : 'var(--danger)';
    const date = item.analyzed_at ? new Date(item.analyzed_at).toLocaleDateString('zh-CN') : '—';
    return `<div class="review-card" onclick="showAnalysisDetail(${idx}, ${JSON.stringify(all).indexOf(JSON.stringify(item))})">
      <div class="review-card-header">
        <div class="review-company">${item.company || '—'}</div>
        <div style="font-family:'Noto Serif SC',serif;font-size:20px;font-weight:700;color:${scoreColor};">${score}</div>
      </div>
      <div class="review-round">${item.position || '—'}</div>
      <div style="font-size:12px;color:var(--ink-muted);margin-top:6px;">${item.verdict || ''}</div>
      <div style="font-size:11px;color:var(--ink-faint);margin-top:8px;">${date}</div>
    </div>`;
  }).join('');
}

function showAnalysisDetail(displayIdx) {
  const local = JSON.parse(localStorage.getItem('jr_analyses') || '[]');
  const all = [...cache.analyses, ...local].slice(0, 20);
  const item = all[displayIdx];
  if (!item) return;
  const r = item.result_json ? JSON.parse(item.result_json) : item;
  document.getElementById('analysis-detail-title').textContent = `${item.company || ''} · ${item.position || ''} — ${item.score || r.score}分`;
  const renderItems = (items, cls) => (items||[]).map(i => `<div class="result-item ${cls}">${i}</div>`).join('');
  document.getElementById('analysis-detail-body').innerHTML = `
    <div style="margin-bottom:16px;"><div class="result-block-title">💪 优势</div>${renderItems(r.strengths,'strength')}</div>
    <div style="margin-bottom:16px;"><div class="result-block-title">⚡ 差距</div>${renderItems(r.gaps,'gap')}</div>
    <div style="margin-bottom:16px;"><div class="result-block-title">✏️ 简历建议</div>${renderItems(r.suggestions,'suggestion')}</div>
    <div style="margin-bottom:16px;"><div class="result-block-title">🎯 面试考点</div>${renderItems(r.interview_topics,'interview')}</div>
    <div class="result-block-title">💬 总结</div><div class="result-summary-box">${r.summary||''}</div>`;
  openModal('analysis-detail');
}


// ============================================================
// JD DECODE
// ============================================================
function checkDecodeKey() {
  const cfg = getConfig();
  document.getElementById('decode-no-key-warning').style.display = cfg?.claudeKey ? 'none' : 'block';
}

async function runJDDecode() {
  const cfg = getConfig();
  if (!cfg?.claudeKey) { toast('请先在设置里填写 Claude API Key'); return; }

  const jdText = document.getElementById('decode-jd').value.trim();
  if (!jdText) { toast('请先粘贴岗位 JD'); return; }

  const company  = document.getElementById('decode-company').value.trim();
  const position = document.getElementById('decode-position').value.trim();

  document.getElementById('decode-empty').style.display   = 'none';
  document.getElementById('decode-content').style.display = 'none';
  document.getElementById('decode-loading').style.display = 'flex';

  const btn = document.getElementById('decode-btn');
  btn.disabled = true; btn.textContent = '解读中…';

  const prompt = `你是一个帮大学生看懂招聘岗位的助手，语言要亲切、口语化，像在和朋友聊天一样。

请解读下面这份岗位 JD：
公司：${company || '未填写'}
职位：${position || '未填写'}
${jdText}

请严格用以下 JSON 格式返回，不要有任何其他文字：
{
  "headline": "用一句很吸引人的话概括这个岗位的核心是什么，让人一眼明白（20字以内）",
  "what": "用2-3段大白话解释这个岗位日常在做什么，避免复述JD原文，要让完全不懂的人也能听懂",
  "skills": [
    { "name": "能力名称", "desc": "为什么需要这个能力，具体体现在哪里" },
    { "name": "能力名称", "desc": "..." }
  ],
  "daylife": [
    { "time": "上午", "task": "具体在做什么，越生动越好" },
    { "time": "下午", "task": "..." },
    { "time": "晚上", "task": "..." }
  ],
  "fit": ["适合这个岗位的人的特征1", "特征2", "特征3"],
  "nofit": ["可能不适合的情况1", "情况2", "情况3"],
  "onesent": "一句话总结这个岗位的本质，要有点个性，不要太官方"
}

skills 返回3-5条，daylife 返回3条（上午/下午/晚上或早/中/晚），fit 和 nofit 各3条。`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.claudeKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || response.statusText);
    }

    const data = await response.json();
    const raw  = data.content.map(b => b.text || '').join('');
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI 返回格式异常，请重试');

    const r = JSON.parse(jsonMatch[0]);
    renderDecode(r, company, position);

  } catch(e) {
    document.getElementById('decode-loading').style.display = 'none';
    document.getElementById('decode-empty').style.display  = 'flex';
    toast('解读失败：' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '◉ 解读这个岗位';
  }
}

function renderDecode(r, company, position) {
  document.getElementById('decode-loading').style.display = 'none';
  document.getElementById('decode-empty').style.display   = 'none';
  document.getElementById('decode-content').style.display = 'block';

  // Badge + headline
  const label = [company, position].filter(Boolean).join(' · ') || '岗位解读';
  document.getElementById('decode-title-badge').textContent = label;
  document.getElementById('decode-headline').textContent    = r.headline || '';

  // 岗是干什么的
  document.getElementById('decode-what').innerHTML =
    (r.what || '').split('\n').filter(Boolean)
      .map(t => `<p style="margin-bottom:8px;">${t}</p>`).join('');

  // 能力
  document.getElementById('decode-skills').innerHTML =
    (r.skills || []).map(s => `
      <div class="decode-item">
        <div class="decode-item-dot" style="background:var(--accent);"></div>
        <div><span style="font-weight:600;color:var(--ink);">${s.name}</span>
        <span style="color:var(--ink-muted);"> — ${s.desc}</span></div>
      </div>`).join('');

  // 一天时间线
  document.getElementById('decode-daylife').innerHTML =
    `<div class="decode-timeline">` +
    (r.daylife || []).map(d => `
      <div class="decode-time-row">
        <div class="decode-time-label">${d.time}</div>
        <div class="decode-time-text">${d.task}</div>
      </div>`).join('') +
    `</div>`;

  // 适合 / 不适合
  const fitHtml   = (r.fit    || []).map(t => `<div class="decode-fit-item">${t}</div>`).join('');
  const nofitHtml = (r.nofit  || []).map(t => `<div class="decode-fit-item">${t}</div>`).join('');
  document.getElementById('decode-fit').innerHTML    = fitHtml;
  document.getElementById('decode-nofit').innerHTML  = nofitHtml;

  // 一句话总结
  document.getElementById('decode-onesent').textContent = r.onesent || '';
}

// ============================================================
// INIT
// ============================================================
async function initApp() {
  const cfg = getConfig();
  if (!cfg) {
    document.getElementById('setup-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    return;
  }
  SB_URL = cfg.url; SB_KEY = cfg.key;
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  // Mobile nav
  const mn = document.createElement('div');
  mn.className = 'mobile-nav';
  mn.innerHTML = [['dashboard','◈','概览'],['wishlist','○','目标'],['tracker','◎','追踪'],['calendar','□','日历'],['review','◇','复盘'],['aimatch','✦','AI']]
    .map(([p,i,l]) => `<div class="mobile-nav-item" onclick="navigate('${p}')"><div class="mn-icon">${i}</div>${l}</div>`).join('');
  document.body.appendChild(mn);

  initCal();
  await loadAll();
  renderDashboard();

  // Also add analyses table SQL note
  if (!localStorage.getItem('jr_analyses_note')) {
    localStorage.setItem('jr_analyses_note', '1');
  }
}

initApp();
