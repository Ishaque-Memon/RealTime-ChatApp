const socket = io();

/* -----------------------------
   Lightweight UI components
   - Button: reusable button factory
   - Modal: reusable popup for forms
   - Toast: small alerts
   -----------------------------*/

// Toast system
const toastsContainer = document.getElementById('toasts');
function toast(message, {type = 'default', timeout = 3500} = {}){
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    toastsContainer.appendChild(t);
    setTimeout(()=>{t.style.opacity = '0';t.style.transform = 'translateX(10px)';}, timeout - 300);
    setTimeout(()=>{t.remove();}, timeout);
}

// Join handled via /join.html — JoinForm page provides name entry and persistence

/* -----------------------------
   App state and DOM refs
   -----------------------------*/

let currentUser = null;
const messageArea = document.getElementById('messageArea');
const textArea = document.getElementById('message_Area');
const sendBtn = document.getElementById('sendBtn');
const themeToggle = document.getElementById('themeToggle');
const changeNameBtn = document.getElementById('changeNameBtn');
const leaveBtn = document.getElementById('leaveBtn');

function setUser(name){
    currentUser = name;
    toast(`Hello ${name}`, {type:'success'});
    // persist locally so user can rejoin easily
    try{ localStorage.setItem('cht-name', name); }catch(e){}
    socket.emit('join', {user: name});
}

// initial name flow
// if a name is stored, use it; otherwise open modal
const saved = (function(){ try{ return localStorage.getItem('cht-name'); }catch(e){ return null; }})();
if(saved){ setUser(saved); } else {
    // no saved name — redirect to the dedicated join page
    window.location.href = '/join.html';
}

changeNameBtn.addEventListener('click', ()=>{
    // open inline change-name modal for instant rename
    const changeModal = document.getElementById('changeModal');
    const changeInput = document.getElementById('changeNameInput');
    const changeCancel = document.getElementById('changeCancel');
    const changeConfirm = document.getElementById('changeConfirm');
    if(!changeModal || !changeInput || !changeCancel || !changeConfirm){ window.location.href = '/join.html'; return; }

    changeInput.value = currentUser || '';
    changeModal.classList.remove('hidden');
    changeInput.focus();

    function cleanup(){ changeModal.classList.add('hidden'); changeCancel.removeEventListener('click', onCancel); changeConfirm.removeEventListener('click', onConfirm); }
    function onCancel(){ cleanup(); }
    async function onConfirm(){
        const val = changeInput.value.trim();
        if(!val || val.length < 2) { changeInput.focus(); return; }
        // show loader
        changeConfirm.classList.add('loading');
        changeConfirm.querySelector('.spinner')?.setAttribute('aria-hidden','false');
        // emit change and update
        const prev = currentUser;
        socket.emit('changeName', {from: prev, to: val});
        currentUser = val;
        try{ localStorage.setItem('cht-name', val); }catch(e){}
        toast(`Name updated to ${val}`, {type:'success'});
        // small delay to show loader
        setTimeout(()=>{ changeConfirm.classList.remove('loading'); cleanup(); }, 500);
    }

    changeCancel.addEventListener('click', onCancel);
    changeConfirm.addEventListener('click', onConfirm);
});

leaveBtn.addEventListener('click', ()=>{
    if(!currentUser) return;
    socket.emit('leave', {user: currentUser});
    toast(`${currentUser} left the chat`, {type:'warn'});
    currentUser = null;
    // clear saved name and redirect to join page so user can rejoin later
    try{ localStorage.removeItem('cht-name'); }catch(e){}
    setTimeout(()=>{ window.location.href = '/join.html'; }, 400);
});

// Theme
function applyTheme(dark){
    if(!dark) document.body.classList.add('light'); else document.body.classList.remove('light');
}

// read persisted theme preference if available
let dark = true;
try{
    const v = localStorage.getItem('cht-dark');
    if(v === '0') dark = false;
}catch(e){}

themeToggle.addEventListener('click', ()=>{
    dark = !dark;
    try{ localStorage.setItem('cht-dark', dark ? '1' : '0'); }catch(e){}
    applyTheme(dark);
    const icon = themeToggle.querySelector('i'); if(icon) icon.className = dark ? 'bi bi-moon-stars' : 'bi bi-sun';
    themeToggle.setAttribute('aria-pressed', String(!dark));
});

