let socket = io();

let current_channel_id = null;
let online_users = {};
const form = document.getElementById("message-form");
const message_input = document.getElementById("message-input");
const send_button = document.getElementById("send-button");
const messages = document.getElementById("messages");
const user_list = document.getElementById("user-list");
const channel_list = document.getElementById("channels");
const add_channel_button = document.getElementById("add-channel-button");
const pair_request_button = document.getElementById("pair-request-button");
const my_profile_name = document.getElementById("my-profile-name");
const my_profile_id = document.getElementById("my-profile-id");

let this_user = null;
let peer_cache = {};
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

function prompt(message, prompt_items) {
	return new Promise((resolve, reject) => {
		let prompt_div = document.createElement("div");
		prompt_div.classList.add("prompt-form");

		let prompt_header = document.createElement("h2");
		prompt_header.innerText = message;
		prompt_div.appendChild(prompt_header);

		// Add inputs
		for (let prompt_item of prompt_items) {
			let input_container = document.createElement("div");
			let input = document.createElement("input");
			let input_added = false;
			input.id = prompt_item.id;
			input.classList.add(`prompt-${prompt_item.type}-input`);
			input.type = prompt_item.type;

			if (prompt_item.label_position === "after") {
				input_container.appendChild(input);
				input_added = true;
			}

			if (prompt_item.label) {
				let label = document.createElement("label");
				label.innerText = prompt_item.label;
				label.htmlFor = prompt_item.id;
				input_container.appendChild(label);
			}

			if (prompt_item.label_position === "before" || !input_added) {
				input_container.appendChild(input);
				input_added = true;
			}

			prompt_div.appendChild(input_container);
		}
		// Add buttons
		let button_div = document.createElement("div");
		button_div.classList.add("prompt-button-container");
		let ok_button = document.createElement("button");
		ok_button.classList.add("prompt-button");
		ok_button.classList.add("yes");
		ok_button.innerText = "Done";
		ok_button.addEventListener("click", () => {
			let results = {};
			for (let prompt_item of prompt_items) {
				if (prompt_item.type === "checkbox") {
					results[prompt_item.id] = document.getElementById(prompt_item.id).checked;
					continue;
				}

				results[prompt_item.id] = document.getElementById(prompt_item.id).value;
			}
			prompt_div.remove();
			resolve(results);
		});
		let cancel_button = document.createElement("button");
		cancel_button.classList.add("prompt-button");
		cancel_button.classList.add("cancel");
		cancel_button.innerText = "Cancel";
		cancel_button.addEventListener("click", () => {
			prompt_div.remove();
			resolve(null);
		});

		button_div.appendChild(cancel_button);
		button_div.appendChild(ok_button);
		prompt_div.appendChild(button_div);
		document.body.appendChild(prompt_div);
	});
}

form.addEventListener("submit", (e) => {
	e.preventDefault();
	if (message_input.value && current_channel_id) {
		socket.emit("msg_send", {
			message: message_input.value,
			channel_id: current_channel_id
		});
		
		message_input.value = "";
	}
});

add_channel_button.addEventListener("click", async (e) => {
	e.preventDefault();
	if (this_user && this_user.attributes.admin) {
		let results = await prompt("New Channel", [
			{
				id: "channel-name",
				label: "Name",
				label_position: "before",
				type: "text"
			},
			{
				id: "channel-admin-only",
				label: "Admin only",
				label_position: "after",
				type: "checkbox"
			}
		]);

		if (results) {
			let channel_name = results["channel-name"];
			let admin_only = results["channel-admin-only"];

			socket.emit("channel_create", {
				name: channel_name,
				admin_only: admin_only
			});
		}
	}
});

