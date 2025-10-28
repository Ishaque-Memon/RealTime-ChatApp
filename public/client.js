const socket = io();

/* -----------------------------
   Lightweight UI components
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

/* -----------------------------
   App state and DOM refs
   -----------------------------*/

let currentUser = null;
let isOnline = false;
const messageQueue = [];
const MAX_MESSAGES = 150; // Limit DOM messages for performance
const messageCache = []; // Store all messages for search/history

const messageArea = document.getElementById('messageArea');
const textArea = document.getElementById('message_Area');
const sendBtn = document.getElementById('sendBtn');
const themeToggle = document.getElementById('themeToggle');
const changeNameBtn = document.getElementById('changeNameBtn');
const leaveBtn = document.getElementById('leaveBtn');
const connectionStatus = document.getElementById('connectionStatus');

// Cache messages container
let messagesContainer = null;

function setUser(name){
    currentUser = name;
    toast(`Hello ${name}`, {type:'success'});
    try{ localStorage.setItem('cht-name', name); }catch(e){}
    socket.emit('join', {user: name});
}

// Initial name flow
const saved = (function(){ try{ return localStorage.getItem('cht-name'); }catch(e){ return null; }})();
if(saved){ setUser(saved); } else {
    window.location.href = '/join.html';
}

/* -----------------------------
   Connection Management
   -----------------------------*/

function updateConnectionStatus(online){
    isOnline = online;
    if(connectionStatus){
        connectionStatus.className = `connection-status ${online ? 'online' : 'offline'}`;
        connectionStatus.innerHTML = online 
            ? '<i class="bi bi-circle-fill"></i> Connected' 
            : '<i class="bi bi-circle-fill"></i> Offline';
    }
    
    // Update send button state
    sendBtn.disabled = !online;
    
    if(online && messageQueue.length > 0){
        toast(`Sending ${messageQueue.length} queued message(s)...`, {type:'success'});
        flushMessageQueue();
    }
}

function flushMessageQueue(){
    while(messageQueue.length > 0){
        const msg = messageQueue.shift();
        socket.emit('message', msg);
    }
}

socket.on('connect', ()=>{ 
    console.log('Connected');
    updateConnectionStatus(true);
    toast('Connected to chat', {type:'success', timeout: 2000});
});

socket.on('disconnect', ()=>{ 
    console.log('Disconnected');
    updateConnectionStatus(false);
    toast('Connection lost. Messages will be queued.', {type:'warn'});
});

socket.on('reconnect', ()=>{
    toast('Reconnected!', {type:'success'});
    if(currentUser){
        socket.emit('join', {user: currentUser});
    }
});

/* -----------------------------
   Name Management
   -----------------------------*/

changeNameBtn.addEventListener('click', ()=>{
    const changeModal = document.getElementById('changeModal');
    const changeInput = document.getElementById('changeNameInput');
    const changeCancel = document.getElementById('changeCancel');
    const changeConfirm = document.getElementById('changeConfirm');
    if(!changeModal || !changeInput || !changeCancel || !changeConfirm){ 
        window.location.href = '/join.html'; 
        return; 
    }

    changeInput.value = currentUser || '';
    changeModal.classList.remove('hidden');
    changeInput.focus();

    function cleanup(){ 
        changeModal.classList.add('hidden'); 
        changeCancel.removeEventListener('click', onCancel); 
        changeConfirm.removeEventListener('click', onConfirm); 
    }
    
    function onCancel(){ cleanup(); }
    
    async function onConfirm(){
        const val = changeInput.value.trim();
        if(!val || val.length < 2) { changeInput.focus(); return; }
        
        changeConfirm.classList.add('loading');
        changeConfirm.querySelector('.spinner')?.setAttribute('aria-hidden','false');
        
        const prev = currentUser;
        socket.emit('changeName', {from: prev, to: val});
        currentUser = val;
        try{ localStorage.setItem('cht-name', val); }catch(e){}
        toast(`Name updated to ${val}`, {type:'success'});
        
        setTimeout(()=>{ 
            changeConfirm.classList.remove('loading'); 
            cleanup(); 
        }, 500);
    }

    changeCancel.addEventListener('click', onCancel);
    changeConfirm.addEventListener('click', onConfirm);
});

leaveBtn.addEventListener('click', ()=>{
    if(!currentUser) return;
    socket.emit('leave', {user: currentUser});
    toast(`${currentUser} left the chat`, {type:'warn'});
    currentUser = null;
    try{ localStorage.removeItem('cht-name'); }catch(e){}
    setTimeout(()=>{ window.location.href = '/join.html'; }, 400);
});

