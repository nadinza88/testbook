export async function generateIllustration({ prompt, style, heroDescription, isDemo }) {
  if (isDemo) {
    const placeholders = [
      "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=800&q=80"
    ];
    return placeholders[Math.floor(Math.random() * placeholders.length)];
  }

  const apiKey = process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  const provider = process.env.IMAGE_PROVIDER || 'openai';

  if (provider === 'openai') {
    const fullPrompt = `${style}. Character details: ${heroDescription}. Scene: ${prompt}. Safe for children, high resolution, beautiful lighting, no text or watermarks.`;
    
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: fullPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard'
      })
    });

    if (!response.ok) {
      throw new Error('Ошибка генерации изображения DALL-E 3');
    }

    const data = await response.json();
    return data.data[0].url;
  }

  throw new Error(`Неизвестный провайдер изображений: ${provider}`);
}
