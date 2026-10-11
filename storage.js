import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let localDb = null;

function getLocalDb() {
  if (!localDb) {
    const dbDir = path.resolve('./data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    localDb = new Database(path.join(dbDir, 'books.db'));
    localDb.exec(`
      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        title TEXT,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  return localDb;
}

export async function saveBook(env, bookId, bookData) {
  if (env && env.BOOK_KV) {
    await env.BOOK_KV.put(bookId, JSON.stringify(bookData));
    return;
  }

  const db = getLocalDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO books (id, title, data) VALUES (?, ?, ?)');
  stmt.run(bookId, bookData.title || 'Без названия', JSON.stringify(bookData));
}

export async function getBook(env, bookId) {
  if (env && env.BOOK_KV) {
    const data = await env.BOOK_KV.get(bookId, { type: 'json' });
    return data;
  }

  const db = getLocalDb();
  const row = db.prepare('SELECT data FROM books WHERE id = ?').get(bookId);
  return row ? JSON.parse(row.data) : null;
}

export async function listBooks(env) {
  if (env && env.BOOK_KV) {
    const list = await env.BOOK_KV.list();
    const books = [];
    for (const key of list.keys) {
      const val = await env.BOOK_KV.get(key.name, { type: 'json' });
      if (val) {
        books.push({ 
          id: key.name, 
          title: val.title, 
          description: val.description,
          createdAt: val.createdAt || new Date().toISOString()
        });
      }
    }
    return books;
  }

  const db = getLocalDb();
  const rows = db.prepare('SELECT id, title, data, created_at FROM books ORDER BY created_at DESC LIMIT 30').all();
  return rows.map(r => {
    const parsed = JSON.parse(r.data);
    return { 
      id: r.id, 
      title: r.title, 
      description: parsed.description, 
      createdAt: r.created_at 
    };
  });
}
