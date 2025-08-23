// JoinForm.js - enhanced join page script
const joinName = document.getElementById('joinName');
const joinBtn = document.getElementById('joinBtn');
const openChatBtn = document.getElementById('openChatBtn');
const themeToggle = document.getElementById('themeToggle');
const toastsContainer = document.getElementById('toasts');
const avatarPreview = document.getElementById('avatarPreview');
const joinForm = document.getElementById('joinForm');
const joinError = document.getElementById('joinError');

function toast(message, {type = 'default', timeout = 3000} = {}){
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = message; toastsContainer.appendChild(t);
  setTimeout(()=>{t.style.opacity = '0';t.style.transform='translateX(10px)';}, timeout - 250);
  setTimeout(()=>t.remove(), timeout);
}

function applyTheme(dark){ if(!dark) document.body.classList.add('light'); else document.body.classList.remove('light'); }
let dark = true;
try{ if(localStorage.getItem('cht-dark') === '0') dark = false; }catch(e){}
applyTheme(dark);

// No theme toggle on this form; theme persistence respects earlier setting

// helper: generate initials avatar
function setAvatar(name){ const n = (name||'').trim(); const initials = n.split(/\s+/).slice(0,2).map(s=>s[0]?.toUpperCase()||'').join('') || '?'; avatarPreview.textContent = initials; }

// prefill and enable
try{ const saved = localStorage.getItem('cht-name'); if(saved){ joinName.value = saved; setAvatar(saved); joinBtn.disabled = false; } }catch(e){}

joinName.addEventListener('input', (e)=>{
  const v = e.target.value || '';
  const ok = v.trim().length >= 2;
  joinBtn.disabled = !ok;
  setAvatar(v);
  joinError.textContent = '';
});

joinForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const v = (joinName.value || '').trim();
  if(!v || v.length < 2){ joinError.textContent = 'Please enter at least 2 characters'; joinName.focus(); return; }
  try{ localStorage.setItem('cht-name', v); }catch(err){}
  // show loader state
  joinBtn.classList.add('loading'); joinBtn.querySelector('.btn-label').textContent = 'Joining...';
  toast('Welcome — opening chat', {type:'success'});
  setTimeout(()=>{ window.location.href = '/'; }, 600);
});

openChatBtn.addEventListener('click', ()=>{ window.location.href = '/'; });

// keyboard UX
joinName.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') joinForm.requestSubmit(); });

// listen for theme changes in localStorage (useful if changed in chat window)
window.addEventListener('storage', (e)=>{
  if(e.key === 'cht-dark'){
    try{ dark = e.newValue !== '0'; applyTheme(dark); }catch(_){ }
  }
});
