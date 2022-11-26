const omni = require("omni");
const http = require("http");
const express = require("express");
const app = express();
const server = http.createServer(app);
const port = 80;
const { Server } = require("socket.io");
const io = new Server(server);

const path = require("path");
const public_directory = path.join(__dirname, "public");

app.use(express.static(public_directory));

omni.start("omniconf.json");

// TODO: Handle all events
omni.on("message", (data) => {
	io.emit("msg_rcv", data);
});

omni.on("user_online", (data) => {
	io.emit("user_online", data);
});

omni.on("user_offline", (data) => {
	io.emit("user_offline", data);
});

omni.on("channel_create", (data) => {
	io.emit("channel_create", data);
});

// TEMP: Make a couple test channels
omni.create_channel("TestChannel");
omni.create_channel("TestChannel2");

io.on("connection", (socket) => {
	// TEMP: Make a new user
	const user_id = omni.create_user("TestUser" + Math.floor(Math.random() * 1000));
	if (omni.login_user(user_id)) {
		console.log("New user connection!", user_id);
	}
	else {
		console.log("User login failed!", user_id);
	}

	// Send the user a list of all online users
	for (let user_id of omni.get_all_online_users()) {
		socket.emit("user_online", omni.get_user(user_id));
	}

	// Send the user a list of all channels
	for (let channel of omni.get_all_channels()) {
		console.log("Sending channel: " + channel.attributes.name);
		socket.emit("channel_create", channel);
	}

	socket.on("disconnect", () => {
		console.log("User disconnected!", user_id);
		omni.logout_user(user_id);
	});

	socket.on("msg_send", (data) => {
		console.log("Message received: " + data.message);
		const id_new_msg = omni.send_message(user_id, data.channel_id, data.message);
		console.log("Message sent: " + id_new_msg);
	});

	socket.on("channel_join", (data) => {
		console.log("User " + user_id + " joined channel " + data.channel_id);
		// Send user the last 50 messages
		for (let message of omni.get_messages(data.channel_id, Date.now())) {
			socket.emit("msg_rcv", message);
		}
	});
});

server.listen(port, () => {
	console.log(`Server started at port ${port}`);
});