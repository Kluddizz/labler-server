const fs = require('fs');
const { Pool } = require('pg');

function connectionConfig() {
  const raw = fs.readFileSync(`${__dirname}/../postgres.json`);
  return JSON.parse(raw);
}

const pool = new Pool(connectionConfig());

module.exports = {
  query: (text, params, callback) => pool.query(text, params, callback)
}
