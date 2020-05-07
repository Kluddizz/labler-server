const server = require('./server');
const db = require('./db');
const port = 5000;

server.listen(port, () => {
	console.log(`server running on port ${port}...`);
});