/* -----------------------------
   Theme Management
   -----------------------------*/

function applyTheme(dark){
    if(!dark) document.body.classList.add('light'); 
    else document.body.classList.remove('light');
}

let dark = true;
try{
    const v = localStorage.getItem('cht-dark');
    if(v === '0') dark = false;
}catch(e){}

themeToggle.addEventListener('click', ()=>{
    dark = !dark;
    try{ localStorage.setItem('cht-dark', dark ? '1' : '0'); }catch(e){}
    applyTheme(dark);
    const icon = themeToggle.querySelector('i'); 
    if(icon) icon.className = dark ? 'bi bi-moon-stars' : 'bi bi-sun';
    themeToggle.setAttribute('aria-pressed', String(!dark));
});

applyTheme(dark);

/* -----------------------------
   Optimized Message Rendering
   -----------------------------*/

function initMessagesContainer(){
    if(!messagesContainer){
        messagesContainer = messageArea.querySelector('.messages');
        if(!messagesContainer){
            messagesContainer = document.createElement('div');
            messagesContainer.className = 'messages';
            messageArea.appendChild(messagesContainer);
        }
    }
    return messagesContainer;
}

function pruneOldMessages(){
    const container = initMessagesContainer();
    const messageGroups = container.querySelectorAll('.message-group');
    
    if(messageGroups.length > MAX_MESSAGES){
        const toRemove = messageGroups.length - MAX_MESSAGES;
        for(let i = 0; i < toRemove; i++){
            messageGroups[i].remove();
        }
    }
}

function renderMessage({user, message, time, system=false, replyTo=null, status='sent'}){

    const ts = time ? Number(time) : Date.now();
    const isMe = !system && user === currentUser;
    const messageClass = system ? 'other' : (isMe ? 'me' : 'other');
    const container = initMessagesContainer();

    // Use clientId for status tracking if present
    const clientId = arguments[0].clientId;

    // Store in cache for history/search
    messageCache.push({user, message, time: ts, system, replyTo, status, clientId});
    if(messageCache.length > 500) messageCache.shift(); // Keep last 500 in memory

    // Check if we can group with the last message
    const lastMessageGroup = container.lastElementChild;
    let currentMessageGroup;

    if (lastMessageGroup && 
        lastMessageGroup.dataset.user === user && 
        !system && 
        (ts - Number(lastMessageGroup.dataset.time) < 60000) && 
        !replyTo) {
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
        timeSpan.title = new Date(ts).toLocaleString(); // Full timestamp on hover
        meta.appendChild(nameSpan);
        meta.appendChild(timeSpan);
        currentMessageGroup.appendChild(meta);
        container.appendChild(currentMessageGroup);
    }

    const messageElement = document.createElement('div');
    messageElement.className = `message ${messageClass}`;
    messageElement.dataset.messageId = clientId || ts;
    messageElement.dataset.status = status;

    if (replyTo) {
        const replyToElement = document.createElement('div');
        replyToElement.className = 'reply-to';
        replyToElement.textContent = `Replying to ${replyTo.user}: "${replyTo.message.substring(0, 30)}..."`;
        messageElement.appendChild(replyToElement);
    }

    const p = document.createElement('p');
    p.textContent = message;
    messageElement.appendChild(p);

    // Add status indicator for own messages
    if (isMe && !system) {
        const statusIcon = document.createElement('span');
        statusIcon.className = 'message-status';
        statusIcon.innerHTML = status === 'sending'
            ? '<i class="bi bi-clock"></i>'
            : status === 'failed'
            ? '<i class="bi bi-exclamation-circle"></i>'
            : status === 'delivered'
            ? '<i class="bi bi-check-all"></i>'
            : '<i class="bi bi-check"></i>';
        statusIcon.title = status === 'sending' ? 'Sending...' : status === 'failed' ? 'Failed to send' : status === 'delivered' ? 'Delivered' : 'Sent';
        messageElement.appendChild(statusIcon);
    }

    // Add reply button
    if (!system) {
        const replyBtn = document.createElement('button');
        replyBtn.className = 'btn btn-ghost btn-reply';
        replyBtn.innerHTML = '<i class="bi bi-reply"></i>';
        replyBtn.title = 'Reply to this message';
        replyBtn.setAttribute('aria-label', `Reply to ${user}'s message`);
        replyBtn.addEventListener('click', () => {
            textArea.value = `@${user} `;
            textArea.focus();
            textArea.dataset.replyToUser = user;
            textArea.dataset.replyToMessage = message;
            textArea.dataset.replyToTime = ts;
        });
        messageElement.appendChild(replyBtn);
    }

    currentMessageGroup.appendChild(messageElement);

    // Prune old messages for performance
    pruneOldMessages();

    // Smooth scroll using requestAnimationFrame
    requestAnimationFrame(() => {
        messageArea.scrollTo({
            top: messageArea.scrollHeight,
            behavior: 'smooth'
        });
    });
}

