import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

// Firebase config
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

// --- SQLite champions DB (sql.js global) ---
let championsDB = null;

async function loadChampionDB() {
    try {
        const SQL = await window.initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });
        const res = await fetch("/tools/champions-index/champions.db");
        const buf = await res.arrayBuffer();
        championsDB = new SQL.Database(new Uint8Array(buf));
        console.log("Champions DB loaded");
    } catch (e) {
        console.error("Erreur chargement champions.db", e);
    }
}
loadChampionDB();

function searchChampions(query) {
    if (!championsDB || !query) return [];
    try {
        const stmt = championsDB.prepare(
            "SELECT name, rarity, image FROM champions WHERE name LIKE '%' || ? || '%' ORDER BY name LIMIT 20;"
        );
        const results = [];
        stmt.bind([query]);
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    } catch (e) {
        console.error("Erreur searchChampions", e);
        return [];
    }
}

function getChampionByNameExact(name) {
    if (!championsDB || !name) return null;
    try {
        const stmt = championsDB.prepare(
            "SELECT name, rarity, image FROM champions WHERE name = ? LIMIT 1;"
        );
        stmt.bind([name]);
        let found = null;
        if (stmt.step()) {
            found = stmt.getAsObject();
        }
        stmt.free();
        return found;
    } catch (e) {
        console.error("Erreur getChampionByNameExact", e);
        return null;
    }
}

// --- Siege planner state ---
let currentRoomId = null;
let currentPostId = null;
const postIds = ["post1", "post2"];
const postDataCache = {}; // postId -> data

function updateRoomLabel(roomId) {
    const el = document.getElementById("currentRoomLabel");
    if (!el) return;
    el.textContent = roomId ? "Salle actuelle : " + roomId : "Aucune salle";
}

function setStatus(msg, isError = false) {
    const el = document.getElementById("statusMsg");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isError ? "#ff9494" : "#a0ffa0";
}

function randomRoomId() {
    return "room-" + Math.random().toString(36).substring(2, 8);
}

function connectRoom(roomId) {
    currentRoomId = roomId;
    updateRoomLabel(roomId);
    setStatus("Connecté à la salle " + roomId);

    postIds.forEach(id => {
        const r = ref(db, "siege/" + roomId + "/" + id);
        onValue(r, snap => {
            const data = snap.val() || {};
            postDataCache[id] = data;
            if (currentPostId === id) {
                fillModalFromData(data);
            }
        });
    });

    const url = new URL(window.location.href);
    url.searchParams.set("room", roomId);
    window.history.replaceState({}, "", url.toString());
}

// --- UI helpers ---

function clearChampVisual(imgEl, rarityEl) {
    if (imgEl) {
        imgEl.src = "";
        imgEl.style.display = "none";
    }
    if (rarityEl) {
        rarityEl.src = "";
        rarityEl.style.display = "none";
    }
}

function updateVisualForInput(inputEl, champImgEl, rarityImgEl) {
    const name = inputEl.value.trim();
    if (!championsDB || !name) {
        clearChampVisual(champImgEl, rarityImgEl);
        return;
    }
    const champ = getChampionByNameExact(name);
    if (!champ || !champ.image) {
        clearChampVisual(champImgEl, rarityImgEl);
        return;
    }
    rarityImgEl.src = `/tools/champions-index/img/rarity/${champ.rarity}.webp`;
    rarityImgEl.style.display = "block";
    champImgEl.src = `/tools/champions-index/img/champions/${champ.image}.webp`;
    champImgEl.style.display = "block";
}

function createTeamRow(teamData = {}, index = 0) {
    const teamsContainer = document.getElementById("teamsContainer");
    const teamRow = document.createElement("div");
    teamRow.className = "team-row";

    // member slot
    const memberSlot = document.createElement("div");
    memberSlot.className = "member-slot";
    const mLabel = document.createElement("label");
    mLabel.textContent = "Membre";
    const mInput = document.createElement("input");
    mInput.className = "member-input";
    mInput.value = teamData.member || "";
    memberSlot.appendChild(mLabel);
    memberSlot.appendChild(mInput);
    teamRow.appendChild(memberSlot);

    // right champs row
    const rightRow = document.createElement("div");
    rightRow.className = "modal-right-row";

    for (let i = 1; i <= 4; i++) {
        const champSlot = document.createElement("div");
        champSlot.className = "champ-slot";

        const cLabel = document.createElement("label");
        cLabel.textContent = "Champion " + i;
        const cInput = document.createElement("input");
        cInput.className = "champ-input";
        cInput.value = teamData["c" + i] || "";

        const visual = document.createElement("div");
        visual.className = "champ-visual";
        const rarityImg = document.createElement("img");
        rarityImg.className = "rarity-img";
        const champImg = document.createElement("img");
        champImg.className = "champ-img";
        visual.appendChild(champImg);
        visual.appendChild(rarityImg);

        const sugWrapper = document.createElement("div");
        sugWrapper.className = "suggestions";
        const sugList = document.createElement("div");
        sugList.className = "suggestions-list";
        sugWrapper.appendChild(sugList);

        const inputWrapper = document.createElement("div");
        inputWrapper.className = "champ-input-wrapper";
        inputWrapper.style.position = "relative";
        inputWrapper.style.width = "140px";

        inputWrapper.appendChild(cInput);
        inputWrapper.appendChild(sugWrapper);

        // nouveau layout
        champSlot.appendChild(cLabel);
        champSlot.appendChild(inputWrapper);
        champSlot.appendChild(visual);


        // suggestions logic
        cInput.addEventListener("input", () => {
            const q = cInput.value.trim();
            sugList.innerHTML = "";
            if (!q || !championsDB) return;
            const results = searchChampions(q);
            results.forEach(ch => {
                const div = document.createElement("div");
                div.textContent = ch.name;
                div.addEventListener("click", () => {
                    cInput.value = ch.name;
                    sugList.innerHTML = "";
                    updateVisualForInput(cInput, champImg, rarityImg);
                });
                sugList.appendChild(div);
            });
        });

        cInput.addEventListener("blur", () => {
            setTimeout(() => { sugList.innerHTML = ""; }, 200);
        });

        // initial visual if data present
        if (championsDB && cInput.value.trim()) {
            updateVisualForInput(cInput, champImg, rarityImg);
        }

        rightRow.appendChild(champSlot);
    }

    teamRow.appendChild(rightRow);
    if (index > 0) {
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "🗑 Supprimer";
        deleteBtn.className = "ghost-btn small delete-team-btn";

        deleteBtn.addEventListener("click", () => {
            teamRow.remove();
        });

        teamRow.appendChild(deleteBtn);
    }
    teamsContainer.appendChild(teamRow);
}