pair_request_button.addEventListener("click", async (e) => {
	e.preventDefault();
	if (this_user && this_user.attributes.admin) {
		let results = await prompt("Add Peer", [
			{
				id: "peer-address",
				label: "Address",
				label_position: "before",
				type: "text"
			},
			{
				id: "peer-port",
				label: "Port",
				label_position: "before",
				type: "text"
			}
		]);

		if (results) {
			let address = results["peer-address"];
			let port = results["peer-port"];
			if (address && port) {
				socket.emit("send_pair_request", {
					address,
					port
				});
			}
		}
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

socket.on("my_user", (user) => {
	this_user = user;

	if (this_user.attributes.admin) {
		add_channel_button.style.display = "block";
		pair_request_button.style.display = "block";
	}

	my_profile_name.innerText = this_user.attributes.username;
	my_profile_id.innerText = this_user.id;
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

socket.on("peer_info", (peer) => {
	peer_cache[peer.id] = peer;
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

function get_peer_for_id(peer_id) {
	return new Promise((resolve, reject) => {
		if (peer_cache[peer_id]) {
			resolve(peer_cache[peer_id]);
		}
		else {
			socket.emit("get_peer", peer_id);
			const listener = (peer) => {
				if (peer.id !== peer_id) {
					return;
				}
	
				socket.off("peer_info", listener);
				resolve(peer);
			}
	
			socket.on("peer_info", listener);
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
	//console.log("Channel added: " + data.attributes.name + " (" + data.id + ")");
	let peer_id = data.relationships.peer.data.id;
	let peer_section = document.querySelector(`.peer[peer-id="${peer_id}"]`);
	if (!peer_section) {
		peer_section = document.createElement("div");
		peer_section.classList.add("peer");
		peer_section.setAttribute("peer-id", peer_id);
		
		let peer_name = document.createElement("div");
		peer_name.classList.add("peer-name");
		peer_name.innerText = data.relationships.peer.data.id;
		peer_section.appendChild(peer_name);

		get_peer_for_id(peer_id).then((peer) => {
			peer_name.innerText = peer.attributes.name;
		});

		channel_list.appendChild(peer_section);
	}

	let channel = document.createElement("div");
	channel.classList.add("channel");
	channel.setAttribute("channel-id", data.id);
	peer_section.appendChild(channel);

	if (data.attributes.admin_only) {
		let lock_icon = document.createElement("i");
		lock_icon.classList.add("fas", "fa-lock");
		lock_icon.classList.add("inline-icon");
		//lock_icon.style.float = "right";
		//lock_icon.style.cursor = "pointer";
		channel.appendChild(lock_icon);
	}

	let channel_name = document.createElement("span");
	channel_name.classList.add("channel-name");
	channel_name.innerText = data.attributes.name;
	channel.appendChild(channel_name);

	let delete_icon = document.createElement("i");
	delete_icon.classList.add("fas", "fa-times");
	delete_icon.classList.add("inline-icon");
	delete_icon.style.float = "right";
	delete_icon.style.cursor = "pointer";
	delete_icon.style.display = "none";
	delete_icon.addEventListener("click", (e) => {
		e.stopPropagation();
		socket.emit("channel_delete", data.id);
	});
	channel.appendChild(delete_icon);
	
	channel.addEventListener("mouseover", () => {
		if (this_user.attributes.admin) {
			delete_icon.style.display = "inline";
		}
	});

	channel.addEventListener("mouseleave", () => {
		delete_icon.style.display = "none";
	});
	
	channel.addEventListener("click", () => {
		message_input.disabled = false;
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

socket.on("channel_delete", (channel_id) => {
	let channel = document.querySelector(`.channel[channel-id="${channel_id}"]`);
	if (!channel) {
		return;
	}

	channel.remove();

	if (channel_id == current_channel_id) {
		// Clear messages pane
		messages.innerHTML = "";
		message_input.disabled = true;
		send_button.disabled = true;
		current_channel_id = null;
	}

	// Remove from message cache
	if (message_cache[channel_id]) {
		delete message_cache[channel_id];
	}
});

socket.on("pair_request", (data) => {
	console.log("Received pairing request:", data);

	let pair_request = document.createElement("div");
	pair_request.classList.add("pair-request");

	let request_text = document.createElement("span");
	request_text.innerText = data.attributes.message;
	pair_request.appendChild(request_text);

	let accept_button = document.createElement("button");
	accept_button.innerText = "Accept";
	accept_button.addEventListener("click", () => {
		socket.emit("respond_to_pair_request", {
			id: data.id,
			accepted: true
		});
	});
	pair_request.appendChild(accept_button);

	let reject_button = document.createElement("button");
	reject_button.innerText = "Reject";
	reject_button.addEventListener("click", () => {
		socket.emit("respond_to_pair_request", {
			id: data.id,
			accepted: false
		});
	});
	pair_request.appendChild(reject_button);

	pair_requests.appendChild(pair_request);
});