let socket = io();

const form = document.getElementById("message-form");
const input = document.getElementById("message-input");
	const messages = document.getElementById("messages");

form.addEventListener("submit", (e) => {
	e.preventDefault();
	if (input.value) {
		socket.emit("msg_send", {
			message: input.value
		});
		
		input.value = "";
	}
});

// TODO: User feedback on connect/disconnect/error
socket.on("connect", () => {
	console.log("Connected to server.");
});

socket.on("disconnect", (reason) => {
	console.log(`Disconnected from server. Reason: ${reason}`);
});

socket.on("connect_error", (err) => {
	console.log("Connection error: " + err);
});

socket.on("msg_rcv", (data) => {
	let message = document.createElement("li");
	message.textContent = data.message;
	messages.appendChild(message);
	window.scrollTo(0, document.body.scrollHeight);
});