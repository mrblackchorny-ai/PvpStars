const API_URL = "https://DoggyJoggy.pythonanywhere.com/rooms";
const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

const user = tg.initDataUnsafe?.user;
const params = new URLSearchParams(window.location.search);
let currentBalance = parseInt(params.get('bal')) || 0;
let activeRooms = {};

async function updateRoomsData() {
    try {
        const response = await fetch(`${API_URL}?t=${Date.now()}`);
        activeRooms = await response.json();
        renderRooms(); 
    } catch (e) { console.error(e); }
}
setInterval(updateRoomsData, 5000);
updateRoomsData();

function createRoom(bet) {
    if (currentBalance < bet) return tg.showAlert("Недостаточно звёзд!");
    tg.showConfirm(`Создать комнату на ${bet} ⭐?`, (ok) => {
        if (ok) {
            tg.sendData(JSON.stringify({ action: "create_room", bet: bet }));
            tg.close();
        }
    });
}

function joinRoom(roomId) {
    const room = activeRooms[roomId];
    if (!room || currentBalance < room.bet) return tg.showAlert("Ошибка!");
    tg.showConfirm(`Играем против ${room.creator_name}?`, (ok) => {
        if (ok) {
            tg.sendData(JSON.stringify({ action: "join_room", room_id: roomId }));
            tg.close();
        }
    });
}

function renderRooms() {
    const container = document.getElementById('rooms-container');
    if (!container) return;
    container.innerHTML = "";
    Object.keys(activeRooms).forEach(id => {
        const room = activeRooms[id];
        if (room.status === "waiting") {
            const card = document.createElement('div');
            card.className = 'game-card-main';
            card.innerHTML = `<div><b>Ставка: ${room.bet} ⭐</b><br><small>${room.creator_name}</small></div>
                              <button class="btn-play" onclick="joinRoom('${id}')">ВХОД</button>`;
            container.appendChild(card);
        }
    });
}

function endGame(win) {
    const bet = params.get('bet') || 0;
    tg.showPopup({ title: win ? "ПОБЕДА!" : "ЛОСС", message: "Результат отправлен боту" }, () => {
        tg.sendData(JSON.stringify({ action: "game_result", status: win ? "win" : "lose", bet: bet }));
        tg.close();
    });
}

// ... (остальной код Memory Duel без изменений)
