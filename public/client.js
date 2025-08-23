const socket = io();

let name;
let textArea = document.querySelector('#message_Area');
let messageArea = document.querySelector('.message_area');
let sendButton = document.querySelector('.send_btn');

do {
    name = prompt('Enter your name: ');
} while (!name);

sendButton.addEventListener('click', () => {
    sendMessage(textArea.value);
});

function sendMessage(msg) {
    if (msg.trim() === '') return;

    let message = {
        user: name,
        message: msg.trim()
    };

    // Append the message to the chat area
    appendMessage(message, 'outgoing_msg');
    textArea.value = '';

    // Send the message to the server
    socket.emit('message', message);
}

function appendMessage(msg, type) {
    let mainDiv = document.createElement('div');
    let className = type === 'outgoing_msg' ? 'msg2' : 'msg1';
    mainDiv.classList.add(className, 'message');

    let markup = `
        <h4>${msg.user}</h4>
        <p>${msg.message}</p>
    `;
    mainDiv.innerHTML = markup;

    messageArea.appendChild(mainDiv);
    messageArea.scrollTop = messageArea.scrollHeight;
}

// Receive messages from server
socket.on('message', (message) => {
    appendMessage(message, 'incoming_msg');
});
