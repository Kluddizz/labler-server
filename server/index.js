const express    = require('express');
const bodyParser = require('body-parser');
const helmet     = require('helmet');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const fs         = require('fs');

// set some server configurations
const server = express();
let debugMode = false;

server.use(bodyParser.urlencoded({ extended: false }));
server.use(bodyParser.json());
server.use(helmet());
server.use(cors());

const checkAuth = (req) => {
  if (!req.headers || !req.headers.authorization) {
    throw new jwt.JsonWebTokenError();
  }

  const secretKey = fs.readFileSync('secret.key');
  const token = req.headers.authorization.replace('Bearer ', '');
  const payload = jwt.verify(token, secretKey);

  return payload;
};

class ServerResponse {

  constructor() {
    this.success = false;
    this.code = 500;
    this.message = 'Something went wrong';
  }

  set(code, message, objects = {}) {
    this.code = code;
    this.success = code >= 200 && code < 300;
    this.message = message;

    for (const property in this) {
      if (property !== 'success' && property !== 'code' && property !== 'message') {
        this[property] = undefined;
      }
    }

    for (const property in objects) {
      this[property] = objects[property];
    }
  }

}

const routeHandler = async (req, res, callback) => {
  const response = new ServerResponse();

  try {
    await callback(req, response);
  } catch (err) {
    if (debugMode) {
      response.set(500, err.message);
    } else {
      response.set(500, 'Something went wrong');
    }
  }

  res.status(response.code);
  res.json(response);
};

const routeHandlerAuthenticated = async (req, res, callback) => {
  const response = new ServerResponse();

  try {
    const payload = checkAuth(req);
    await callback(payload, req, response);
  } catch (err) {
    if (debugMode) {
      response.set(500, err.message);
    } else {
      response.set(500, 'Something went wrong');
    }
  }

  res.status(response.code);
  res.json(response);
};

module.exports = {

  get: (path, callback) => {
    server.get(path, async (req, res) => {
      await routeHandler(req, res, callback);
    });
  },

  post: (path, callback) => {
    server.post(path, async (req, res) => {
      await routeHandler(req, res, callback);
    });
  },

  patch: (path, callback) => {
    server.patch(path, async (req, res) => {
      await routeHandler(req, res, callback);
    });
  },

  delete: (path, callback) => {
    server.delete(path, async (req, res) => {
      await routeHandler(req, res, callback);
    });
  },

  put: (path, callback) => {
    server.put(path, async (req, res) => {
      await routeHandler(req, res, callback);
    });
  },

  getAuth: (path, callback) => {
    server.get(path, async (req, res) => {
      await routeHandlerAuthenticated(req, res, callback);
    });
  },

  postAuth: (path, callback) => {
    server.post(path, async (req, res) => {
      await routeHandlerAuthenticated(req, res, callback);
    });
  },

  patchAuth: (path, callback) => {
    server.patch(path, async (req, res) => {
      await routeHandlerAuthenticated(req, res, callback);
    });
  },

  deleteAuth: (path, callback) => {
    server.delete(path, async (req, res) => {
      await routeHandlerAuthenticated(req, res, callback);
    });
  },

  putAuth: (path, callback) => {
    server.put(path, async (req, res) => {
      await routeHandlerAuthenticated(req, res, callback);
    });
  },

  listen: (port, callback) => server.listen(port, callback),

  generateToken: (payload, secretKeyFile) => {
    const secretKey = fs.readFileSync(secretKeyFile);
    const token = jwt.sign(payload, secretKey);
    return token;
  },

  setDebugMode: (mode) => debugMode = mode

}