function getTeamsFromModal() {
    const teams = [];
    const teamsContainer = document.getElementById("teamsContainer");
    teamsContainer.querySelectorAll(".team-row").forEach(row => {
        const memberInput = row.querySelector(".member-input");
        const champInputs = row.querySelectorAll(".champ-input");
        const team = {
            member: memberInput ? memberInput.value.trim() : "",
            c1: champInputs[0] ? champInputs[0].value.trim() : "",
            c2: champInputs[1] ? champInputs[1].value.trim() : "",
            c3: champInputs[2] ? champInputs[2].value.trim() : "",
            c4: champInputs[3] ? champInputs[3].value.trim() : ""
        };
        if (team.member || team.c1 || team.c2 || team.c3 || team.c4) {
            teams.push(team);
        }
    });
    return teams;
}

function fillModalFromData(data) {
    const cond1 = document.getElementById("cond1");
    const cond2 = document.getElementById("cond2");
    const cond3 = document.getElementById("cond3");
    cond1.value = data.cond1 || "";
    cond2.value = data.cond2 || "";
    cond3.value = data.cond3 || "";

    const teamsContainer = document.getElementById("teamsContainer");
    teamsContainer.innerHTML = "";

    const teams = Array.isArray(data.teams) && data.teams.length ? data.teams : [{}];
    teams.forEach((team, i) => createTeamRow(team, i));
}

function openModal(postId) {
    currentPostId = postId;
    document.getElementById("modalOverlay").style.display = "flex";
    document.getElementById("modalTitle").textContent = "Poste " + postId.replace("post", "#");
    const data = postDataCache[postId] || {};
    fillModalFromData(data);
    setStatus("");
}

function closeModal() {
    document.getElementById("modalOverlay").style.display = "none";
}

function saveCurrentPost() {
    if (!currentRoomId) {
        setStatus("Rejoins ou crée une salle d'abord.", true);
        alert("Rejoins ou crée une salle d'abord.");
        return;
    }
    if (!currentPostId) {
        setStatus("Choisis un poste sur la map.", true);
        alert("Choisis un poste sur la map.");
        return;
    }

    const cond1 = document.getElementById("cond1").value;
    const cond2 = document.getElementById("cond2").value;
    const cond3 = document.getElementById("cond3").value;
    const teams = getTeamsFromModal();

    const data = {
        cond1,
        cond2,
        cond3,
        teams
    };

    const r = ref(db, "siege/" + currentRoomId + "/" + currentPostId);
    set(r, data)
        .then(() => {
            setStatus("Teams sauvegardées ✔");
        })
        .catch(err => {
            console.error(err);
            setStatus("Erreur de sauvegarde : " + err.message, true);
        });
}

// --- init ---
window.addEventListener("DOMContentLoaded", () => {
    const joinBtn = document.getElementById("joinRoomBtn");
    const createBtn = document.getElementById("createRoomBtn");
    const copyBtn = document.getElementById("copyLinkBtn");
    const roomInput = document.getElementById("roomInput");
    const saveBtn = document.getElementById("saveBtn");
    const closeModalBtn = document.getElementById("closeModal");
    const addTeamBtn = document.getElementById("addTeamBtn");

    postIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("click", () => {
            if (!currentRoomId) {
                alert("Rejoins ou crée une salle d'abord.");
                return;
            }
            openModal(id);
        });
    });

    joinBtn.addEventListener("click", () => {
        const room = roomInput.value.trim();
        if (!room) {
            alert("Entre un code de salle.");
            return;
        }
        connectRoom(room);
    });

    createBtn.addEventListener("click", () => {
        const id = randomRoomId();
        roomInput.value = id;
        connectRoom(id);
    });

    copyBtn.addEventListener("click", () => {
        if (!currentRoomId) {
            alert("Aucune salle active.");
            return;
        }
        const url = new URL(window.location.href);
        url.searchParams.set("room", currentRoomId);
        navigator.clipboard.writeText(url.toString())
            .then(() => setStatus("Lien copié ✔"))
            .catch(() => setStatus("Impossible de copier le lien.", true));
    });

    saveBtn.addEventListener("click", () => {
        saveCurrentPost();
    });

    closeModalBtn.addEventListener("click", () => {
        closeModal();
    });

    addTeamBtn.addEventListener("click", () => {
        const teamsContainer = document.getElementById("teamsContainer");
        const index = teamsContainer.children.length; // nouvelle team index
        createTeamRow({}, index);
    });

    // Auto room via ?room=
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get("room");
    if (roomFromUrl) {
        roomInput.value = roomFromUrl;
        connectRoom(roomFromUrl);
    } else {
        updateRoomLabel(null);
    }
});
