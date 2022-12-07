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
app.use(express.json());

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

app.post("/api/new_account", async (req, res) => {
	const username = req.body.username;

	// Validate username
	if (username.length < 3) {
		res.status(400).send("Username must be at least 3 characters long.");
		return;
	}
	if (username.length > 32) {
		res.status(400).send("Username must be at most 32 characters long.");
		return;
	}
	if (!username.match(/^[a-zA-Z0-9_]+$/)) {
		res.status(400).send("Username must only contain letters, numbers, and underscores.");
		return;
	}

	const user_id = await omni.create_user(username);

	if (user_id) {
		res.status(200).send(user_id);
	}
	else {
		res.status(500).send("Failed to create user.");
	}
});

io.on("connection", (socket) => {
	socket.once("login", async (user_id) => {
		if (await omni.login_user(user_id)) {
			console.log("New user connection!", user_id);
		}
		else {
			console.log("User login failed!", user_id);
		}

		socket.on("disconnect", () => {
			console.log("User disconnected!", user_id);
			omni.logout_user(user_id);
		});

		socket.on("msg_send", async (data) => {
			console.log(`Message received: ${data.message}`);
			const id_new_msg = await omni.send_message(user_id, data.channel_id, data.message);
			console.log(`Message sent: ${id_new_msg}`);
		});

		socket.on("channel_join", async (data) => {
			console.log("User " + user_id + " joined channel " + data.channel_id);
			// Send user the last 50 messages
			const messages = await omni.get_messages(data.channel_id, Date.now());
			for (let message of messages) {
				console.log(`Sending backlog message: ${message.attributes.content}`);
				socket.emit("msg_rcv", message);
			}
		});

		socket.on("get_user", async (user_id) => {
			socket.emit("user_info", await omni.get_user(user_id));
		});

		// Send the user a list of all online users
		const online_users = omni.get_all_online_users(); // For now this API is synchronous
		for (let user_id of online_users) {
			socket.emit("user_online", await omni.get_user(user_id));
		}

		// Send the user a list of all channels
		const channels = await omni.get_all_channels();
		for (let channel of channels) {
			console.log(`Sending channel: ${channel.attributes.name}`);
			socket.emit("channel_create", channel);
		}
	});

	socket.emit("login_poke");
});

async function boot() {// TEMP: Make a couple test channels
	await omni.create_channel("general");
	await omni.create_channel("general-2");
	await omni.create_channel("admins-only", true);
	
	server.listen(port, () => {
		console.log(`Server started at port ${port}`);
	});
}

boot();