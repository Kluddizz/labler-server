const express = require("express");
const https = require("https");
const jwt = require("express-jwt");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const cors = require("cors");
const multer = require("multer");
const shell = require("shelljs");
const fs = require("fs");
const path = require("path");
const sizeOf = require("image-size");
const db = require("./db");
const jsonwebtoken = require("jsonwebtoken");

const server = express();
const port = 5000;
const publicKey = fs.readFileSync(`${__dirname}/public.key`);

const privateKey = fs.readFileSync(
	"/etc/letsencrypt/live/volbyte.com/privkey.pem"
);
const certificate = fs.readFileSync(
	"/etc/letsencrypt/live/volbyte.com/cert.pem"
);
const ca = fs.readFileSync("/etc/letsencrypt/live/volbyte.com/chain.pem");

server.use("/endpoint", jwt({ secret: publicKey }));
server.use("/files", express.static(__dirname + "/files"));
server.use(bodyParser.urlencoded({ extended: true, limit: "100mb" }));
server.use(bodyParser.json());
server.use(helmet());
server.use(cors());

const generateToken = (payload, secretKeyFile) => {
	const secretKey = fs.readFileSync(`${__dirname}/${secretKeyFile}`);
	const token = jsonwebtoken.sign(payload, secretKey, { algorithm: "RS256" });
	return token;
};

const storage = multer.diskStorage({
	destination: (req, file, callback) => {
		const { imageGroupId } = req.params;
		const dest = `${__dirname}/files/${imageGroupId}`;

		shell.mkdir("-p", dest);
		callback(null, dest);
	},

	filename: (req, file, callback) => {
		callback(null, Date.now() + "_" + file.originalname);
	}
});

const upload = multer({ storage: storage }).array("images");

server.post("/auth/login", async (req, res) => {
	const { username, password } = req.body;

	const query = await db.query(
		`
    SELECT *
    FROM users
    WHERE username = $1
          AND password = crypt($2, password)
    ;
  `,
		[username, password]
	);

	if (query.rows.length == 1) {
		const user = query.rows[0];
		const token = generateToken(
			{ id: user.id, username: user.username },
			"private.key"
		);

		res.status(200).json({
			success: true,
			message: "Authentication successful",
			token: token
		});
	} else {
		res.status(403).json({
			success: false,
			message: "Authentication failed"
		});
	}
});

server.put("/endpoint/groups", async (req, res) => {
	const { groupName, groupType } = req.body;

	const query = await db.query(
		`
		INSERT INTO image_groups (name, userId, categoryId)
		VALUES ($1, $2, $3);
	`,
		[groupName, req.user.id, groupType]
	);

	res.status(200).json({
		success: true,
		message: "Created new image group"
	});
});

server.get("/endpoint/groups", async (req, res) => {
	const query = await db.query(
		`
		SELECT image_groups.*,
					 (SELECT filename FROM images WHERE images.groupId = image_groups.id LIMIT 1) AS thumbnail
		FROM image_groups
		WHERE image_groups.userId = $1
		;
	`,
		[req.user.id]
	);

	res.status(200).json({
		success: true,
		message: "Fetched all image groups of user",
		groups: query.rows
	});
});

server.get("/endpoint/categories", async (req, res) => {
	const query = await db.query(
		`
		SELECT *
		FROM categories;
	`,
		[]
	);

	res.status(200).json({
		success: true,
		message: "Fetched all available categories",
		categories: query.rows
	});
});

server.get("/endpoint/imageGroups/:imageGroupId", async (req, res) => {
	const { imageGroupId } = req.params;

	const query1 = await db.query(
		`
		SELECT *
		FROM image_groups
		WHERE userId = $1
		      AND id = $2
		;
	`,
		[req.user.id, imageGroupId]
	);

	if (query1.rows.length === 1) {
		const query2 = await db.query(
			`
			SELECT images.*,
						 (SELECT COUNT(*) FROM labelings WHERE labelings.imageid = images.id) :: INTEGER AS labelings
			FROM images
			WHERE images.groupId = $1;
		`,
			[imageGroupId]
		);

		const { name } = query1.rows[0];

		res.status(200).json({
			success: true,
			message: "Fetched image group",
			imageGroup: {
				name: name,
				images: query2.rows
			}
		});
	} else {
		res.status(400).json({
			success: false,
			message: "Image group does not exist"
		});
	}
});

