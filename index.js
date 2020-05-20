const express = require("express");
const jwt = require("express-jwt");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const cors = require("cors");
const multer = require("multer");
const shell = require("shelljs");
const fs = require("fs");
const db = require("./db");
const jsonwebtoken = require("jsonwebtoken");

const server = express();
const port = 5000;
const publicKey = fs.readFileSync("public.key");

server.use("/endpoint", jwt({ secret: publicKey }));
server.use("/files", express.static(__dirname + "/files"));
server.use(bodyParser.urlencoded({ extended: true, limit: "100mb" }));
server.use(bodyParser.json());
server.use(helmet());
server.use(cors());

const generateToken = (payload, secretKeyFile) => {
	const secretKey = fs.readFileSync(secretKeyFile);
	const token = jsonwebtoken.sign(payload, secretKey, { algorithm: "RS256" });
	return token;
};

const storage = multer.diskStorage({
	destination: (req, file, callback) => {
		const { imageGroupId } = req.params;
		const dest = `./files/${imageGroupId}`;

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
		SELECT *
		FROM image_groups
		WHERE userId = $1
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
			SELECT *
			FROM images
			WHERE groupId = $1;
		`,
			[imageGroupId]
		);

		const imageGroupName = query1.rows[0].name;

		res.status(200).json({
			success: true,
			message: "Fetched image group",
			imageGroup: {
				name: imageGroupName,
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
				const query2 = await db.query(
					`
					INSERT INTO images (name, filename, groupid)
					VALUES ($1, $2, $3);
				`,
					[file.originalname, file.path, imageGroupId]
				);
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

server.listen(port, () => {
	console.log(`server running on port ${port}...`);
});
