let currentBook = null;
let currentPageIndex = 0;
let isDemoMode = false;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        isDemoMode = data.demoMode;
        if (isDemoMode) {
            document.getElementById('demoBadge').classList.remove('hidden');
        }
    } catch (e) {
        isDemoMode = true;
        document.getElementById('demoBadge').classList.remove('hidden');
    }

    document.getElementById('fillExampleBtn').addEventListener('click', () => {
        document.getElementById('ideaInput').value = "Маленький пушистый дракоша учится летать над облаками и находить друзей среди звёзд.";
        document.getElementById('heroInput').value = "Дракоша Оникс";
        document.getElementById('wishesInput').value = "дружба, юмор, добрый финал";
        document.getElementById('genreSelect').value = "сказка";
        document.getElementById('ageSelect').value = "7-9";
        document.getElementById('pagesSelect').value = "4";
    });

    document.getElementById('bookForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const idea = document.getElementById('ideaInput').value.trim();
        const heroName = document.getElementById('heroInput').value.trim();
        const wishes = document.getElementById('wishesInput').value.trim();
        const genre = document.getElementById('genreSelect').value;
        const ageGroup = document.getElementById('ageSelect').value;
        const pagesCount = document.getElementById('pagesSelect').value;

        if (!idea) return;

        showLoading(true, "Придумываем сюжет и героев...", 30);

        try {
            let bookData;
            if (isDemoMode) {
                await new Promise(r => setTimeout(r, 1500));
                bookData = getClientDemoStory(genre, idea, heroName, pagesCount);
            } else {
                const res = await fetch('/api/story', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idea, heroName, wishes, genre, ageGroup, pagesCount })
                });
                if (!res.ok) throw new Error('Ошибка генерации сюжета');
                bookData = await res.json();
            }

            currentBook = bookData;
            currentPageIndex = 0;
            await saveBookToServer(currentBook);

            showLoading(true, "Генерируем волшебные иллюстрации...", 70);
            await new Promise(r => setTimeout(r, 1000));

            showLoading(false);
            openReader();
        } catch (err) {
            alert(err.message || "Произошла ошибка при создании книги.");
            showLoading(false);
        }
    });
});

async function saveBookToServer(bookData) {
    try {
        const res = await fetch('/api/books', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookData)
        });
        const data = await res.json();
        if (data.bookId) {
            currentBook.id = data.bookId;
        }
    } catch (e) {
        console.error('Не удалось сохранить книгу на бэкенд:', e);
    }
}

async function openLibraryModal() {
    const modal = document.getElementById('libraryModal');
    const listContainer = document.getElementById('libraryList');
    modal.classList.remove('hidden');
    listContainer.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">Загрузка...</p>`;

    try {
        const res = await fetch('/api/books');
        const books = await res.json();

        if (!books || books.length === 0) {
            listContainer.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">У вас пока нет сохранённых книг. Создайте первую!</p>`;
            return;
        }

        listContainer.innerHTML = books.map(book => `
            <div onclick="loadBook('${book.id}')" class="p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 cursor-pointer transition flex items-center justify-between group">
                <div>
                    <h4 class="font-extrabold text-slate-900 group-hover:text-indigo-600 transition text-sm mb-1">${escapeHtml(book.title)}</h4>
                    <p class="text-xs text-slate-500 line-clamp-1">${escapeHtml(book.description || '')}</p>
                </div>
                <span class="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl">Читать →</span>
            </div>
        `).join('');
    } catch (e) {
        listContainer.innerHTML = `<p class="text-sm text-red-500 text-center py-8">Не удалось загрузить список книг.</p>`;
    }
}

function closeLibraryModal() {
    document.getElementById('libraryModal').classList.add('hidden');
}

async function loadBook(bookId) {
    try {
        showLoading(true, "Загружаем вашу книгу из базы данных...", 50);
        const res = await fetch(`/api/books/${bookId}`);
        if (!res.ok) throw new Error('Книга не найдена');
        
        currentBook = await res.json();
        currentPageIndex = 0;
        closeLibraryModal();
        showLoading(false);
        openReader();
    } catch (e) {
        alert("Не удалось загрузить книгу.");
        showLoading(false);
    }
}

