let socket = io();

let online_users = {};
const form = document.getElementById("message-form");
const input = document.getElementById("message-input");
const messages = document.getElementById("messages");
const user_list = document.getElementById("user-list");

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

socket.on("user_online", (data) => {
	online_users[data.id] = data;
	let user = document.createElement("li");
	user.classList.add("user");
	user.innerText = data.username;
	user_list.appendChild(user);
	window.scrollTo(0, document.body.scrollHeight);
});

socket.on("msg_rcv", (data) => {
	let message = document.createElement("li");
	message.textContent = online_users[data.user_id].username + ": " + data.content;
	messages.appendChild(message);
	window.scrollTo(0, document.body.scrollHeight);
});