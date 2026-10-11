const VERSION = "1.2.0";
const DEMO_IMAGES = [
  "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=800&q=80"
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (error) {
        console.error("API error:", error?.stack || error);
        return json({ error: "Внутренняя ошибка сервера. Попробуйте ещё раз." }, 500);
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Статические файлы не настроены. Проверьте [assets] в wrangler.toml.", { status: 500 });
  }
};

async function handleApi(request, env, url) {
  const path = url.pathname;
  const demoMode = String(env.DEMO_MODE || "false").toLowerCase() === "true" || !env.OPENAI_API_KEY;

  if (request.method === "GET" && path === "/api/status") {
    return json({ status: "ok", demoMode, version: VERSION, storage: env.BOOK_KV ? "kv" : "browser-local" });
  }

  if (request.method === "POST" && path === "/api/story") {
    const body = await readJson(request);
    const idea = cleanText(body.idea, 1200);
    if (!idea) return json({ error: "Идея истории обязательна." }, 400);
    const params = {
      idea,
      heroName: cleanText(body.heroName || "Юный герой", 120),
      wishes: cleanText(body.wishes || "", 1000),
      genre: cleanText(body.genre || "приключение", 80),
      ageGroup: cleanText(body.ageGroup || "7-9", 20),
      pagesCount: Math.max(2, Math.min(12, Number.parseInt(body.pagesCount, 10) || 6))
    };
    if (demoMode) return json(getDemoStory(params));
    return json(await generateStory(env, params));
  }

  if (request.method === "POST" && path === "/api/image") {
    const body = await readJson(request);
    const prompt = cleanText(body.prompt, 3000);
    if (!prompt) return json({ error: "Промпт обязателен." }, 400);
    if (demoMode && !env.IMAGE_API_KEY) {
      return json({ imageUrl: DEMO_IMAGES[Math.floor(Math.random() * DEMO_IMAGES.length)] });
    }
    const key = env.IMAGE_API_KEY || env.OPENAI_API_KEY;
    if (!key) return json({ imageUrl: DEMO_IMAGES[0], demoMode: true });
    const style = cleanText(body.style || "Тёплая акварельная иллюстрация для детской книги, мягкие цвета, фактура бумаги", 500);
    const hero = cleanText(body.heroDescription || "", 1000);
    const fullPrompt = `${style}. Keep the same character design throughout the book. Character details: ${hero}. Scene: ${prompt}. Child-friendly watercolor storybook illustration, gentle expressive characters, rich but soft colors, beautiful composition, no text, no letters, no watermark.`;
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model: "dall-e-3", prompt: fullPrompt, n: 1, size: "1024x1024", quality: "standard" })
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Image API error", response.status, detail.slice(0, 800));
      return json({ error: "Не удалось создать иллюстрацию. Проверьте ключ IMAGE_API_KEY/OPENAI_API_KEY и лимиты API." }, 502);
    }
    const data = await response.json();
    const imageUrl = data?.data?.[0]?.url;
    if (!imageUrl) return json({ error: "Сервис изображений не вернул ссылку на картинку." }, 502);
    return json({ imageUrl });
  }

  if (request.method === "POST" && path === "/api/books") {
    const book = await readJson(request);
    if (!book || typeof book.title !== "string" || !Array.isArray(book.pages)) {
      return json({ error: "Некорректные данные книги." }, 400);
    }
    const id = cleanText(book.id || crypto.randomUUID(), 100) || crypto.randomUUID();
    book.id = id;
    book.createdAt = book.createdAt || new Date().toISOString();
    if (env.BOOK_KV) {
      await env.BOOK_KV.put(`book:${id}`, JSON.stringify(book));
      return json({ success: true, bookId: id, storage: "kv" });
    }
    // Browser localStorage is the fallback. The API returns an ID so the UI can keep working.
    return json({ success: true, bookId: id, storage: "browser-local" });
  }

  if (request.method === "GET" && path === "/api/books") {
    if (!env.BOOK_KV) return json([]);
    const result = await env.BOOK_KV.list({ prefix: "book:", limit: 1000 });
    const books = [];
    for (const key of result.keys) {
      const book = await env.BOOK_KV.get(key.name, "json");
      if (book) books.push({ id: book.id || key.name.slice(5), title: book.title || "Без названия", description: book.description || "", createdAt: book.createdAt || key.metadata?.createdAt || "" });
    }
    books.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return json(books);
  }

  const bookMatch = path.match(/^\/api\/books\/([^/]+)$/);
  if (request.method === "GET" && bookMatch) {
    if (!env.BOOK_KV) return json({ error: "Книга хранится в локальной библиотеке браузера." }, 404);
    const id = decodeURIComponent(bookMatch[1]);
    const book = await env.BOOK_KV.get(`book:${id}`, "json");
    if (!book) return json({ error: "Книга не найдена." }, 404);
    return json(book);
  }

  return json({ error: "Маршрут не найден." }, 404);
}

