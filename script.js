const API_URL = "https://DoggyJoggy.pythonanywhere.com/rooms";
const tg = window.Telegram.WebApp;
tg.ready(); tg.expand();

const params = new URLSearchParams(window.location.search);
let currentBalance = parseInt(params.get('bal')) || 0;
let activeRooms = {};

async function updateRooms() {
    try {
        const r = await fetch(`${API_URL}?t=${Date.now()}`);
        activeRooms = await r.json();
        render();
    } catch(e) {}
}
setInterval(updateRooms, 5000); updateRooms();

function createRoom(bet) {
    if (currentBalance < bet) return tg.showAlert("Мало звезд!");
    tg.sendData(JSON.stringify({action: "create_room", bet: bet}));
    tg.close();
}

function joinRoom(id) {
    tg.sendData(JSON.stringify({action: "join_room", room_id: id}));
    tg.close();
}

function render() {
    const cont = document.getElementById('rooms-container');
    if (!cont) return;
    cont.innerHTML = "";
    Object.keys(activeRooms).forEach(id => {
        const r = activeRooms[id];
        if (r.status === "waiting") {
            const div = document.createElement('div');
            div.className = "game-card-main";
            div.innerHTML = `<b>Ставка: ${r.bet}</b><br><button onclick="joinRoom('${id}')">ВХОД</button>`;
            cont.appendChild(div);
        }
    });
}