/* -----------------------------
   Message Sending with Queue
   -----------------------------*/

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
        delete textArea.dataset.replyToUser;
        delete textArea.dataset.replyToMessage;
        delete textArea.dataset.replyToTime;
    }

        const clientId = Date.now().toString() + Math.random().toString(36).slice(2, 8);
        const msg = {user: currentUser, message: txt, time: Date.now(), replyTo: replyTo, clientId};
    
    if(isOnline){
        renderMessage({...msg, status: 'sending'});
        socket.emit('message', msg);
        // Status will be updated to 'delivered' only when server confirms via 'message-delivered' event
    } else {
        messageQueue.push(msg);
        renderMessage({...msg, status: 'failed'});
        toast('Message queued (offline)', {type:'warn'});
    }
    
    textArea.value = '';
    autoResizeTextarea();
}

sendBtn.addEventListener('click', sendMessage);
textArea.addEventListener('keydown', (e)=>{ 
    if(e.key === 'Enter' && !e.shiftKey){ 
        e.preventDefault(); 
        sendMessage(); 
    }
});

/* -----------------------------
   Auto-resize Textarea
   -----------------------------*/

function autoResizeTextarea(){
    textArea.style.height = 'auto';
    textArea.style.height = Math.min(textArea.scrollHeight, 120) + 'px';
}

textArea.addEventListener('input', autoResizeTextarea);

/* -----------------------------
   Typing Indicators (Debounced)
   -----------------------------*/

let typingTimeout = null;
let isTyping = false;

function debounce(func, delay){
    let timeout;
    return function(...args){
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

const emitTyping = debounce(() => {
    if (!currentUser || !isOnline) return;
    if(!isTyping){
        socket.emit('typing', { user: currentUser });
        isTyping = true;
    }
}, 300);

textArea.addEventListener('input', () => {
    emitTyping();
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        if(isTyping && currentUser){
            socket.emit('stop-typing', { user: currentUser });
            isTyping = false;
        }
    }, 1500);
});

/* -----------------------------
        if (clientId) {
            messageElement.dataset.messageId = clientId;
        } else {
            messageElement.dataset.messageId = ts;
        }
   -----------------------------*/

socket.on('message', (msg)=>{
    // Only render messages from other users as 'sent' initially.
    // For the current user, status is handled optimistically and then confirmed by 'message-delivered'.
    if (msg.user !== currentUser) {
        renderMessage({...msg, status: 'sent'});
        // Acknowledge receipt to server for delivery tracking
        if (msg.clientId) {
            socket.emit('message-received', { clientId: msg.clientId });
        }
    }
});

// Status update queue for messages not yet rendered
const pendingStatusUpdates = {};

function updateMessageStatusIcon(msgEl, status) {
    msgEl.dataset.status = status;
    const iconSpan = msgEl.querySelector('.message-status');
    if (iconSpan) {
        if (status === 'sending') {
            iconSpan.innerHTML = '<i class="bi bi-clock"></i>';
            iconSpan.title = 'Sending...';
        } else if (status === 'failed') {
            iconSpan.innerHTML = '<i class="bi bi-exclamation-circle"></i>';
            iconSpan.title = 'Failed to send';
        } else if (status === 'delivered') {
            iconSpan.innerHTML = '<i class="bi bi-check-all"></i>';
            iconSpan.title = 'Delivered';
        } else {
            iconSpan.innerHTML = '<i class="bi bi-check"></i>';
            iconSpan.title = 'Sent';
        }
    }
}

// Patch status update handlers to update icon
socket.on('message-sent', (data) => {
    const sentMsg = document.querySelector(`[data-message-id="${data.clientId}"]`);
    if (sentMsg) {
        updateMessageStatusIcon(sentMsg, 'sent');
    } else {
        pendingStatusUpdates[data.clientId] = 'sent';
    }
});

socket.on('message-delivered', (data) => {
    const deliveredMsg = document.querySelector(`[data-message-id="${data.clientId}"]`);
    if (deliveredMsg) {
        updateMessageStatusIcon(deliveredMsg, 'delivered');
    } else {
        pendingStatusUpdates[data.clientId] = 'delivered';
    }
});