server.post("/endpoint/imageGroups/:imageGroupId/images", async (req, res) => {
	const { imageGroupId } = req.params;

	const query1 = await db.query(
		`
		SELECT *
		FROM image_groups
		WHERE userid = $1
					AND id = $2
		;
	`,
		[req.user.id, imageGroupId]
	);

	if (query1.rows.length === 1) {
		let files = [];

		const err = await new Promise((resolve, reject) => {
			upload(req, res, err => {
				files = req.files;
				resolve(err);
			});
		});

		if (!err) {
			for (const file of files) {
				sizeOf(file.path, async (err, dimensions) => {
					const query2 = await db.query(
						`
						INSERT INTO images (name, filename, groupid, width, height)
						VALUES ($1, $2, $3, $4, $5);
					`,
						[
							file.originalname,
							path.relative(__dirname, file.path),
							imageGroupId,
							dimensions.width,
							dimensions.height
						]
					);
				});
			}

			res.status(200).json({
				success: true,
				message: "Uploaded files"
			});
		} else {
			res.status(400).json({
				success: false,
				message: "Could not upload files"
			});
		}
	} else {
		res.status(400).json({
			success: false,
			message: "You are not allowed to do this"
		});
	}
});

server.get("/endpoint/images/:imageId", async (req, res) => {
	const { imageId } = req.params;

	const query = await db.query(
		`
		SELECT *
		FROM images
		WHERE id = $1;
	`,
		[imageId]
	);

	if (query.rows.length === 1) {
		res.status(200).json({
			success: true,
			message: "Fetched image",
			image: query.rows[0]
		});
	} else {
		res.status(400).json({
			success: false,
			message: "There is no image with the given ID"
		});
	}
});

server.post("/endpoint/imageGroups/:imageGroupId/labels", async (req, res) => {
	const { imageGroupId } = req.params;
	const { labelName, labelColor } = req.body;

	const query1 = await db.query(
		`
		SELECT *
		FROM image_groups
		WHERE userid = $1
			    AND id = $2;
	`,
		[req.user.id, imageGroupId]
	);

	if (query1.rows.length > 0) {
		const query = await db.query(
			`
			INSERT INTO labels (name, color, groupid)
			VALUES ($1, $2, $3);
		`,
			[labelName, labelColor, imageGroupId]
		);

		res.status(200).json({
			success: true,
			message: "Created new label"
		});
	} else {
		res.status(400).json({
			success: false,
			message: "You are not allowed to do this"
		});
	}
});

server.get("/endpoint/imageGroups/:imageGroupId/labels", async (req, res) => {
	const { imageGroupId } = req.params;

	const query1 = await db.query(
		`
		SELECT *
		FROM image_groups
		WHERE userid = $1
			    AND id = $2;
	`,
		[req.user.id, imageGroupId]
	);

	if (query1.rows.length > 0) {
		const query2 = await db.query(
			`
			SELECT *
			FROM labels
			WHERE groupid = $1;
		`,
			[imageGroupId]
		);

		res.status(200).json({
			success: true,
			message: "Fetched all labels of image group",
			labels: query2.rows
		});
	} else {
		res.status(400).json({
			success: false,
			message: "You are not allowed to do this"
		});
	}
});

server.delete(
	"/endpoint/imageGroups/:imageGroupId/labels/:labelId",
	async (req, res) => {
		const { imageGroupId, labelId } = req.params;

		const query1 = await db.query(
			`
		SELECT *
		FROM image_groups
		WHERE userid = $1
			    AND id = $2;
	`,
			[req.user.id, imageGroupId]
		);

		if (query1.rows.length > 0) {
			const query2 = await db.query(
				`
			DELETE
			FROM labels
			WHERE id = $1;
		`,
				[labelId]
			);

			res.status(200).json({
				success: true,
				message: "Deleted label"
			});
		} else {
			res.status(400).json({
				success: false,
				message: "You are not allowed to do this"
			});
		}
	}
);

server.post(
	"/endpoint/imageGroups/:imageGroupId/images/:imageId/labels/:labelId",
	async (req, res) => {
		const { imageGroupId, imageId, labelId } = req.params;
		const { start, end } = req.body;

		const query1 = await db.query(
			`
		SELECT *
		FROM image_groups
		WHERE userid = $1
			    AND id = $2;
	`,
			[req.user.id, imageGroupId]
		);

		if (query1.rows.length > 0) {
			const query2 = await db.query(
				`
				INSERT INTO labelings (startx, starty, endx, endy, labelid, imageid)
				VALUES ($1, $2, $3, $4, $5, $6);
		`,
				[start.x, start.y, end.x, end.y, labelId, imageId]
			);

			res.status(200).json({
				success: true,
				message: "Labeled successfull"
			});
		} else {
			res.status(400).json({
				success: false,
				message: "You are not allowed to do this"
			});
		}
	}
);