async function generateStory(env, { idea, heroName, wishes, genre, ageGroup, pagesCount }) {
  const systemPrompt = `Ты — детский писатель. Создай добрую, безопасную для детей ${ageGroup}-летнего возраста иллюстрированную историю на русском языке. Жанр: ${genre}. Ровно ${pagesCount} страниц. Текст каждой страницы 2–4 коротких предложения, с понятным развитием сюжета и завершением. Не добавляй страшные сцены, жестокость или опасные инструкции. Верни только корректный JSON такой структуры: {"title":"...","description":"...","heroDescription":"Подробное стабильное описание внешности героя на английском для повторяющихся иллюстраций","visualStyle":"Warm watercolor children's storybook illustration, soft paper texture, gentle colors","pages":[{"pageNumber":1,"pageTitle":"...","text":"...","imagePrompt":"Detailed English prompt describing only the scene, with the same character appearance"}]}`;
  const userPrompt = `Идея: ${idea}\nГлавный герой: ${heroName}\nПожелания: ${wishes || "добрая история, дружба и счастливый финал"}`;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], response_format: { type: "json_object" }, temperature: 0.7 })
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Story API error", response.status, detail.slice(0, 800));
    throw new Error("Не удалось создать сюжет. Проверьте OPENAI_API_KEY и доступный баланс API.");
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Сервис текста вернул пустой ответ.");
  const book = JSON.parse(content);
  if (!Array.isArray(book.pages)) throw new Error("Сервис текста вернул книгу в неожиданном формате.");
  book.pages = book.pages.slice(0, pagesCount).map((p, i) => ({ pageNumber: i + 1, pageTitle: cleanText(p.pageTitle || `Страница ${i + 1}`, 160), text: cleanText(p.text || "", 2000), imagePrompt: cleanText(p.imagePrompt || `${book.visualStyle || "Watercolor children's book illustration"}, scene ${i + 1}`, 3000) }));
  while (book.pages.length < pagesCount) {
    const i = book.pages.length + 1;
    book.pages.push({ pageNumber: i, pageTitle: `Страница ${i}`, text: "История продолжается, и герой делает ещё один шаг к своей цели.", imagePrompt: `Watercolor children's book illustration, same character as described: ${book.heroDescription || heroName}, scene ${i} about ${idea}` });
  }
  book.visualStyle = book.visualStyle || "Warm watercolor children's storybook illustration, soft paper texture, gentle colors";
  book.heroDescription = book.heroDescription || heroName;
  book.id = crypto.randomUUID();
  book.createdAt = new Date().toISOString();
  return book;
}

function getDemoStory({ idea, heroName, genre, pagesCount }) {
  const hero = heroName || "наш герой";
  return {
    id: crypto.randomUUID(),
    title: `Удивительное приключение: ${idea.slice(0, 35)}`,
    description: `Добрая история в жанре «${genre}» о дружбе, смелости и открытиях.`,
    heroDescription: `Friendly child-book character named ${hero}, expressive eyes, consistent appearance, watercolor storybook style`,
    visualStyle: "Warm watercolor children's storybook illustration, soft paper texture, gentle pastel colors",
    createdAt: new Date().toISOString(),
    pages: Array.from({ length: pagesCount }, (_, i) => ({
      pageNumber: i + 1,
      pageTitle: i === 0 ? "Необычное начало" : i === pagesCount - 1 ? "Счастливый финал" : `Глава ${i + 1}: Новое открытие`,
      text: i === 0 ? `Однажды ${hero} отправился навстречу удивительному приключению. Всё началось с идеи: ${idea}.` : i === pagesCount - 1 ? `${hero} понял, что самое важное — доброта, смелость и друзья рядом. Так закончилось это приключение, но впереди ждали новые истории!` : `${hero} встретил новых друзей и обнаружил, что даже сложные задачи можно решить вместе. Шаг за шагом герой приближался к своей мечте.`,
      imagePrompt: `Scene ${i + 1} in a gentle watercolor children's storybook about ${idea}. Same character: ${hero}. Soft paper texture, warm gentle colors, friendly expressions, no text.`
    }))
  };
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 1_000_000) throw new Error("Запрос слишком большой.");
  try { return await request.json(); } catch { throw new Error("Некорректный JSON в запросе."); }
}
function cleanText(value, max) {
  return String(value ?? "").replace(/<[^>]*>/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
