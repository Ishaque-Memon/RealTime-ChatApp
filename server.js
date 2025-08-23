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

    socket.on('message', (message) => {
        console.log('Received message:', message);
        socket.broadcast.emit('message', message);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