/* -----------------------------
   Messaging
   -----------------------------*/

function renderMessage({user, message, time, system=false}){
    // normalize time
    const ts = time ? Number(time) : Date.now();
    const isMe = !system && user === currentUser;

    const wrap = document.createElement('div');
    wrap.className = 'message ' + (system ? 'other' : (isMe ? 'me' : 'other'));
    wrap.dataset.time = ts;

    const meta = document.createElement('div'); meta.className = 'meta';
    const nameSpan = document.createElement('strong'); nameSpan.textContent = system ? 'System' : (user || 'Unknown');
    const timeSpan = document.createElement('span'); timeSpan.textContent = new Date(ts).toLocaleTimeString();
    meta.appendChild(nameSpan); meta.appendChild(timeSpan);

    // create bubble
    const bubble = document.createElement('div'); bubble.className = 'bubble';
    const p = document.createElement('p'); p.textContent = message;
    bubble.appendChild(p);

    // measurement and sizing (reuse existing measurer if present)
    const measurer = document.getElementById('_msg_measurer') || (function(){
        const m = document.createElement('div'); m.id = '_msg_measurer';
        m.style.position = 'absolute'; m.style.left = '-9999px'; m.style.top = '0';
        m.style.visibility = 'hidden'; m.style.pointerEvents = 'none';
        m.style.width = 'auto'; m.style.maxWidth = 'none'; m.style.whiteSpace = 'pre-wrap';
        m.style.font = window.getComputedStyle(document.body).font;
        document.body.appendChild(m);
        return m;
    })();

    measurer.textContent = message;
    const containerWidth = messageArea.clientWidth || messageArea.getBoundingClientRect().width || window.innerWidth;
    const maxPx = Math.max(160, Math.floor(containerWidth * 0.78));
    const minPx = 90;
    measurer.style.width = 'auto';
    const natural = Math.min(measurer.scrollWidth + 24, maxPx);
    const approxCharPx = 7; const charsToFill = Math.max(40, Math.floor(containerWidth / approxCharPx));
    const ratio = Math.min(1, (message || '').length / charsToFill);
    const proportional = Math.floor(minPx + ratio * (maxPx - minPx));
    const finalW = Math.max(minPx, Math.min(maxPx, Math.max(natural, proportional)));
    bubble.style.width = finalW + 'px';

    wrap.appendChild(meta);
    wrap.appendChild(bubble);

    // ensure there's a .messages container inside messageArea
    let msgs = messageArea.querySelector('.messages');
    if(!msgs){ msgs = document.createElement('div'); msgs.className = 'messages'; messageArea.appendChild(msgs); }

    // insert in chronological order by data-time
    const children = Array.from(msgs.children);
    let inserted = false;
    for(const child of children){
        const ct = Number(child.dataset.time || 0);
        if(ct > ts){ msgs.insertBefore(wrap, child); inserted = true; break; }
    }
    if(!inserted) msgs.appendChild(wrap);

    // scroll to bottom if inserted at end
    if(!inserted) messageArea.scrollTop = messageArea.scrollHeight;
    else {
        // keep a small scroll to reveal new message in place
        // if user was near bottom, snap to bottom
        const nearBottom = messageArea.scrollHeight - messageArea.scrollTop - messageArea.clientHeight < 160;
        if(nearBottom) messageArea.scrollTop = messageArea.scrollHeight;
    }
}

function sendMessage(){
    const txt = textArea.value.trim();
    if(!txt || !currentUser) return;
    const msg = {user: currentUser, message: txt, time: Date.now()};
    renderMessage(msg);
    socket.emit('message', msg);
    textArea.value = '';
}

sendBtn.addEventListener('click', sendMessage);
textArea.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } });

// socket handlers
socket.on('connect', ()=>{ console.log('connected'); });

socket.on('message', (msg)=>{ renderMessage(msg); });

socket.on('user-joined', (data)=>{ toast(`${data.user} joined`, {type:'success'}); renderMessage({user:'System', message:`${data.user} joined the chat`, time: data.time, system:true}); });

socket.on('user-left', (data)=>{ toast(`${data.user} left`, {type:'warn'}); renderMessage({user:'System', message:`${data.user} left the chat`, time: data.time, system:true}); });

// attempt to restore theme preference
applyTheme(dark);