function showLoading(show, title = "", progress = 0) {
    const creatorView = document.getElementById('creatorView');
    const loadingView = document.getElementById('loadingView');
    const readerView = document.getElementById('readerView');
    const progressBar = document.getElementById('progressBar');
    const loadingTitle = document.getElementById('loadingTitle');

    creatorView.classList.add('hidden');
    readerView.classList.add('hidden');

    if (show) {
        loadingView.classList.remove('hidden');
        loadingTitle.textContent = title;
        progressBar.style.width = `${progress}%`;
    } else {
        loadingView.classList.add('hidden');
    }
}

function openReader() {
    const readerView = document.getElementById('readerView');
    readerView.classList.remove('hidden');
    readerView.classList.add('fade-in');
    
    document.getElementById('bookTitleDisplay').textContent = currentBook.title;
    document.getElementById('bookDescDisplay').textContent = currentBook.description;

    renderPage();
}

async function renderPage() {
    const page = currentBook.pages[currentPageIndex];
    document.getElementById('pageTitle').textContent = page.pageTitle;
    document.getElementById('pageText').textContent = page.text;
    document.getElementById('pageCategory').textContent = `Глава ${currentPageIndex + 1}`;
    document.getElementById('pageCounter').textContent = `${currentPageIndex + 1} из ${currentBook.pages.length}`;

    document.getElementById('prevBtn').disabled = currentPageIndex === 0;
    const nextBtn = document.getElementById('nextBtn');
    if (currentPageIndex === currentBook.pages.length - 1) {
        nextBtn.innerHTML = `<span>Готово!</span>`;
    } else {
        nextBtn.innerHTML = `<span>Вперёд</span><span>→</span>`;
    }

    const imgElement = document.getElementById('pageImage');
    const imageLoader = document.getElementById('imageLoader');

    if (page.imageUrl) {
        imgElement.src = page.imageUrl;
        imageLoader.classList.add('hidden');
    } else {
        imageLoader.classList.remove('hidden');
        imgElement.src = '';

        try {
            let imageUrl;
            if (isDemoMode) {
                await new Promise(r => setTimeout(r, 800));
                const demoImages = [
                    "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80",
                    "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80",
                    "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=800&q=80",
                    "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=800&q=80"
                ];
                imageUrl = demoImages[currentPageIndex % demoImages.length];
            } else {
                const res = await fetch('/api/image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: page.imagePrompt,
                        style: currentBook.visualStyle,
                        heroDescription: currentBook.heroDescription
                    })
                });
                const data = await res.json();
                imageUrl = data.imageUrl;
            }

            page.imageUrl = imageUrl;
            imgElement.src = imageUrl;
        } catch (e) {
            console.error('Ошибка загрузки картинки', e);
            imgElement.src = 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80';
        } finally {
            imageLoader.classList.add('hidden');
        }
    }
}

function changePage(direction) {
    const newIndex = currentPageIndex + direction;
    if (newIndex >= 0 && newIndex < currentBook.pages.length) {
        currentPageIndex = newIndex;
        renderPage();
    } else if (newIndex >= currentBook.pages.length) {
        alert("Поздравляем! Вы дочитали книгу до конца. Можете сохранить её в PDF или создать новую.");
    }
}

function downloadPDF() {
    window.print();
}

function getClientDemoStory(genre, idea, heroName, pagesCount) {
    const count = parseInt(pagesCount, 10) || 4;
    const pages = [];
    for (let i = 1; i <= count; i++) {
        pages.push({
            pageNumber: i,
            pageTitle: `Глава ${i}: Увлекательный поворот`,
            text: `Это страница №${i} захватывающей истории на тему «${idea}». Главный герой ${heroName || 'наш друг'} продолжает своё путешествие, открывая новые тайны и преодолевая преграды с улыбкой и отвагой.`,
            imagePrompt: `Scene ${i} for children book about ${idea}, cute character, bright colors`
        });
    }
    return {
        title: `Книга: ${idea.slice(0, 35)}...`,
        description: `Удивительное произведение в жанре ${genre} для детей.`,
        heroDescription: `Cute main character named ${heroName || 'Hero'}, 3D Pixar style`,
        visualStyle: "Bright friendly 3D cartoon style",
        pages: pages
    };
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
