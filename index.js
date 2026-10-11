import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { generateStory } from './ai.js';
import { generateIllustration } from './image.js';
import { saveBook, getBook, listBooks } from './storage.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const IS_DEMO = process.env.DEMO_MODE === 'true';

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', demoMode: IS_DEMO, version: '1.1.0' });
});

app.post('/api/story', async (req, res) => {
  try {
    const { idea, heroName, wishes, genre, ageGroup, pagesCount } = req.body;
    if (!idea || typeof idea !== 'string' || idea.trim().length === 0) {
      return res.status(400).json({ error: 'Идея истории обязательна.' });
    }

    const bookData = await generateStory({
      idea: idea.replace(/<[^>]*>?/gm, '').trim(),
      heroName: (heroName || 'Юный герой').replace(/<[^>]*>?/gm, '').trim(),
      wishes: (wishes || '').replace(/<[^>]*>?/gm, '').trim(),
      genre: genre || 'приключение',
      ageGroup: ageGroup || '7-9',
      pagesCount: parseInt(pagesCount, 10) || 6,
      isDemo: IS_DEMO
    });

    res.json(bookData);
  } catch (error) {
    console.error('Ошибка генерации истории:', error);
    res.status(500).json({ error: 'Не удалось создать историю.' });
  }
});

app.post('/api/image', async (req, res) => {
  try {
    const { prompt, style, heroDescription } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Промпт обязателен.' });

    const imageUrl = await generateIllustration({ prompt, style, heroDescription, isDemo: IS_DEMO });
    res.json({ imageUrl });
  } catch (error) {
    console.error('Ошибка генерации иллюстрации:', error);
    res.status(500).json({ error: 'Не удалось сгенерировать изображение.' });
  }
});

app.post('/api/books', async (req, res) => {
  try {
    const bookData = req.body;
    if (!bookData || !bookData.title || !bookData.pages) {
      return res.status(400).json({ error: 'Некорректные данные книги.' });
    }
    const bookId = bookData.id || crypto.randomUUID();
    bookData.id = bookId;
    bookData.createdAt = new Date().toISOString();

    const env = req.env || process.env;
    await saveBook(env, bookId, bookData);

    res.json({ success: true, bookId });
  } catch (error) {
    console.error('Ошибка сохранения книги:', error);
    res.status(500).json({ error: 'Не удалось сохранить книгу в базу данных.' });
  }
});

app.get('/api/books', async (req, res) => {
  try {
    const env = req.env || process.env;
    const books = await listBooks(env);
    res.json(books);
  } catch (error) {
    console.error('Ошибка загрузки списка книг:', error);
    res.status(500).json({ error: 'Не удалось получить список книг.' });
  }
});

app.get('/api/books/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    const env = req.env || process.env;
    const book = await getBook(env, bookId);
    if (!book) return res.status(404).json({ error: 'Книга не найдена.' });
    res.json(book);
  } catch (error) {
    console.error('Ошибка загрузки книги:', error);
    res.status(500).json({ error: 'Не удалось загрузить книгу.' });
  }
});

app.listen(PORT, () => {
  console.log(`Книжная мастерская NeuroGym запущена на порту ${PORT} (SQLite / KV хранилище активно)`);
});
