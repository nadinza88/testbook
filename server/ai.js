export async function generateStory({ idea, heroName, wishes, genre, ageGroup, pagesCount, isDemo }) {
  if (isDemo) {
    return getDemoStory(genre, idea, heroName, pagesCount);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY не настроен на сервере.');
  }

  const systemPrompt = `Ты — профессиональный детский писатель и сценарист интерактивных книг для детей. 
Создай структурированную детскую книгу в формате JSON.
Возраст читателя: ${ageGroup} лет. Жанр: ${genre}.
Книга должна состоять ровно из ${pagesCount} страниц.
Строго соблюдай структуру JSON:
{
  "title": "Название книги",
  "description": "Краткое аннотация (до 2 предложений)",
  "heroDescription": "Подробное описание внешности главного героя для сохранения единого стиля",
  "visualStyle": "Единый художественный стиль иллюстраций",
  "pages": [
    {
      "pageNumber": 1,
      "pageTitle": "Заголовок страницы",
      "text": "Текст страницы (3-5 предложений).",
      "imagePrompt": "Detailed English visual prompt for AI image generator"
    }
  ]
}`;

  const userPrompt = `Идея: ${idea}. Главный герой: ${heroName}. Пожелания: ${wishes}.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`Ошибка OpenAI API: ${response.statusText}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

function getDemoStory(genre, idea, heroName, pagesCount) {
  const count = parseInt(pagesCount, 10) || 4;
  const pages = [];
  for (let i = 1; i <= count; i++) {
    pages.push({
      pageNumber: i,
      pageTitle: `Глава ${i}: Увлекательный поворот`,
      text: `Это страница №${i} захватывающей истории на тему «${idea}». Главный герой ${heroName || 'наш друг'} продолжает своё путешествие, открывая новые тайны и преодолевая преграды с улыбкой и отвагой.`,
      imagePrompt: `Scene ${i} for children book about ${idea}, cute character, bright colors, Pixar 3D style`
    });
  }
  return {
    title: `Удивительное приключение: ${idea.slice(0, 30)}...`,
    description: "Добрая и захватывающая история о смелости, дружбе и невероятных открытиях.",
    heroDescription: `Friendly cheerful character named ${heroName}, big expressive eyes, cute 3D cartoon style`,
    visualStyle: "Modern 3D Pixar style children book illustration, warm lighting, pastel colors, highly detailed",
    pages: pages
  };
}
