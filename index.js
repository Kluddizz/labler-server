const server = require('./server');
const db = require('./db');
const port = 5000;

server.post('/auth/login', async (req, res) => {
	const { username, password } = req.body;

  const query = await db.query(`
    SELECT *
    FROM users
    WHERE username = $1
          AND password = crypt($2, password)
    ;
  `, [username, password]);

  if (query.rows.length == 1) {
    const user = query.rows[0];
    const token = server.generateToken({ userId: user.id, username: user.username }, 'private.key');

    res.set(200, 'Authentication successful', { token: token });
  } else {
    res.set(403, 'Authentication failed');
  }
});

server.putAuth('/endpoint/groups', async (payload, req, res) => {
	const { groupName, groupType } = req.body;

	const query = await db.query(`
		INSERT INTO image_groups (name, userId, categoryId)
		VALUES ($1, $2, $3);
	`, [groupName, payload.userId, groupType]);

	res.set(200, 'Created new image group');
});

server.getAuth('/endpoint/groups', async (payload, req, res) => {
	const query = await db.query(`
		SELECT *
		FROM image_groups
		WHERE userId = $1
		;
	`, [payload.userId]);

	res.set(200, 'Fetched all image groups of user', { groups: query.rows });
});

server.getAuth('/endpoint/categories', async (payload, req, res) => {
	const query = await db.query(`
		SELECT *
		FROM categories;
	`, []);

	res.set(200, 'Fetched all available categories', { categories: query.rows });
});

server.getAuth('/endpoint/imageGroups/:imageGroupId', async (payload, req, res) => {
	const { imageGroupId } = req.params;

	const query = await db.query(`
		SELECT *
		FROM image_groups
		WHERE userId = $1
		      AND id = $2
		;
	`, [payload.userId, imageGroupId]);

	if (query.rows.length === 1) {
		const imageGroupName = query.rows[0].name;
		res.set(200, 'Fetched image group', { name: imageGroupName, images: [] });
	} else {
		res.set(400, 'Image group does not exist');
	}
});

server.listen(port, () => {
	console.log(`server running on port ${port}...`);
});
