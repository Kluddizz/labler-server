const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cors = require('cors');

// Server variables
const app = express();
const port = 5000;

// Make it possible to use json and form bodies
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Security stack
app.use(helmet());
app.use(cors());

// Start listening
app.listen(port, () => {
	console.log(`server listening on port ${port}...`);
});
