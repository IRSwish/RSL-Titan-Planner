import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBiHB2MMmdv9lpYC_TIOB9Sn8xO_Xd09iU",
  authDomain: "siegeprojectrsl.firebaseapp.com",
  databaseURL: "https://siegeprojectrsl-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "siegeprojectrsl",
  storageBucket: "siegeprojectrsl.firebasestorage.app",
  messagingSenderId: "475982575288",
  appId: "1:475982575288:web:43249fa990ff6a0e4fa64d"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let currentRoomId = null;
let currentPostId = null;
const postIds = ["post1", "post2"];
const postDataCache = {};

function updateRoomLabel(roomId) {
    document.getElementById("currentRoomLabel").textContent =
        roomId ? "Salle actuelle : " + roomId : "Aucune salle";
}

function openModal(postId) {
    currentPostId = postId;
    document.getElementById("modalOverlay").style.display = "flex";
    document.getElementById("modalTitle").textContent = "Poste " + postId.replace("post","#");

    const data = postDataCache[postId] || {};
    c1.value = data.c1 || "";
    c2.value = data.c2 || "";
    c3.value = data.c3 || "";
    c4.value = data.c4 || "";
    cond1.value = data.cond1 || "";
    cond2.value = data.cond2 || "";
    cond3.value = data.cond3 || "";
}

function connectRoom(roomId) {
    currentRoomId = roomId;
    updateRoomLabel(roomId);

    postIds.forEach(id => {
        const r = ref(db, "siege/" + roomId + "/" + id);
        onValue(r, snap => {
            postDataCache[id] = snap.val() || {};
            if (currentPostId === id) openModal(id);
        });
    });
}

document.getElementById("joinRoomBtn").onclick = () => {
    const room = roomInput.value.trim();
    if (!room) return alert("Entre un code !");
    connectRoom(room);
};

document.getElementById("createRoomBtn").onclick = () => {
    const id = "room-" + Math.random().toString(36).substring(2,8);
    roomInput.value = id;
    connectRoom(id);
};

document.getElementById("copyLinkBtn").onclick = () => {
    if (!currentRoomId) return;
    const url = window.location.origin + window.location.pathname + "?room=" + currentRoomId;
    navigator.clipboard.writeText(url);
    alert("Lien copié !");
};

document.getElementById("closeModal").onclick = () => {
    document.getElementById("modalOverlay").style.display = "none";
};

document.getElementById("saveBtn").onclick = () => {
    if (!currentRoomId || !currentPostId) return;
    const r = ref(db, "siege/" + currentRoomId + "/" + currentPostId);
    set(r, {
        c1:c1.value, c2:c2.value, c3:c3.value, c4:c4.value,
        cond1:cond1.value, cond2:cond2.value, cond3:cond3.value
    });
    alert("Sauvegardé !");
};

postIds.forEach(id => {
    document.getElementById(id).onclick = () => {
        if (!currentRoomId) return alert("Rejoins une salle !");
        openModal(id);
    };
});

// auto room via ?room=
const params = new URLSearchParams(window.location.search);
if (params.get("room")) {
    roomInput.value = params.get("room");
    connectRoom(params.get("room"));
}
