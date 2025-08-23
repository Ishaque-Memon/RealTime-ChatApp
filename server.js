const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Serve static files from 'public' directory
app.use(express.static(__dirname + '/public'));

// Route to serve main HTML file
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

const io = socketIo(server);

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);

    // receive regular chat messages
    socket.on('message', (message) => {
        console.log('Received message:', message);
        socket.broadcast.emit('message', message);
    });

    // user joins with a name
    socket.on('join', (data) => {
        console.log('Join:', data);
        socket.broadcast.emit('user-joined', {user: data.user, time: Date.now()});
    });

    // user explicitly leaves
    socket.on('leave', (data) => {
        console.log('Leave:', data);
        socket.broadcast.emit('user-left', {user: data.user, time: Date.now()});
    });

    socket.on('changeName', (data) => {
        console.log('Change name:', data);
        socket.broadcast.emit('name-changed', data);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
