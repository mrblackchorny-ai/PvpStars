const API_URL = "https://DoggyJoggy.pythonanywhere.com";
const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

// --- ДАННЫЕ ---
const user = tg.initDataUnsafe?.user;
if (user) {
    document.getElementById('username').innerText = user.first_name;
    document.getElementById('user_id').innerText = user.id;
}

const params = new URLSearchParams(window.location.search);
let currentBalance = parseInt(params.get('bal')) || 0;
let isMyTurn = false;
let flippedCards = [];
const emojis = ['🍎', '🍋', '💎', '⭐', '🍀', '🔥', '👻', '🐱'];

// --- API ---
async function apiCall(endpoint, paramsObj) {
    const query = new URLSearchParams(paramsObj).toString();
    try {
        const response = await fetch(`${API_URL}/${endpoint}?${query}`);
        return await response.json();
    } catch (e) {
        console.error("API Error:", e);
        return null;
    }
}

// --- ТАЙМЕР (ЕДИНЫЙ) ---
function runUniversalTimer(seconds, callback) {
    let timeLeft = seconds;
    const bar = document.getElementById('timer-bar');
    if (bar) bar.style.width = "100%";

    const interval = setInterval(() => {
        timeLeft -= 0.1;
        if (bar) bar.style.width = (timeLeft / seconds) * 100 + "%";

        if (timeLeft <= 0) {
            clearInterval(interval);
            callback();
        }
    }, 100);
}

// --- ЛОГИКА ИГРЫ ---
function startMemoryGame() {
    // Скрываем лишнее, показываем поле
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    document.querySelector('.bottom-nav').style.display = 'none';
    
    const grid = document.getElementById('memory-grid');
    const status = document.getElementById('game-status');
    const insLayer = document.getElementById('instruction-layer');
    
    grid.innerHTML = '';
    let gameCards = [...emojis, ...emojis].sort(() => Math.random() - 0.5);

    gameCards.forEach((emoji) => {
        const card = document.createElement('div');
        card.className = 'card flipped'; // Сначала открыты
        card.innerHTML = `
            <div class="card-front">${emoji}</div>
            <div class="card-back"></div>
        `;
        card.onclick = () => {
            if (!isMyTurn || card.classList.contains('matched') || card.classList.contains('flipped')) return;

            card.classList.add('flipped');
            flippedCards.push(card);
            
            const cardIndex = Array.from(grid.children).indexOf(card);
            apiCall('api', {
                action: 'make_move',
                room_id: params.get('room_id'),
                user_id: user.id,
                index: cardIndex
            }).then(res => {
                if (res?.result === 'mismatch') {
                    isMyTurn = false;
                    setTimeout(() => {
                        flippedCards.forEach(c => c.classList.remove('flipped'));
                        flippedCards = [];
                    }, 800);
                } else if (res?.result === 'match') {
                    flippedCards.forEach(c => c.classList.add('matched'));
                    flippedCards = [];
                }
            });
        };
        grid.appendChild(card);
    });

    // ЦИКЛ ФАЗ
    // 1. Инструкция
    status.innerText = "ПРАВИЛА ИГРЫ 🧠";
    if (insLayer) insLayer.style.display = 'block';

    runUniversalTimer(5, () => {
        // 2. Фаза запоминания
        if (insLayer) insLayer.style.display = 'none';
        status.innerText = "ЗАПОМИНАЙ КАРТЫ! 👀";
        
        runUniversalTimer(7, () => {
            // 3. Начало боя
            status.innerText = "БОЙ НАЧАЛСЯ!";
            document.querySelectorAll('.card').forEach(c => c.classList.remove('flipped'));
            syncGameState(); // Запускаем синхронизацию
        });
    });
}

async function syncGameState() {
    if (params.get('mode') !== 'battle') return;
    const data = await apiCall('api', { action: 'get_state', room_id: params.get('room_id') });
    if (!data) return;

    isMyTurn = (data.current_turn == user.id);
    updateTurnUI(data);

    // Синхронизация открытых карт
    const cards = document.querySelectorAll('.card');
    data.opened_cards?.forEach(idx => {
        if (cards[idx]) cards[idx].classList.add('flipped', 'matched');
    });

    // Счет
    document.getElementById('my-score').innerText = data.scores[user.id] || 0;
    const enemyId = Object.keys(data.scores).find(id => id != user.id);
    if (enemyId) document.getElementById('enemy-score').innerText = data.scores[enemyId] || 0;
}

function updateTurnUI(data) {
    const turnText = document.getElementById('turn-text');
    if (!turnText) return;
    
    if (data.current_turn == user.id) {
        turnText.innerText = "ВАШ ХОД! ⚡";
        turnText.style.color = "#3498db";
    } else {
        turnText.innerText = `ХОДИТ: ${data.current_turn_name || 'Враг'}`;
        turnText.style.color = "#e74c3c";
    }
}

// Запуск при загрузке
if (params.get('mode') === 'battle') {
    startMemoryGame();
    setInterval(syncGameState, 2000);
}

// Навигация и создание комнат (твои функции без изменений)
function joinRoom(roomId) {
    tg.sendData(JSON.stringify({ action: "join_room", room_id: roomId }));
    tg.close();
}
function createRoom(bet) {
    if (currentBalance < bet) return tg.showAlert("Недостаточно звёзд!");
    tg.sendData(JSON.stringify({ action: "create_room", bet: parseInt(bet) }));
    tg.close();
}
