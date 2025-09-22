import fs from 'fs';
import path from 'path';
import sqlite from './sqlite.js';
import mysql from './mysql.js';

const client = (process.env.DB_CLIENT || 'sqlite').toLowerCase();
let db;
if (client === 'mysql') {
  db = await mysql.connect({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'rustadmin'
  });
} else {
  const file = process.env.SQLITE_FILE || './data/panel.sqlite';
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = await sqlite.connect({ file });
}
export { db };

export async function initDb() {
  await db.init();
  const bcrypt = await import('bcrypt');
  const count = await db.countUsers();
  if (count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await db.createUser({ username: 'admin', password_hash: hash, role: 'admin' });
    console.log('Created default admin: admin / admin123');
  }
}
