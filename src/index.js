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

// TEMP: Make a test channel
const channel_id = omni.create_channel("TestChannel");

io.on("connection", (socket) => {
	// TEMP: Make a new user
	const user_id = omni.create_user("TestUser" + Math.floor(Math.random() * 1000));
	omni.login_user(user_id);
	console.log("New user connection!", user_id);

	socket.on("disconnect", () => {
		console.log("User disconnected!", user_id);
		omni.logout_user(user_id);
	});

	socket.on("msg_send", (data) => {
		console.log("Message received: " + data.message);
		omni.send_message(user_id, channel_id, data.message);
	});
});



server.listen(port, () => {
	console.log(`Server started at port ${port}`);
});