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

io.on("connection", (socket) => {
	console.log("New user connection!");

	socket.on("disconnect", () => {
		console.log("User disconnected!");
	});

	socket.on("msg_send", (data) => {
		console.log("Message received: " + data.message);
		// TODO: rearchitect to use socket.broadcast.emit
		io.emit("msg_rcv", data);
	});
});



server.listen(port, () => {
	console.log(`Server started at port ${port}`);
});