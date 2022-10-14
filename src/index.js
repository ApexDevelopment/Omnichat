const omni = require("omni");
const express = require("express");
const app = express();
const port = 80;

const path = require("path");
const public_directory = path.join(__dirname, "public");

app.use(express.static(public_directory));

app.listen(port, () => {
	console.log(`Server started at port ${port}`);
});