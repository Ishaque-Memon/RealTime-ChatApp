const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Serve static files from 'public' directory
app.use(express.static(__dirname + '/public'));

// Route to serve main HTML file
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Socket.io setup with CORS configuration
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // Performance optimization: increase ping timeout
    pingTimeout: 60000,
    pingInterval: 25000
});

// Rate limiting map
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_MESSAGES_PER_WINDOW = 30;
const MAX_TYPING_EVENTS_PER_WINDOW = 20;

// Message batching (optional - uncomment to enable)
// const messageBuffer = [];
// const BATCH_INTERVAL = 50; // ms

function checkRateLimit(socketId, type = 'message') {
    const now = Date.now();
    const key = `${socketId}-${type}`;
    
    if (!rateLimits.has(key)) {
        rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
        return true;
    }
    
    const limit = rateLimits.get(key);
    
    if (now > limit.resetAt) {
        // Reset window
        limit.count = 1;
        limit.resetAt = now + RATE_LIMIT_WINDOW;
        return true;
    }
    
    const maxAllowed = type === 'typing' ? MAX_TYPING_EVENTS_PER_WINDOW : MAX_MESSAGES_PER_WINDOW;
    
    if (limit.count >= maxAllowed) {
        return false;
    }
    
    limit.count++;
    return true;
}

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, limit] of rateLimits.entries()) {
        if (now > limit.resetAt + RATE_LIMIT_WINDOW) {
            rateLimits.delete(key);
        }
    }
}, 300000);

// Store active users for presence tracking
const activeUsers = new Map();

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);
    
    // Send current user count
    socket.emit('user-count', { count: io.engine.clientsCount });

    // User joins with a name
    socket.on('join', (data) => {
        if (!data.user || typeof data.user !== 'string') return;
        
        const username = data.user.trim().substring(0, 32); // Sanitize
        activeUsers.set(socket.id, username);
        
        console.log('Join:', username);
        socket.broadcast.emit('user-joined', { user: username, time: Date.now() });
        
        // Send updated user count
        io.emit('user-count', { count: io.engine.clientsCount });
    });

    // Receive regular chat messages
    socket.on('message', (message) => {
        // Rate limiting
        if (!checkRateLimit(socket.id, 'message')) {
            socket.emit('rate-limited', { 
                message: 'You are sending messages too quickly. Please slow down.' 
            });
            return;
        }
        
        // Validate message
        if (!message.user || !message.message || typeof message.message !== 'string') {
            return;
        }
        
        // Sanitize message
        const sanitizedMessage = {
            user: String(message.user).trim().substring(0, 32),
            message: String(message.message).trim().substring(0, 2000),
            time: Date.now(),
            replyTo: message.replyTo || null,
            clientId: message.clientId || null
        };
        
        // Broadcast to all other clients
        socket.broadcast.emit('message', sanitizedMessage);
        // Emit a 'message-sent' event back to the sender (single tick)
        socket.emit('message-sent', { clientId: sanitizedMessage.clientId });
        // Track delivery receipts for this message
        if (sanitizedMessage.clientId) {
            if (!socket._deliveryReceipts) socket._deliveryReceipts = {};
            socket._deliveryReceipts[sanitizedMessage.clientId] = false;
        }
    // Listen for delivery receipts from other clients
    socket.on('message-received', (data) => {
        // Find the sender socket for this clientId
        for (const [id, s] of io.of('/').sockets) {
            if (s._deliveryReceipts && data.clientId in s._deliveryReceipts && !s._deliveryReceipts[data.clientId]) {
                s._deliveryReceipts[data.clientId] = true;
                s.emit('message-delivered', { clientId: data.clientId });
            }
        }
    });
        
        // Optional: Message batching
        // messageBuffer.push(sanitizedMessage);
    });

    // User explicitly leaves
    socket.on('leave', (data) => {
        if (!data.user) return;
        
        const username = String(data.user).trim();
        console.log('Leave:', username);
        
        activeUsers.delete(socket.id);
        socket.broadcast.emit('user-left', { user: username, time: Date.now() });
        
        io.emit('user-count', { count: io.engine.clientsCount });
    });

    // Change name
    socket.on('changeName', (data) => {
        if (!data.from || !data.to) return;
        
        const newName = String(data.to).trim().substring(0, 32);
        activeUsers.set(socket.id, newName);
        
        console.log('Change name:', data.from, '->', newName);
        socket.broadcast.emit('name-changed', { from: data.from, to: newName });
    });

    // Typing indicators with rate limiting
    socket.on('typing', (data) => {
        if (!checkRateLimit(socket.id, 'typing')) return;
        if (!data.user) return;
        
        socket.broadcast.emit('typing', { user: String(data.user).trim() });
    });

    socket.on('stop-typing', (data) => {
        if (!data.user) return;
        socket.broadcast.emit('stop-typing', { user: String(data.user).trim() });
    });

    // Disconnect
    socket.on('disconnect', () => {
        const username = activeUsers.get(socket.id);
        
        if (username) {
            console.log('Disconnected:', socket.id, `(${username})`);
            socket.broadcast.emit('user-left', { user: username, time: Date.now() });
            activeUsers.delete(socket.id);
        } else {
            console.log('Disconnected:', socket.id);
        }
        
        io.emit('user-count', { count: io.engine.clientsCount });
        
        // Clean up rate limits for this socket
        rateLimits.delete(`${socket.id}-message`);
        rateLimits.delete(`${socket.id}-typing`);
    });
});

// Optional: Message batching interval
// setInterval(() => {
//     if (messageBuffer.length > 0) {
//         io.emit('message-batch', messageBuffer);
//         messageBuffer.length = 0;
//     }
// }, BATCH_INTERVAL);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        connections: io.engine.clientsCount,
        timestamp: new Date().toISOString()
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
});