server.delete(
	"/endpoint/imageGroups/:imageGroupId/images/:imageId/labels/:labelingId",
	async (req, res) => {
		const { imageGroupId, imageId, labelingId } = req.params;

		const query1 = await db.query(
			`
		SELECT *
		FROM image_groups
		WHERE userid = $1
			    AND id = $2;
	`,
			[req.user.id, imageGroupId]
		);

		if (query1.rows.length > 0) {
			const query2 = await db.query(
				`
				DELETE
				FROM labelings
				WHERE id = $1
							AND imageid = $2;
		`,
				[labelingId, imageId]
			);

			res.status(200).json({
				success: true,
				message: "Deleted labeled section"
			});
		} else {
			res.status(400).json({
				success: false,
				message: "You are not allowed to do this"
			});
		}
	}
);

server.get(
	"/endpoint/imageGroups/:imageGroupId/images/:imageId/labels",
	async (req, res) => {
		const { imageGroupId, imageId } = req.params;

		const query1 = await db.query(
			`
		SELECT *
		FROM image_groups
		WHERE userid = $1
			    AND id = $2;
	`,
			[req.user.id, imageGroupId]
		);

		if (query1.rows.length > 0) {
			const query2 = await db.query(
				`
				SELECT *
				FROM labelings
				WHERE imageid = $1;
		`,
				[imageId]
			);

			res.status(200).json({
				success: true,
				message: "Fetched all labelings",
				labelings: query2.rows
			});
		} else {
			res.status(400).json({
				success: false,
				message: "You are not allowed to do this"
			});
		}
	}
);

server.get("/endpoint/imageGroups/:imageGroupId/export", async (req, res) => {
	const { imageGroupId } = req.params;

	// Create images folder
	const folder = `${__dirname}/export/${imageGroupId}/${Date.now()}`;
	shell.mkdir("-p", `${folder}/images`);
	shell.mkdir("-p", `${folder}/labels`);
	shell.cp("-r", `${__dirname}/files/${imageGroupId}/*`, `${folder}/images`);

	const query1 = await db.query(
		`
		SELECT *
		FROM labels
		WHERE groupid = $1;
	`,
		[imageGroupId]
	);

	const query2 = await db.query(
		`
		SELECT *
		FROM images
		JOIN labelings
			ON labelings.imageid = images.id
		WHERE images.groupid = $1;
	`,
		[imageGroupId]
	);

	const query3 = await db.query(
		`
		SELECT *
		FROM images
		WHERE groupid = $1;
	`,
		[imageGroupId]
	);

	// Create class file
	for (const label of query1.rows) {
		fs.appendFileSync(`${folder}/classes.names`, `${label.name}\r\n`);
	}

	for (const labeling of query2.rows) {
		const { dir, name } = path.parse(labeling.filename);
		const labelIndex = query1.rows.findIndex(
			label => label.id === labeling.labelid
		);
		const centerX = (labeling.endx + labeling.startx) / (2.0 * labeling.width);
		const centerY = (labeling.endy + labeling.starty) / (2.0 * labeling.height);
		const width = (labeling.endx - labeling.startx) / labeling.width;
		const height = (labeling.endy - labeling.starty) / labeling.height;

		fs.appendFileSync(
			`${folder}/labels/${name}.txt`,
			`${labelIndex} ${centerX} ${centerY} ${width} ${height}\r\n`
		);
	}

	// Create data information file
	for (const file of query3.rows) {
		const { name, ext } = path.parse(file.filename);
		fs.appendFileSync(`${folder}/data.txt`, `./images/${name}${ext}\r\n`);
	}

	// Create zip file
	shell.exec(`cd ${folder} ; zip -r archive.zip ./*`, { silent: true }, () => {
		const filename = `${folder}/archive.zip`;
		const stream = fs.createReadStream(filename);

		res.setHeader("Content-Type", "application/zip");
		stream.pipe(res).once("close", () => {
			stream.destroy();
			shell.rm("-rf", folder);
		});
	});
});

// ------------------------------------------------

const credentials = {
	key: privateKey,
	cert: certificate
};

const app = https.createServer(credentials, server);

app.listen(port, () => {
	console.log(`server running on port ${port}...`);
});