// Also update pending status logic to update icon after render
function applyPendingStatusUpdate(clientId) {
    if (pendingStatusUpdates[clientId]) {
        const msgEl = document.querySelector(`[data-message-id="${clientId}"]`);
        if (msgEl) {
            updateMessageStatusIcon(msgEl, pendingStatusUpdates[clientId]);
            delete pendingStatusUpdates[clientId];
        }
    }
}

// Patch renderMessage to apply pending status updates after rendering
const originalRenderMessage = renderMessage;
renderMessage = function(msg) {
    originalRenderMessage.apply(this, arguments);
    const clientId = msg.clientId;
    if (clientId) applyPendingStatusUpdate(clientId);
};

// Update status to 'sent' (single tick) when server receives the message
socket.on('message-sent', (data) => {
    const sentMsg = document.querySelector(`[data-message-id="${data.clientId}"]`);
    if (sentMsg) {
        sentMsg.dataset.status = 'sent';
    } else {
        pendingStatusUpdates[data.clientId] = 'sent';
    }
});

// Update status to 'delivered' (double tick) when at least one other user receives
socket.on('message-delivered', (data) => {
    const deliveredMsg = document.querySelector(`[data-message-id="${data.clientId}"]`);
    if (deliveredMsg) {
        deliveredMsg.dataset.status = 'delivered';
    } else {
        pendingStatusUpdates[data.clientId] = 'delivered';
    }
});

socket.on('user-joined', (data)=>{ 
    toast(`${data.user} joined`, {type:'success', timeout: 2500}); 
    renderMessage({
        user:'System', 
        message:`${data.user} joined the chat`, 
        time: data.time, 
        system:true
    }); 
});

socket.on('user-left', (data)=>{ 
    toast(`${data.user} left`, {type:'warn', timeout: 2500}); 
    renderMessage({
        user:'System', 
        message:`${data.user} left the chat`, 
        time: data.time, 
        system:true
    }); 
});

/* -----------------------------
   Typing Indicator Display
   -----------------------------*/

const typingUsers = new Set();
const typingIndicatorContainer = document.createElement('div');
typingIndicatorContainer.className = 'typing-indicator-container hidden';
messageArea.parentNode.insertBefore(typingIndicatorContainer, messageArea.nextSibling);

function updateTypingIndicator() {
    const users = Array.from(typingUsers).filter(u => u !== currentUser);
    
    if (users.length === 0) {
        typingIndicatorContainer.textContent = '';
        typingIndicatorContainer.classList.add('hidden');
    } else if (users.length === 1) {
        typingIndicatorContainer.innerHTML = `<span class="typing-dots">${users[0]} is typing</span><span class="dots">...</span>`;
        typingIndicatorContainer.classList.remove('hidden');
    } else if (users.length === 2) {
        typingIndicatorContainer.innerHTML = `<span class="typing-dots">${users[0]} and ${users[1]} are typing</span><span class="dots">...</span>`;
        typingIndicatorContainer.classList.remove('hidden');
    } else {
        typingIndicatorContainer.innerHTML = `<span class="typing-dots">Several people are typing</span><span class="dots">...</span>`;
        typingIndicatorContainer.classList.remove('hidden');
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

/* -----------------------------
   Keyboard Shortcuts
   -----------------------------*/

document.addEventListener('keydown', (e) => {
    // Escape to cancel reply
    if(e.key === 'Escape'){
        if(textArea.dataset.replyToUser){
            delete textArea.dataset.replyToUser;
            delete textArea.dataset.replyToMessage;
            delete textArea.dataset.replyToTime;
            textArea.value = '';
            toast('Reply cancelled', {type:'default', timeout: 2000});
        }
    }
});

/* -----------------------------
   Unread Message Indicator
   -----------------------------*/

let unreadCount = 0;
let isTabVisible = true;

document.addEventListener('visibilitychange', () => {
    isTabVisible = !document.hidden;
    if(isTabVisible){
        unreadCount = 0;
        document.title = 'ChitChat';
    }
});

// Intercept new messages to update unread count
const originalSocketOn = socket.on.bind(socket);
socket.on = function(event, handler){
    if(event === 'message'){
        return originalSocketOn(event, (data) => {
            handler(data);
            if(!isTabVisible && data.user !== currentUser){
                unreadCount++;
                document.title = `(${unreadCount}) ChitChat`;
            }
        });
    }
    return originalSocketOn(event, handler);
};