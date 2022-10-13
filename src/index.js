const express = require("express");
const app = express();
const port = 80;

const omni = require("omni");

app.get("/", (req, res) => {
	  res.send("Coming soon!™");
});

app.listen(port, () => {
	console.log(`Server started at port ${port}`);
});