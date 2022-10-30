let socket = io();

let current_channel_id = null;
let online_users = {};
const form = document.getElementById("message-form");
const input = document.getElementById("message-input");
const messages = document.getElementById("messages");
const user_list = document.getElementById("user-list");
const channel_list = document.getElementById("channel-list");

form.addEventListener("submit", (e) => {
	e.preventDefault();
	if (input.value && current_channel_id) {
		socket.emit("msg_send", {
			message: input.value,
			channel_id: current_channel_id
		});
		
		input.value = "";
	}
});

function display_error(message) {
	let error_div = document.createElement("div");
	error_div.classList.add("error");
	error_div.innerText = message;
	// Add close button
	let close_button = document.createElement("button");
	close_button.innerText = "X";
	close_button.style.float = "right";
	close_button.style.marginRight = "10px";
	close_button.style.backgroundColor = "transparent";
	close_button.style.border = "none";
	close_button.style.color = "white";
	close_button.addEventListener("click", () => {
		error_div.remove();
	});
	error_div.appendChild(close_button);
	document.body.appendChild(error_div);
	
	setTimeout(() => {
		if (error_div.parentElement) {
			error_div.remove();
		}
	}, 5000);
}

// TODO: User feedback on connect/disconnect/error
socket.on("connect", () => {
	console.log("Connected to server.");
});

socket.on("disconnect", (reason) => {
	console.log(`Disconnected from server. Reason: ${reason}`);
	display_error(`Lost connection to server. Reason: ${reason}`);
});

socket.on("connect_error", (err) => {
	console.log(`Connection error: ${err}`);
	display_error(`Connection error: ${err}`);
});

socket.on("user_online", (data) => {
	if (online_users[data.id]) {
		return;
	}

	online_users[data.id] = data;
	let user = document.createElement("div");
	user.classList.add("user");
	user.setAttribute("user-id", data.id);
	user.innerText = data.username;
	user_list.appendChild(user);
});

socket.on("user_offline", (data) => {
	if (!online_users[data.id]) {
		return;
	}

	delete online_users[data.id];
	let user = document.querySelector(`.user[user-id="${data.id}"]`);
	user_list.removeChild(user);
});

socket.on("msg_rcv", (data) => {
	if (data.channel_id != current_channel_id) {
		// TODO: Store messages for channels that aren't currently open
		return;
	}

	if (!online_users[data.user_id]) {
		// TODO: Resolve usernames of offline users
		return;
	}

	let message = document.createElement("div");
	message.textContent = online_users[data.user_id].username + ": " + data.content;
	messages.appendChild(message);
	// FIXME: Scroll not working
	messages.scrollTo(0, messages.scrollHeight);
});

socket.on("channel_create", (data) => {
	console.log("Channel added: " + data.name + " (" + data.id + ")");

	let channel = document.createElement("div");
	channel.classList.add("channel");
	channel.setAttribute("channel-id", data.id);
	channel.innerText = data.name;
	channel_list.appendChild(channel);

	channel.addEventListener("click", () => {
		// Mark old channel as not selected
		if (current_channel_id) {
			let current_channel = document.querySelector(`.channel[channel-id="${current_channel_id}"]`);
			console.log(current_channel, current_channel_id);
			if (current_channel) current_channel.classList.remove("selected");
		}

		// Mark this channel as selected
		channel.classList.add("selected");
		current_channel_id = data.id;
	
		// Clear message pane
		messages.innerHTML = "";

		// Ask server for messages
		socket.emit("channel_join", {
			channel_id: data.id
		});
	});
});