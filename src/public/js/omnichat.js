let socket = io();

let current_channel_id = null;
let online_users = {};
const form = document.getElementById("message-form");
const input = document.getElementById("message-input");
const send_button = document.getElementById("send-button");
const messages = document.getElementById("messages");
const user_list = document.getElementById("user-list");
const channel_list = document.getElementById("channel-list");

let user_cache = {};
let message_cache = {};

function add_to_message_cache(message) {
	const channel_id = message.relationships.channel.data.id;

	if (!message_cache[channel_id]) {
		message_cache[channel_id] = [];
	}

	message_cache[channel_id].push(message);
}

function does_message_cache_contain(message) {
	const channel_id = message.relationships.channel.data.id;

	if (!message_cache[channel_id]) {
		return false;
	}

	for (let cached_message of message_cache[channel_id]) {
		if (cached_message.id === message.id) {
			return true;
		}
	}

	return false;
}

function get_cookie(name) {
	let value = "; " + document.cookie;
	let parts = value.split("; " + name + "=");
	if (parts.length == 2) return parts.pop().split(";").shift();
}

function login() {
	let user_id = get_cookie("user_id");

	if (user_id) {
		console.log(`Logging in as user ${user_id}`);
		socket.emit("login", user_id)
	}
	else {
		console.log("Did not find user_id cookie.");
	}
}

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

socket.once("login_poke", () => {
	login();
});

socket.on("disconnect", (reason) => {
	console.log(`Disconnected from server. Reason: ${reason}`);
	display_error(`Lost connection to server. Reason: ${reason}`);
});

socket.on("connect_error", (err) => {
	console.log(`Connection error: ${err}`);
	display_error(`Connection error: ${err}`);
});

socket.on("user_online", (user) => {
	if (online_users[user.id]) {
		return;
	}

	online_users[user.id] = true;
	user_cache[user.id] = user;
	let user_element = document.createElement("div");
	user_element.classList.add("user");
	user_element.setAttribute("user-id", user.id);
	user_element.innerText = user.attributes.username;
	user_list.appendChild(user_element);
});

socket.on("user_offline", (user) => {
	if (!online_users[user.id]) {
		return;
	}

	delete online_users[user.id];
	let user_element = document.querySelector(`.user[user-id="${user.id}"]`);
	user_list.removeChild(user_element);
});

socket.on("user_info", (user) => {
	user_cache[user.id] = user;
});

function get_username_for_id(user_id) {
	return new Promise((resolve, reject) => {
		if (user_cache[user_id]) {
			resolve(user_cache[user_id].attributes.username);
		}
		else {
			socket.emit("get_user", user_id);
			const listener = (user) => {
				if (user.id !== user_id) {
					return;
				}
	
				socket.off("user_info", listener);
				resolve(user.attributes.username);
			}
	
			socket.on("user_info", listener);
		}
	});
}

function display_message(user_id, content, timestamp) {
	let message = document.createElement("div");
	message.classList.add("message");

	let username = document.createElement("span");
	username.classList.add("username");
	username.innerText = user_id;
	message.appendChild(username);

	get_username_for_id(user_id).then((un) => {
		username.innerText = un;
	});

	let message_content = document.createElement("span");
	message_content.classList.add("message-content");
	message_content.innerText = content;
	message.appendChild(message_content);

	let message_timestamp = document.createElement("span");
	message_timestamp.classList.add("timestamp");
	message_timestamp.innerText = new Date(timestamp).toLocaleString();
	message.appendChild(message_timestamp);
	
	messages.appendChild(message);
	// FIXME: Scroll not working
	messages.scrollTo(0, messages.scrollHeight);
}

socket.on("msg_rcv", (data) => {
	console.log("Received message:", data);

	if (does_message_cache_contain(data)) {
		return;
	}

	add_to_message_cache(data);

	if (data.relationships.channel.data.id != current_channel_id) {
		return;
	}

	const user_id = data.relationships.user.data.id;
	const content = data.attributes.content;
	const timestamp = data.attributes.timestamp;
	display_message(user_id, content, timestamp);
});

socket.on("channel_create", (data) => {
	console.log("Channel added: " + data.attributes.name + " (" + data.id + ")");

	let channel = document.createElement("div");
	channel.classList.add("channel");
	channel.setAttribute("channel-id", data.id);
	channel.innerText = data.attributes.name;
	channel_list.appendChild(channel);

	channel.addEventListener("click", () => {
		input.disabled = false;
		send_button.disabled = false;

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

		// Display messages
		if (message_cache[current_channel_id]) {
			for (let message of message_cache[current_channel_id]) {
				const user_id = message.relationships.user.data.id;
				const content = message.attributes.content;
				const timestamp = message.attributes.timestamp;
				display_message(user_id, content, timestamp);
			}
		}
		else {
			// Ask server for missed messages
			socket.emit("channel_join", {
				channel_id: data.id
			});
		}
	});
});