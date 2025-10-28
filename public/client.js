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

function renderMessage({user, message, time, system=false, replyTo=null}){
    const ts = time ? Number(time) : Date.now();
    const isMe = !system && user === currentUser;
    const messageClass = system ? 'other' : (isMe ? 'me' : 'other');

    let messagesContainer = messageArea.querySelector('.messages');
    if(!messagesContainer){
        messagesContainer = document.createElement('div');
        messagesContainer.className = 'messages';
        messageArea.appendChild(messagesContainer);
    }

    // Check if the last message was from the same user and within a short time frame
    const lastMessageGroup = messagesContainer.lastElementChild;
    let currentMessageGroup;

    if (lastMessageGroup && lastMessageGroup.dataset.user === user && !system && (ts - Number(lastMessageGroup.dataset.time) < 60000) && !replyTo) { // 60 seconds
        currentMessageGroup = lastMessageGroup;
    } else {
        currentMessageGroup = document.createElement('div');
        currentMessageGroup.className = `message-group ${messageClass}`;
        currentMessageGroup.dataset.user = user;
        currentMessageGroup.dataset.time = ts;

        const meta = document.createElement('div');
        meta.className = 'meta';
        const nameSpan = document.createElement('strong');
        nameSpan.textContent = system ? 'System' : (user || 'Unknown');
        const timeSpan = document.createElement('span');
        timeSpan.textContent = new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        meta.appendChild(nameSpan);
        meta.appendChild(timeSpan);
        currentMessageGroup.appendChild(meta);
        messagesContainer.appendChild(currentMessageGroup);
    }

    const messageElement = document.createElement('div');
    messageElement.className = `message ${messageClass}`;
    messageElement.dataset.messageId = ts; // Unique ID for replies

    if (replyTo) {
        const replyToElement = document.createElement('div');
        replyToElement.className = 'reply-to';
        replyToElement.textContent = `Replying to ${replyTo.user}: "${replyTo.message.substring(0, 30)}..."`;
        messageElement.appendChild(replyToElement);
    }

    const p = document.createElement('p');
    p.textContent = message;
    messageElement.appendChild(p);

    // Add reply button
    if (!system) {
        const replyBtn = document.createElement('button');
        replyBtn.className = 'btn btn-ghost btn-reply';
        replyBtn.innerHTML = '<i class="bi bi-reply"></i>';
        replyBtn.title = 'Reply to this message';
        replyBtn.addEventListener('click', () => {
            textArea.value = `@${user} `;
            textArea.focus();
            // Store reply context for sendMessage
            textArea.dataset.replyToUser = user;
            textArea.dataset.replyToMessage = message;
            textArea.dataset.replyToTime = ts;
        });
        messageElement.appendChild(replyBtn);
    }

    currentMessageGroup.appendChild(messageElement);

    // Scroll to bottom
    messageArea.scrollTop = messageArea.scrollHeight;
}

function sendMessage(){
    const txt = textArea.value.trim();
    if(!txt || !currentUser) return;

    let replyTo = null;
    if (textArea.dataset.replyToUser && textArea.dataset.replyToMessage && textArea.dataset.replyToTime) {
        replyTo = {
            user: textArea.dataset.replyToUser,
            message: textArea.dataset.replyToMessage,
            time: textArea.dataset.replyToTime
        };
        // Clear reply context after sending
        delete textArea.dataset.replyToUser;
        delete textArea.dataset.replyToMessage;
        delete textArea.dataset.replyToTime;
    }

    const msg = {user: currentUser, message: txt, time: Date.now(), replyTo: replyTo};
    renderMessage(msg);
    socket.emit('message', msg);
    textArea.value = '';
}

sendBtn.addEventListener('click', sendMessage);
textArea.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } });

// Typing indicator logic
let typingTimeout = null;
textArea.addEventListener('input', () => {
    if (!currentUser) return;
    socket.emit('typing', { user: currentUser });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop-typing', { user: currentUser });
    }, 1500); // Emit stop-typing after 1.5 seconds of inactivity
});

// socket handlers
socket.on('connect', ()=>{ console.log('connected'); });

socket.on('message', (msg)=>{ renderMessage(msg); });

socket.on('user-joined', (data)=>{ toast(`${data.user} joined`, {type:'success'}); renderMessage({user:'System', message:`${data.user} joined the chat`, time: data.time, system:true}); });

socket.on('user-left', (data)=>{ toast(`${data.user} left`, {type:'warn'}); renderMessage({user:'System', message:`${data.user} left the chat`, time: data.time, system:true}); });

// New socket handlers for typing indicators
const typingUsers = new Set();
const typingIndicatorContainer = document.createElement('div');
typingIndicatorContainer.className = 'typing-indicator-container';
messageArea.parentNode.insertBefore(typingIndicatorContainer, messageArea.nextSibling); // Insert after messageArea

function updateTypingIndicator() {
    if (typingUsers.size === 0) {
        typingIndicatorContainer.textContent = '';
        typingIndicatorContainer.classList.add('hidden');
    } else {
        const users = Array.from(typingUsers).filter(u => u !== currentUser);
        if (users.length === 0) {
            typingIndicatorContainer.textContent = '';
            typingIndicatorContainer.classList.add('hidden');
        } else if (users.length === 1) {
            typingIndicatorContainer.textContent = `${users[0]} is typing...`;
            typingIndicatorContainer.classList.remove('hidden');
        } else {
            typingIndicatorContainer.textContent = `${users.join(', ')} are typing...`;
            typingIndicatorContainer.classList.remove('hidden');
        }
    }
}

socket.on('typing', (data) => {
    if (data.user !== currentUser) {
        typingUsers.add(data.user);
        updateTypingIndicator();
    }
});

socket.on('stop-typing', (data) => {
    if (data.user !== currentUser) {
        typingUsers.delete(data.user);
        updateTypingIndicator();
    }
});

// attempt to restore theme preference
applyTheme(dark);

