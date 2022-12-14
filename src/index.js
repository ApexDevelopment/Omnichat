const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const path = require("path");
const public_directory = path.join(__dirname, "public");

/**
 * Starts the web server and Omni server.
 * @param {string} conf The path to the Omni configuration file.
 * @param {number} port The port on which to run the web server.
 * @returns {Promise<void>} A promise that does not resolve to anything, and should not be used.
 * @private
 */
async function boot_omni(conf, port) {
	// The Omni server itself
	const omni = await require("omni").create();
	// The Express app that will serve the web client
	const app = express();
	// The web server
	const server = http.createServer(app);
	// The Socket.IO server
	const io = new Server(server);
	
	// A map of Omni user IDs to Socket.IO sockets
	let user_to_socket_map = new Map();
	
	app.use(express.static(public_directory));
	app.use(express.json());
	
	// Boot the Omni server given the configuration file
	omni.start(conf);
	
	/***********************/
	/* Omni Event Handlers */
	/***********************/
	// TODO: Handle all Omni-generated events

	// When Omni informs us that a message is being sent, we need to send it to the appropriate Socket.IO sockets.
	omni.on("message", (data) => {
		let message = data.message;
		let recipients = data.recipients;

		// Send the message to each recipient that Omni specified
		for (let recipient of recipients) {
			console.log(`Sending message to ${recipient.id}`);
			let socket = user_to_socket_map.get(recipient.id);
			socket.emit("msg_rcv", message);
		}
	});

	// See omni.on("message"). Same, but for deleting a message instead of sending one.
	omni.on("message_delete", (data) => {
		let message = data.message;
		let recipients = data.recipients;

		for (let recipient of recipients) {
			let socket = user_to_socket_map.get(recipient.id);
			socket.emit("msg_del", message);
		}
	});
	
	// When a user logs in, we need to inform all other users that they are online.
	omni.on("user_online", (data) => {
		io.emit("user_online", data);
	});
	
	// When a user logs out, we need to inform all other users that they are offline.
	omni.on("user_offline", (data) => {
		io.emit("user_offline", data);
	});
	
	// When a channel is created, inform all users.
	omni.on("channel_create", (data) => {
		io.emit("channel_create", data);
	});
	
	// When a channel is deleted, inform all users.
	omni.on("channel_delete", (data) => {
		io.emit("channel_delete", data);
	});

	// When we receive a request to pair with another server, we need to send it to all admins.
	omni.on("pair_request", async (data) => {
		let users = await omni.get_all_online_local_users();

		for (let user of users) {
			if (user.attributes.admin) {
				let socket = user_to_socket_map.get(user.id);
				socket.emit("pair_request", data);
			}
		}
	});

	// When a peer has accepted our pairing request, we need to send the peer info to all local users.
	omni.on("pair_accept", async (data) => {
		let peer = await omni.get_peer(data.id);
		let users = await omni.get_all_online_local_users();

		for (let user of users) {
			let socket = user_to_socket_map.get(user.id);
			socket.emit("peer_info", peer);
		}
	});

	// When a peer has come online, we need to send the peer info to all local users.
	omni.on("peer_online", async (data) => {
		let users = await omni.get_all_online_local_users();

		for (let user of users) {
			let socket = user_to_socket_map.get(user.id);
			socket.emit("peer_info", data);
		}
	});
	
	/**************************/
	/* Express Event Handlers */
	/**************************/
	
	// When a user creates a new account, we need to create the account in Omni.
	app.post("/api/new_account", async (req, res) => {
		const username = req.body.username;
		const admin = req.body.admin ? true : false;
	
		// Validate the username
		if (username.length < 3) {
			res.status(400).send("Username must be at least 3 characters long.");
			return;
		}
		if (username.length > 32) {
			res.status(400).send("Username must be at most 32 characters long.");
			return;
		}
		if (!username.match(/^[a-zA-Z0-9_\-]+$/)) {
			res.status(400).send("Username must only contain letters, numbers, underscores, and dashes.");
			return;
		}
	
		// Attempt to create the user
		const user_id = await omni.create_user(username, admin);
	
		if (user_id) {
			// If user_id is not null, then the user was created successfully.
			// Send the user ID to the client.
			res.status(200).send(user_id);
		}
		else {
			// If user_id is null, then the user was not created successfully.
			res.status(500).send("Failed to create user.");
		}
	});
	
	/****************************/
	/* Socket.IO Event Handlers */
	/****************************/
	
	// When a user connects to the server, we need to try to log them in to Omni.
	io.on("connection", (socket) => {
		// First we set up a listener for the login event.
		socket.once("login", async (user_id) => {
			// Try to log the user in. Omni will handle validation of the user.
			if (!(await omni.login_user(user_id))) {
				socket.emit("login_fail");
				return;
			}
	
			// Get the user's info.
			const user = await omni.get_user(user_id);

			// Add the user to the ID to socket map so we can find their socket
			// in other event handlers.
			user_to_socket_map.set(user_id, socket);
	
			// Add a handler for when the user disconnects.
			socket.on("disconnect", () => {
				user_to_socket_map.delete(user_id);
				omni.logout_user(user_id);
			});
	
			// Tell Omni when the user tries to send a message.
			socket.on("msg_send", async (data) => {
				omni.send_message(user_id, data.channel_id, data.message);
			});

			// Tell Omni when the user tries to delete a message.
			// Performs some additional validation to make sure the user is
			// allowed to delete the message.
			socket.on("msg_del", async(message_id) => {
				let message = await omni.get_message(message_id);
				let channel = await omni.get_channel(message.relationships.channel.data.id);

				if (channel.relationships.peer.data.id != omni.id()) {
					return;
				}
				
				if (user.attributes.admin || message.relationships.user.data.id == user_id) {
					omni.delete_message(message_id);
				}
			});
	
			// Tell Omni when the user is joining a channel so we can send them
			// the last 50 messages.
			socket.on("channel_join", async (data) => {
				// Sends the user the last 50 messages.
				const messages = await omni.get_messages(data.channel_id, Date.now());
				for (let message of messages) {
					socket.emit("msg_rcv", message);
				}
			});
	
			// Users can request information about other users. Tell them about
			// the user they requested.
			socket.on("get_user", async (user_id) => {
				socket.emit("user_info", await omni.get_user(user_id));
			});

			// Tell the user about any peer they request information about.
			socket.on("get_peer", async (peer_id) => {
				socket.emit("peer_info", await omni.get_peer(peer_id));
			});

			// Listen for when the user tries to create a channel.
			socket.on("channel_create", async (data) => {
				// Only admins can create channels.
				if (user.attributes.admin) {
					// Validate channel name.
					if (!data.name.match(/^[a-zA-Z0-9\-]+$/)) {
						socket.emit("channel_create_fail", "Channel name must only contain letters, numbers, and dashes.");
						return;
					}

					// Tell Omni to create the channel.
					const channel_id = await omni.create_channel(data.name, data.admin_only, data.is_private);
					console.log(`User ${user_id} created channel ${channel_id}`);
				}
			});
	
			// Listen for when the user tries to delete a channel.
			socket.on("channel_delete", async (channel_id) => {
				// Only admins can delete channels.
				if (user.attributes.admin) {
					// Tell Omni to delete the channel.
					let success = await omni.delete_channel(channel_id);
					if (success) {
						console.log(`User ${user_id} deleted channel ${channel_id}`);
					}
					else {
						console.log(`User ${user_id} failed to delete channel ${channel_id}`);
					}
				}
			});

			// Listen for when the user tries to pair this Omni instance
			// with another.
			socket.on("send_pair_request", async (data) => {
				// Only admins can pair this server with others.
				if (user.attributes.admin) {
					omni.send_pair_request(data.address, data.port);
				}
			});

			// Listen for when the user tries to respond to a pair request.
			socket.on("respond_to_pair_request", async (data) => {
				// Only admins can pair this server with others.
				if (user.attributes.admin) {
					omni.respond_to_pair_request(data.id, data.accepted);
				}
			});

			// Send the user their own info.
			socket.emit("my_user", user);
	
			// Send the user a list of all online users.
			const online_users = omni.get_all_online_users(); // For now this API is synchronous.
			for (let user_id of online_users) {
				socket.emit("user_online", await omni.get_user(user_id));
			}
	
			// Send the user a list of all channels.
			const channels = await omni.get_all_channels();
			for (let channel of channels) {
				if (channel.attributes.admin_only && !user.attributes.admin) {
					continue;
				}
				socket.emit("channel_create", channel);
			}

			socket.emit("this_server", omni.id());
		});
	
		// Now that we have our login handler set up, we can ask the user to
		// provide their credentials.
		socket.emit("login_poke");
	});
	
	// DEMO ONLY: Make a couple test channels. In a real application, you
	// would probably want to create channels only when the user requests it
	// (or provide only a default channel via a config file somewhere).
	await omni.create_channel("general");
	await omni.create_channel("general-2");
	await omni.create_channel("admins-only", true);
	
	// Start the web server.
	server.listen(port, () => {
		console.log(`Server started at port ${port}!`);
	});
}

let config = process.argv[2] || "omniconf.json";
let port = process.argv[3] || 80;

boot_omni(config, port);