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
let summarySortMode = "member"; // default
let clanMembers = {};

let siegeDB = null;

async function loadSiegeDB() {
    try {
        const SQL = await window.initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });
        const res = await fetch("/siege/siege.db");
        const buf = await res.arrayBuffer();
        siegeDB = new SQL.Database(new Uint8Array(buf));
        console.log("Siege DB loaded");
    } catch (e) {
        console.error("Erreur chargement siege.db", e);
    }
}
loadSiegeDB();

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

function getConditionsByType() {
    if (!siegeDB) return { orderedTypes: [], byType: {} };

    try {
        const stmt = siegeDB.prepare(
            "SELECT rowid, id, type, name, image, description FROM conditions ORDER BY rowid;"
        );
        const byType = {};
        const orderedTypes = [];

        while (stmt.step()) {
            const row = stmt.getAsObject();
            const t = row.type;

            if (!byType[t]) {
                byType[t] = [];
                orderedTypes.push(t); // ordre = 1er rowid rencontré pour ce type
            }
            byType[t].push({
                rowid: row.rowid,
                id: row.id,
                type: row.type,
                name: row.name,
                image: row.image,
                description: row.description
            });
        }
        stmt.free();
        return { orderedTypes, byType };
    } catch (e) {
        console.error("Erreur getConditionsByType", e);
        return { orderedTypes: [], byType: {} };
    }
}


function searchChampions(query) {
    if (!championsDB || !query) return [];
    try {
        const stmt = championsDB.prepare(
            "SELECT name, rarity, image FROM champions WHERE name LIKE '%' || ? || '%' ORDER BY name LIMIT 20;"
        );

        const raw = [];
        stmt.bind([query]);
        while (stmt.step()) {
            raw.push(stmt.getAsObject());
        }
        stmt.free();

        // 🔥 SUPPRESSION DES DOUBLONS PAR NOM
        const unique = [];
        const seen = new Set();

        for (const ch of raw) {
            if (!seen.has(ch.name)) {
                seen.add(ch.name);
                unique.push(ch);
            }
        }

        return unique;
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
const postIds = [
    "post1", 
    "post2", 
    "post3", 
    "post4", 
    "post5", 
    "post6", 
    "post7", 
    "post8", 
    "post9", 
    "post10", 
    "post11", 
    "post12", 
    "post13", 
    "post14", 
    "post15", 
    "post16", 
    "post17", 
    "post18",
    "manashrine1",
    "manashrine2",
    "magictower1",
    "magictower2",
    "magictower3",
    "magictower4",
    "defensetower1",
    "defensetower2",
    "defensetower3",
    "defensetower4",
    "defensetower5",
    "stronghold",
];
const postDataCache = {}; // postId -> data

let currentPostConditionsList = [];  // les 3 conditions choisies pour le post courant (objets complets)
let postConditionsSlotsWrapper = null; 
let activeConditionSlotIndex = 0;

function updateRoomLabel(roomId) {
    const el = document.getElementById("currentRoomLabel");
    if (!el) return;
    el.textContent = roomId ? "Room : " + roomId : "No Room";
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
    setStatus("Connected to room " + roomId);

    const mref = ref(db, "siege/" + roomId + "/members");
    onValue(mref, snap => {
        clanMembers = snap.val() || {};
        updateMembersList();
    });

    postIds.forEach(id => {
        const r = ref(db, "siege/" + roomId + "/" + id);
        onValue(r, snap => {
            const data = snap.val() || {};
            postDataCache[id] = data;

            if (currentPostId === id) {
                fillModalFromData(data);
            }

            updateSummaryTable();
            updatePostConditionsOnMap(id);  // Mettre à jour les icônes sur la carte
            updateTeamsCountOnMap(id);  // Mettre à jour le compteur d'équipes
            updateTooltipOnMap(id);  // Mettre à jour le tooltip hover
        });
    });
    updateSummaryTable();

    const url = new URL(window.location.href);
    url.searchParams.set("room", roomId);
    window.history.replaceState({}, "", url.toString());
}

function updateMembersList() {
    const list = document.getElementById("membersList");
    list.innerHTML = "";

    Object.values(clanMembers)
        .sort((a, b) => a.pseudo.localeCompare(b.pseudo))
        .forEach(member => {
            const wrapper = document.createElement("div");
            wrapper.className = "member-tag";

            // Pseudo cliquable
            const pseudoEl = document.createElement("span");
            pseudoEl.textContent = member.pseudo;
            pseudoEl.className = "member-pseudo";

            if (member.link) {
                pseudoEl.style.cursor = "pointer";
                pseudoEl.onclick = () => window.open(member.link, "_blank");
            }

            // Delete icon
            const deleteBtn = document.createElement("button");
            deleteBtn.classList.add("delete-member-btn");
            deleteBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" 
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6l-1.5 14H6.5L5 6"></path>
                <path d="M10 11v6"></path>
                <path d="M14 11v6"></path>
                <path d="M9 6V4h6v2"></path>
            </svg>
            `;

            deleteBtn.addEventListener("click", () => {
                deleteClanMember(member.pseudo);
            });

            // Append
            wrapper.appendChild(pseudoEl);

            if (member.link) {
                const linkEl = document.createElement("a");
                linkEl.href = member.link;
                linkEl.target = "_blank";
                linkEl.className = "hh-link-icon";

                linkEl.innerHTML = `<img src="/siege/img/HH.ico" alt="HH" />`;

                wrapper.appendChild(linkEl);
            }

            wrapper.appendChild(deleteBtn);

            list.appendChild(wrapper);

        });
        // mise à jour du compteur de membres
        const membersCount = Object.keys(clanMembers).length;
        const titleEl = document.getElementById("membersTitle");
        if (titleEl) titleEl.textContent = `Clan Members (${membersCount})`;
}

function deleteClanMember(pseudo) {
    delete clanMembers[pseudo];

    const refMembers = ref(db, "siege/" + currentRoomId + "/members");
    set(refMembers, clanMembers);
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

function updateLeadAura(teamRow) {
    const auraDisplay = teamRow.querySelector(".lead-aura-display");
    if (!auraDisplay) return;

    // Trouver le champion 4 (lead)
    const rightRow = teamRow.querySelector(".modal-right-row");
    if (!rightRow) return;

    const leadSlot = Array.from(rightRow.querySelectorAll(".champ-slot")).find(
        slot => parseInt(slot.dataset.champIndex) === 4
    );

    if (!leadSlot) return;

    const leadInput = leadSlot.querySelector(".champ-input");
    const leadName = leadInput ? leadInput.value.trim() : "";

    if (!leadName || !championsDB) {
        auraDisplay.innerHTML = "";
        auraDisplay.style.display = "none";
        return;
    }

    const lead = getChampionByNameExact(leadName);
    if (!lead || !lead.auratext || !lead.aura) {
        auraDisplay.innerHTML = "";
        auraDisplay.style.display = "none";
        return;
    }

    // Afficher l'aura
    auraDisplay.innerHTML = `
        <div class="lead-aura-container">
            <img class="lead-aura-border" src="/tools/champions-index/img/aura/BORDER.webp" alt="">
            <img class="lead-aura-champ" src="/tools/champions-index/img/champions/${lead.auratext}.webp" alt="${leadName}">
            <img class="lead-aura-icon" src="/tools/champions-index/img/aura/${lead.aura}.webp" alt="Aura">
        </div>
    `;
    auraDisplay.style.display = "block";
}

function moveTeamUp(teamRow) {
    const prevRow = teamRow.previousElementSibling;
    if (prevRow && prevRow.classList.contains("team-row")) {
        teamRow.parentNode.insertBefore(teamRow, prevRow);
        updateMoveButtons();
    }
}

function moveTeamDown(teamRow) {
    const nextRow = teamRow.nextElementSibling;
    if (nextRow && nextRow.classList.contains("team-row")) {
        teamRow.parentNode.insertBefore(nextRow, teamRow);
        updateMoveButtons();
    }
}

function updateMoveButtons() {
    const teamsContainer = document.getElementById("teamsContainer");
    const rows = Array.from(teamsContainer.querySelectorAll(".team-row"));

    rows.forEach((row, index) => {
        const upBtn = row.querySelector(".move-up");
        const downBtn = row.querySelector(".move-down");

        if (upBtn) upBtn.disabled = (index === 0);
        if (downBtn) downBtn.disabled = (index === rows.length - 1);
    });
}

function createTeamRow(teamData = {}, index = 0) {
    const teamsContainer = document.getElementById("teamsContainer");
    const teamRow = document.createElement("div");
    teamRow.className = "team-row";

    // --- Boutons monter/descendre ---
    const moveButtons = document.createElement("div");
    moveButtons.className = "move-team-btns";

    const moveUpBtn = document.createElement("button");
    moveUpBtn.className = "move-team-btn move-up";
    moveUpBtn.type = "button";
    moveUpBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>`;
    moveUpBtn.title = "Monter cette team";

    const moveDownBtn = document.createElement("button");
    moveDownBtn.className = "move-team-btn move-down";
    moveDownBtn.type = "button";
    moveDownBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`;
    moveDownBtn.title = "Descendre cette team";

    moveUpBtn.onclick = () => moveTeamUp(teamRow);
    moveDownBtn.onclick = () => moveTeamDown(teamRow);

    moveButtons.appendChild(moveUpBtn);
    moveButtons.appendChild(moveDownBtn);
    teamRow.appendChild(moveButtons);

    // --- bouton clear à droite des champions ---
    const clearBtn = document.createElement("button");
    clearBtn.className = "icon-btn clear-team-btn";
    clearBtn.type = "button";
    clearBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6l-1.5 14H6.5L5 6"></path>
        <path d="M10 11v6"></path>
        <path d="M14 11v6"></path>
        <path d="M9 6V4h6v2"></path>
    </svg>
    `;

    // logique pour vider la team
    clearBtn.onclick = () => {
    const memberSelect = teamRow.querySelector(".member-select");
    if (memberSelect) memberSelect.value = "";

    teamRow.querySelectorAll(".champ-input").forEach(ci => ci.value = "");
    teamRow.querySelectorAll(".champ-img").forEach(img => {
        img.src = "";
        img.style.display = "none";
    });
    teamRow.querySelectorAll(".rarity-img").forEach(img => {
        img.src = "";
        img.style.display = "none";
    });
    };



    // member slot
    const memberSlot = document.createElement("div");
    memberSlot.className = "member-slot";

    const mLabel = document.createElement("label");
    mLabel.textContent = "Membre";

    const mInput = document.createElement("select");
    mInput.className = "member-select";

    Object.keys(clanMembers).sort().forEach(name => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        mInput.appendChild(opt);
    });

    mInput.value = teamData.member || "";
    memberSlot.appendChild(mLabel);
    memberSlot.appendChild(mInput);

    // Aura display (will be populated when lead is set)
    const auraDisplay = document.createElement("div");
    auraDisplay.className = "lead-aura-display";
    memberSlot.appendChild(auraDisplay);

    teamRow.appendChild(memberSlot);
    
        // --- Condition par team (seulement pour les posts classiques) ---
    const postEl = currentPostId ? document.getElementById(currentPostId) : null;
    const postTypeForTeam = postEl ? postEl.dataset.type : "post";

    if (postTypeForTeam === "post") {
        const teamCondSlot = document.createElement("div");
        teamCondSlot.className = "team-condition-slot";

        const condLabel = document.createElement("div");
        condLabel.className = "team-condition-label";
        condLabel.textContent = "CONDITION";

        const condChoices = document.createElement("div");
        condChoices.className = "team-condition-choices";

        const condHidden = document.createElement("input");
        condHidden.type = "hidden";
        condHidden.className = "team-condition-value";
        condHidden.value = teamData.condition || "";

        // créer les boutons pour les 3 conditions du post
        const buttons = [];
        currentPostConditionsList.forEach(cond => {
            if (!cond) return;

            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "team-cond-btn";

            const img = document.createElement("img");
            img.src = `/siege/img/conditions/${cond.image}.webp`;
            img.alt = cond.name || "Condition";
            img.title = cond.description || cond.name || "Condition";

            btn.appendChild(img);

            btn.addEventListener("click", () => {
                // Si on clique la condition déjà sélectionnée → on la retire
                if (String(condHidden.value) === String(cond.id)) {
                    condHidden.value = "";
                    buttons.forEach(b => b.classList.remove("selected"));
                    return;
                }

                // Sinon → on sélectionne normalement
                condHidden.value = cond.id;
                buttons.forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
            });

            if (String(teamData.condition || "") === String(cond.id)) {
                btn.classList.add("selected");
            }

            buttons.push(btn);
            condChoices.appendChild(btn);
        });

        teamCondSlot.appendChild(condLabel);
        teamCondSlot.appendChild(condChoices);
        teamCondSlot.appendChild(condHidden);

        memberSlot.appendChild(teamCondSlot);
    }

    // right champs row
    const rightRow = document.createElement("div");
    rightRow.className = "modal-right-row";

    for (let i = 1; i <= 4; i++) {
        const champSlot = document.createElement("div");
        champSlot.className = "champ-slot";
        champSlot.draggable = true;
        champSlot.dataset.champIndex = i;

        const cLabel = document.createElement("label");
        cLabel.textContent = i === 4 ? "Lead" : "Champion " + i;
        const cInput = document.createElement("input");
        cInput.className = "champ-input";
        cInput.value = teamData["c" + i] || "";

        const visual = document.createElement("div");
        visual.className = "champ-visual";
        const rarityImg = document.createElement("img");
        rarityImg.className = "rarity-img";
        const champImg = document.createElement("img");
        champImg.className = "champ-img";

        const clearChampBtn = document.createElement("button");
        clearChampBtn.className = "clear-champ-btn";
        clearChampBtn.type = "button";
        clearChampBtn.innerHTML = "×";
        clearChampBtn.title = "Supprimer ce champion";

        clearChampBtn.onclick = () => {
            cInput.value = "";
            champImg.src = "";
            champImg.style.display = "none";
            rarityImg.src = "";
            rarityImg.style.display = "none";
        };

        visual.appendChild(champImg);
        visual.appendChild(rarityImg);
        visual.appendChild(clearChampBtn);

        const sugWrapper = document.createElement("div");
        sugWrapper.className = "suggestions";
        const sugList = document.createElement("div");
        sugList.className = "suggestions-list";
        sugWrapper.appendChild(sugList);

        const inputWrapper = document.createElement("div");
        inputWrapper.className = "champ-input-wrapper";
        inputWrapper.style.position = "relative";
        inputWrapper.style.width = "70px";

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

        // Update lead aura when champion 4 changes
        if (i === 4) {
            cInput.addEventListener("input", () => {
                setTimeout(() => updateLeadAura(teamRow), 50);
            });

            // Also update when a suggestion is clicked or input loses focus
            cInput.addEventListener("blur", () => {
                setTimeout(() => updateLeadAura(teamRow), 250);
            });
        }

        // Drag & Drop events
        champSlot.addEventListener("dragstart", (e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", champSlot.dataset.champIndex);
            champSlot.classList.add("dragging");
        });

        champSlot.addEventListener("dragend", () => {
            champSlot.classList.remove("dragging");
        });

        champSlot.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            champSlot.classList.add("drag-over");
        });

        champSlot.addEventListener("dragleave", () => {
            champSlot.classList.remove("drag-over");
        });

        champSlot.addEventListener("drop", (e) => {
            e.preventDefault();
            champSlot.classList.remove("drag-over");

            const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
            const toIndex = parseInt(champSlot.dataset.champIndex);

            if (fromIndex === toIndex) return;

            // Échanger les champions dans la même team
            const allSlots = rightRow.querySelectorAll(".champ-slot");
            const fromSlot = Array.from(allSlots).find(s => parseInt(s.dataset.champIndex) === fromIndex);
            const toSlot = champSlot;

            if (!fromSlot || !toSlot) return;

            const fromInput = fromSlot.querySelector(".champ-input");
            const toInput = toSlot.querySelector(".champ-input");
            const fromChampImg = fromSlot.querySelector(".champ-img");
            const toChampImg = toSlot.querySelector(".champ-img");
            const fromRarityImg = fromSlot.querySelector(".rarity-img");
            const toRarityImg = toSlot.querySelector(".rarity-img");

            // Échanger les valeurs
            const tempValue = fromInput.value;
            const tempChampSrc = fromChampImg.src;
            const tempChampDisplay = fromChampImg.style.display;
            const tempRaritySrc = fromRarityImg.src;
            const tempRarityDisplay = fromRarityImg.style.display;

            fromInput.value = toInput.value;
            fromChampImg.src = toChampImg.src;
            fromChampImg.style.display = toChampImg.style.display;
            fromRarityImg.src = toRarityImg.src;
            fromRarityImg.style.display = toRarityImg.style.display;

            toInput.value = tempValue;
            toChampImg.src = tempChampSrc;
            toChampImg.style.display = tempChampDisplay;
            toRarityImg.src = tempRaritySrc;
            toRarityImg.style.display = tempRarityDisplay;

            // Update lead aura if champion 4 was involved in the swap
            if (fromIndex === 4 || toIndex === 4) {
                setTimeout(() => updateLeadAura(teamRow), 50);
            }
        });

        rightRow.appendChild(champSlot);
    }

    teamRow.appendChild(rightRow);
    teamRow.appendChild(clearBtn);

    // Bouton pour transférer vers un autre poste
    const transferBtn = document.createElement("button");
    transferBtn.className = "transfer-team-btn";
    transferBtn.type = "button";
    transferBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 3 9-3 9 19-9Z"/><path d="M6 12h16"/></svg>`;
    transferBtn.title = "Déplacer vers un autre poste";

    const transferMenu = document.createElement("div");
    transferMenu.className = "transfer-menu";

    // Créer les options de transfert
    postIds.forEach(pid => {
        const item = document.createElement("div");
        item.className = "transfer-menu-item";
        item.textContent = getPostLabel(pid);

        if (pid === currentPostId) {
            item.classList.add("current");
            item.title = "Poste actuel";
        } else {
            item.addEventListener("click", () => {
                transferTeamToPost(teamRow, pid);
                transferMenu.classList.remove("open");
            });
        }

        transferMenu.appendChild(item);
    });

    transferBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Fermer tous les autres menus
        document.querySelectorAll(".transfer-menu.open").forEach(m => {
            if (m !== transferMenu) m.classList.remove("open");
        });
        transferMenu.classList.toggle("open");
    });

    teamRow.appendChild(transferBtn);
    teamRow.appendChild(transferMenu);

    if (index > 0) {
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "-";
        deleteBtn.className = "ghost-btn small delete-team-btn";

        deleteBtn.addEventListener("click", () => {
            teamRow.remove();
            updateMoveButtons();
        });

        teamRow.appendChild(deleteBtn);
    }
    teamsContainer.appendChild(teamRow);
    updateMoveButtons();

    // Update lead aura if champion 4 is set
    if (championsDB) {
        setTimeout(() => updateLeadAura(teamRow), 100);
    }
}

function getTeamsFromModal() {
    const teams = [];
    const teamsContainer = document.getElementById("teamsContainer");
    teamsContainer.querySelectorAll(".team-row").forEach(row => {
        const memberInput = row.querySelector(".member-select");
        const champInputs = row.querySelectorAll(".champ-input");
        const condInput = row.querySelector(".team-condition-value");

        const team = {
            member: memberInput ? memberInput.value.trim() : "",
            c1: champInputs[0] ? champInputs[0].value.trim() : "",
            c2: champInputs[1] ? champInputs[1].value.trim() : "",
            c3: champInputs[2] ? champInputs[2].value.trim() : "",
            c4: champInputs[3] ? champInputs[3].value.trim() : "",
            condition: condInput ? condInput.value.trim() : ""
        };

        if (team.member || team.c1 || team.c2 || team.c3 || team.c4 || team.condition) {
            teams.push(team);
        }
    });
    return teams;
}

function fillModalFromData(data) {
    // CONDIS NON UTILISÉES POUR L’INSTANT → CHECK SAFE

    const teamsContainer = document.getElementById("teamsContainer");
    teamsContainer.innerHTML = "";

    const teams = Array.isArray(data.teams) && data.teams.length ? data.teams : [{}];
    teams.forEach((team, i) => createTeamRow(team, i));
}

function openModal(postId) {
    currentPostId = postId;
    document.body.classList.add("modal-open");
    document.getElementById("modalOverlay").style.display = "flex";
    document.getElementById("modalTitle").textContent = postId
        .replace("post", "Post ")
        .replace("magictower", "Magic Tower ")
        .replace("defensetower", "Defense Tower ")
        .replace("manashrine", "Mana Shrine ")
        .replace("stronghold", "Stronghold");

    const data = postDataCache[postId] || {};

    // Mettre à jour l'état du bouton freeze
    updateFreezeButton(data.frozen || false);

    // ⚠️ d'abord les conditions (post-level)
    renderConditionsUI(postId, data);

    // puis les teams (qui ont besoin des 3 conditions du post)
    fillModalFromData(data);

    // Appliquer le verrouillage si nécessaire
    applyFreezeState(data.frozen || false);

    setStatus("");
}

function closeModal() {
    document.body.classList.remove("modal-open");
    document.getElementById("modalOverlay").style.display = "none";
}

function updateFreezeButton(isFrozen) {
    const btn = document.getElementById("freezePostBtn");
    const icon = document.getElementById("freezeIcon");
    const label = document.getElementById("freezeLabel");

    if (isFrozen) {
        btn.classList.add("frozen");
        icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
        label.textContent = "Locked";
        btn.title = "Unlock this post";
    } else {
        btn.classList.remove("frozen");
        icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
        label.textContent = "Lock";
        btn.title = "Lock this post";
    }
}

function applyFreezeState(isFrozen) {
    const modal = document.querySelector(".modal");
    const saveBtn = document.getElementById("saveBtn");
    const addTeamBtn = document.getElementById("addTeamBtn");

    if (isFrozen) {
        // Désactiver tous les inputs et boutons d'édition
        modal.querySelectorAll("input, select, .champ-input").forEach(el => el.disabled = true);
        modal.querySelectorAll(".move-team-btn, .clear-team-btn, .delete-team-btn, .transfer-team-btn, .clear-champ-btn, .condition-toggle, .team-cond-btn").forEach(btn => btn.disabled = true);

        if (saveBtn) saveBtn.disabled = true;
        if (addTeamBtn) addTeamBtn.disabled = true;

        modal.classList.add("frozen-post");
    } else {
        // Réactiver tous les inputs et boutons
        modal.querySelectorAll("input, select, .champ-input").forEach(el => el.disabled = false);
        modal.querySelectorAll(".move-team-btn, .clear-team-btn, .delete-team-btn, .transfer-team-btn, .clear-champ-btn, .condition-toggle, .team-cond-btn").forEach(btn => btn.disabled = false);

        if (saveBtn) saveBtn.disabled = false;
        if (addTeamBtn) addTeamBtn.disabled = false;

        modal.classList.remove("frozen-post");

        // Re-update move buttons pour les états corrects
        updateMoveButtons();
    }
}

function toggleFreezePost() {
    if (!currentRoomId || !currentPostId) return;

    const data = postDataCache[currentPostId] || {};
    const newFrozenState = !(data.frozen || false);

    data.frozen = newFrozenState;

    const r = ref(db, "siege/" + currentRoomId + "/" + currentPostId + "/frozen");
    set(r, newFrozenState)
        .then(() => {
            updateFreezeButton(newFrozenState);
            applyFreezeState(newFrozenState);
            updatePostConditionsOnMap(currentPostId);  // Masquer/afficher les icônes sur la carte
            setStatus(newFrozenState ? "Post locked ✔" : "Post unlocked ✔");
        })
        .catch(err => {
            console.error(err);
            setStatus("Error: " + err.message, true);
        });
}

function transferTeamToPost(teamRow, targetPostId) {
    if (!currentRoomId || !currentPostId || !targetPostId) return;

    // Extraire les données de la team à partir de la row
    const memberInput = teamRow.querySelector(".member-select");
    const champInputs = teamRow.querySelectorAll(".champ-input");
    const condInput = teamRow.querySelector(".team-condition-value");

    const teamData = {
        member: memberInput ? memberInput.value.trim() : "",
        c1: champInputs[0] ? champInputs[0].value.trim() : "",
        c2: champInputs[1] ? champInputs[1].value.trim() : "",
        c3: champInputs[2] ? champInputs[2].value.trim() : "",
        c4: champInputs[3] ? champInputs[3].value.trim() : "",
        condition: condInput ? condInput.value.trim() : ""
    };

    // Récupérer les teams du poste source
    const sourceData = postDataCache[currentPostId] || {};
    const sourceTeams = Array.isArray(sourceData.teams) ? [...sourceData.teams] : [];

    // Trouver l'index de la team dans le DOM pour la supprimer
    const teamsContainer = document.getElementById("teamsContainer");
    const allRows = Array.from(teamsContainer.querySelectorAll(".team-row"));
    const teamIndex = allRows.indexOf(teamRow);

    if (teamIndex !== -1 && teamIndex < sourceTeams.length) {
        sourceTeams.splice(teamIndex, 1);
    }

    // Récupérer les teams du poste de destination
    const targetData = postDataCache[targetPostId] || {};
    const targetTeams = Array.isArray(targetData.teams) ? [...targetData.teams] : [];
    targetTeams.push(teamData);

    // Sauvegarder les deux postes
    const sourceRef = ref(db, "siege/" + currentRoomId + "/" + currentPostId + "/teams");
    const targetRef = ref(db, "siege/" + currentRoomId + "/" + targetPostId + "/teams");

    Promise.all([
        set(sourceRef, sourceTeams),
        set(targetRef, targetTeams)
    ])
        .then(() => {
            setStatus(`Team transférée vers ${getPostLabel(targetPostId)} ✔`);
            teamRow.remove();
            updateMoveButtons();
        })
        .catch(err => {
            console.error(err);
            setStatus("Erreur lors du transfert : " + err.message, true);
        });
}

function renderConditionsUI(postId, data) {
    const postEl = document.getElementById(postId);
    const toggleBtn = document.getElementById("conditionToggle");
    const currentIcon = document.getElementById("conditionCurrentIcon");
    const hiddenInput = document.getElementById("condition");
    const panel = document.getElementById("conditionsPanel");
    const groupEl = document.querySelector(".conditions-group");

    if (!postEl || !groupEl) return;

    const postType = postEl.dataset.type || "post";

    // -----------------------------
    // CASE 1 : POSTS CLASSIQUES → 3 conditions
    // -----------------------------
    panel.classList.remove("open");
    panel.innerHTML = "";
    if (postType === "post") {
        // cacher l'ancien système (un seul toggle)
        if (toggleBtn) toggleBtn.style.display = "none";
        if (currentIcon) currentIcon.style.display = "none";
        if (hiddenInput) hiddenInput.style.display = "none";

        // s'assurer qu'on a un wrapper pour les 3 slots
        if (!postConditionsSlotsWrapper) {
            postConditionsSlotsWrapper = document.createElement("div");
            postConditionsSlotsWrapper.className = "post-conditions-row";

            for (let i = 0; i < 3; i++) {
                const slot = document.createElement("div");
                slot.className = "post-condition-slot";
                slot.dataset.index = String(i);

                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "condition-toggle";

                const img = document.createElement("img");
                img.className = "condition-current-icon";

                btn.appendChild(img);

                const valueInput = document.createElement("input");
                valueInput.type = "hidden";
                valueInput.className = "condition-value";

                slot.appendChild(btn);
                slot.appendChild(valueInput);
                postConditionsSlotsWrapper.appendChild(slot);
            }
            groupEl.insertBefore(postConditionsSlotsWrapper, groupEl.firstChild);
        }

        postConditionsSlotsWrapper.style.display = "";
        if (panel) {
            panel.style.display = "";
        }

        const { orderedTypes, byType } = getConditionsByType();
        panel.innerHTML = "";

        // helper pour retrouver un objet condition par id
        function resolveConditionById(id) {
            id = String(id);
            for (const t of orderedTypes) {
                for (const cond of byType[t]) {
                    if (String(cond.id) === id) return cond;
                }
            }
            return null;
        }

        const conditionsArr = Array.isArray(data.conditions) ? data.conditions : [];
        const slots = postConditionsSlotsWrapper.querySelectorAll(".post-condition-slot");

        currentPostConditionsList = [];

        // initialisation visuelle des 3 slots
        slots.forEach((slot, index) => {
            const btn = slot.querySelector(".condition-toggle");
            const img = slot.querySelector(".condition-current-icon");
            const valueInput = slot.querySelector(".condition-value");

            const existingId = conditionsArr[index] || "";
            const cond = existingId ? resolveConditionById(existingId) : null;

            if (cond) {
                img.src = `/siege/img/conditions/${cond.image}.webp`;
                img.style.display = "block";
                img.title = cond.description || cond.name || "Condition";
                valueInput.value = cond.id;
                currentPostConditionsList[index] = cond;
            } else {
                img.src = `/siege/img/conditions/Condition.webp`;
                img.style.display = "block";
                img.title = "Cliquez pour choisir une condition";
                valueInput.value = "";
                currentPostConditionsList[index] = null;
            }

            // clic sur le slot → choisir quelle "case" on édite
            btn.onclick = () => {
                activeConditionSlotIndex = index;
                panel.classList.toggle("open");
            };
        });

        // construire le panel unique de conditions
        orderedTypes.forEach(typeKey => {
            const row = document.createElement("div");
            row.className = "condition-row";

            const iconsWrapper = document.createElement("div");
            iconsWrapper.className = "condition-row-icons";

            byType[typeKey].forEach(cond => {
                const icon = document.createElement("img");
                icon.src = `/siege/img/conditions/${cond.image}.webp`;
                icon.className = "condition-icon";
                icon.title = cond.description || cond.name;

                icon.addEventListener("click", () => {
                    const slots = postConditionsSlotsWrapper.querySelectorAll(".post-condition-slot");
                    const slot = slots[activeConditionSlotIndex];
                    if (!slot) return;

                    const img = slot.querySelector(".condition-current-icon");
                    const valueInput = slot.querySelector(".condition-value");

                    valueInput.value = cond.id;
                    img.src = `/siege/img/conditions/${cond.image}.webp`;
                    img.title = cond.description || cond.name || "Condition";

                    currentPostConditionsList[activeConditionSlotIndex] = cond;

                    panel.classList.remove("open");
                    saveCurrentPost(); // on sauvegarde directement le post-level
                });

                iconsWrapper.appendChild(icon);
            });

            row.appendChild(iconsWrapper);
            panel.appendChild(row);
        });

        return;
    }

    // -----------------------------
    // CASE 2 : STRONGHOLD / DEFENSE / MAGIC / AUTRES → ancien système 1 condition
    // -----------------------------
    // on masque la bar "3 slots" si elle existe
    if (postConditionsSlotsWrapper) {
        postConditionsSlotsWrapper.style.display = "none";
    }

    panel.classList.remove("open");
    panel.innerHTML = "";
    panel.style.display = "";

    if (toggleBtn) toggleBtn.style.display = "";
    if (currentIcon) currentIcon.style.display = "";
    if (hiddenInput) hiddenInput.style.display = "";

    if (!toggleBtn || !currentIcon || !hiddenInput || !panel) return;

    const postTypeStrong = postType;

    // STRONGHOLD
    if (postTypeStrong === "stronghold") {
        groupEl.style.display = "";
        renderStrongholdUI(panel, toggleBtn, currentIcon, hiddenInput, data.condition || "");
        return;
    }

    // DEFENSE TOWER
    if (postTypeStrong === "defensetower") {
        groupEl.style.display = "";
        renderDefenseTowerUI(panel, toggleBtn, currentIcon, hiddenInput, data.condition || "");
        return;
    }

    // MAGIC TOWER
    if (postTypeStrong === "magictower") {
        groupEl.style.display = "";
        renderMagicTowerUI(panel, toggleBtn, currentIcon, hiddenInput, data.condition || "");
        return;
    }

    // AUCUNE CONDITION pour shrines / autres types non "post"
    if (postTypeStrong !== "post") {
        groupEl.style.display = "none";
        hiddenInput.value = "";
        return;
    }
}

function saveCurrentPost() {
    if (!currentRoomId) {
        setStatus("Join or create a room first.", true);
        alert("Join or create a room first.");
        return;
    }
    if (!currentPostId) {
        setStatus("Choose a post on the map.", true);
        alert("Choose a post on the map.");
        return;
    }

    const teams = getTeamsFromModal();
    const postEl = document.getElementById(currentPostId);
    const postType = postEl ? postEl.dataset.type : "post";

    let data = { teams };

    if (postType === "post") {
        // récupérer les 3 conditions du post
        const slots = postConditionsSlotsWrapper
            ? postConditionsSlotsWrapper.querySelectorAll(".condition-value")
            : [];
        const conditions = Array.from(slots)
            .map(input => input.value.trim())
            .filter(v => v !== "");

        data.conditions = conditions;
    } else {
        const condition = document.getElementById("condition").value;
        data.condition = condition;
    }

    const r = ref(db, "siege/" + currentRoomId + "/" + currentPostId);
    set(r, data)
        .then(() => {
            setStatus("Teams saved ✔");
            updateSummaryTable();
        })
        .catch(err => {
            console.error(err);
            setStatus("Save Error : " + err.message, true);
        });
}

function getPostLabel(postId) {
    return postId.replace("post", "Post ").replace("magictower", "Magic Tower ").replace("defensetower", "Defense Tower ").replace("manashrine", "Mana Shrine ").replace("stronghold", "Stronghold");
}

function openPostFromSummary(postId, memberName) {
    // on ouvre le modal normalement
    openModal(postId);

    // on attend que fillModalFromData ait généré toutes les teams
    setTimeout(() => {
        const teamsContainer = document.getElementById("teamsContainer");
        const rows = teamsContainer.querySelectorAll(".team-row");

        for (const row of rows) {
            const mInput = row.querySelector(".member-select");
                if (!mInput) continue;

                if (mInput.value.trim().toLowerCase() === memberName.toLowerCase()) {
                // scroll automatique vers la bonne team
                row.scrollIntoView({ behavior: "smooth", block: "center" });

                // optionnel : highlight
                row.style.outline = "2px solid #00c9ff";
                setTimeout(() => row.style.outline = "", 1200);

                break;
            }
        }
    }, 80); // léger délai le temps que le modal génère le DOM
}

function getStrongholdLevels() {
    if (!siegeDB) return [];

    try {
        const stmt = siegeDB.prepare(
            "SELECT id, level, image, description FROM stronghold ORDER BY level ASC;"
        );
        const levels = [];
        while (stmt.step()) {
            levels.push(stmt.getAsObject());
        }
        stmt.free();
        return levels; // ex: [{id:1, level:1,...}, {id:2, level:2,...}, {id:3,...}]
    } catch (e) {
        console.error("Erreur getStrongholdLevels", e);
        return [];
    }
}

function renderStrongholdUI(panel, toggleBtn, currentIcon, hiddenInput, currentValue) {
    const levels = getStrongholdLevels(); // 18 lignes SQL
    panel.innerHTML = "";

    // === 1) Grouper par niveau ===
    const grouped = {};
    levels.forEach(lvl => {
        if (!grouped[lvl.level]) grouped[lvl.level] = [];
        grouped[lvl.level].push(lvl);
    });

// === 2) Déterminer l’élément actuellement sélectionné ===

// currentValue = valeur stockée dans Firebase
// Elle peut être soit un ID (nouveau système), soit un LEVEL (ancien système)
let selected = null;

// 1) Essayer de matcher sur l'id
selected = levels.find(l => String(l.id) === String(currentValue));

// 2) Sinon l’ancien système stockait le "level", donc on essaye ça
if (!selected) {
    selected = levels.find(l => String(l.level) === String(currentValue));
}


    if (selected) {
        currentIcon.src = `/siege/img/stronghold/${selected.image}.webp`;
        currentIcon.title = selected.description || "";
        hiddenInput.value = selected.id;
    } else {
        currentIcon.src = `/siege/img/stronghold/Stronghold.webp`;
        currentIcon.title = "Choisir un niveau Stronghold";
        hiddenInput.value = "";
    }

    // === 3) Créer 1 ligne par level ===
    Object.keys(grouped).sort((a,b)=>a-b).forEach(level => {

        const row = document.createElement("div");
        row.className = "condition-row";

        // conteneur pour les 6 icônes
        const iconsWrapper = document.createElement("div");
        iconsWrapper.className = "condition-row-icons";

        grouped[level].forEach(lvl => {
            const icon = document.createElement("img");
            icon.src = `/siege/img/stronghold/${lvl.image}.webp`;
            icon.className = "condition-icon";
            icon.title = lvl.description || "";

            if (selected && lvl.id === selected.id) icon.classList.add("selected");

           icon.addEventListener("click", () => {
                panel.querySelectorAll(".condition-icon.selected").forEach(el => {
                    el.classList.remove("selected");
                });

                if (String(hiddenInput.value) === String(lvl.id)) {
                    hiddenInput.value = "";
                    currentIcon.src = `/siege/img/stronghold/Stronghold.webp`;

                    panel.classList.remove("open");

                    saveCurrentPost();
                    return;
                }

                hiddenInput.value = lvl.id;

                icon.classList.add("selected");
                currentIcon.src = `/siege/img/stronghold/${lvl.image}.webp`;

                panel.classList.remove("open");

                saveCurrentPost();
            });

            iconsWrapper.appendChild(icon);
        });

        row.appendChild(iconsWrapper);
        panel.appendChild(row);
    });

    toggleBtn.onclick = () => panel.classList.toggle("open");
}

function getDefenseTowerLevels() {
    if (!siegeDB) return [];

    try {
        const stmt = siegeDB.prepare(
            "SELECT id, level, image, description FROM defensetower ORDER BY level ASC;"
        );
        const levels = [];
        while (stmt.step()) {
            levels.push(stmt.getAsObject());
        }
        stmt.free();
        return levels;
    } catch (e) {
        console.error("Erreur getDefenseTowerLevels", e);
        return [];
    }
}

function renderDefenseTowerUI(panel, toggleBtn, currentIcon, hiddenInput, currentValue) {
    const levels = getDefenseTowerLevels();
    panel.innerHTML = "";

    // 1) Grouper par niveau
    const grouped = {};
    levels.forEach(lvl => {
        if (!grouped[lvl.level]) grouped[lvl.level] = [];
        grouped[lvl.level].push(lvl);
    });

    // 2) Déterminer l’élément sélectionné
    let selected = null;

    // nouvelle config par ID
    selected = levels.find(l => String(l.id) === String(currentValue));

    // ancienne config par LEVEL (fallback)
    if (!selected) {
        selected = levels.find(l => String(l.level) === String(currentValue));
    }

    // icône affichée dans le bouton
    if (selected) {
        currentIcon.src = `/siege/img/defensetower/${selected.image}.webp`;
        currentIcon.title = selected.description || "";
        hiddenInput.value = selected.id;
    } else {
        currentIcon.src = `/siege/img/defensetower/DefenseTower.webp`;
        currentIcon.title = "Choisir une condition Defense Tower";
        hiddenInput.value = "";
    }

    // 3) Créer 1 ligne par level
    Object.keys(grouped).sort((a,b)=>a-b).forEach(level => {
        const row = document.createElement("div");
        row.className = "condition-row";

        const iconsWrapper = document.createElement("div");
        iconsWrapper.className = "condition-row-icons";

        grouped[level].forEach(lvl => {
            const icon = document.createElement("img");
            icon.src = `/siege/img/defensetower/${lvl.image}.webp`;
            icon.className = "condition-icon";
            icon.title = lvl.description || "";

            if (selected && lvl.id === selected.id) {
                icon.classList.add("selected");
            }

            icon.addEventListener("click", () => {

                // retirer anciennes sélections
                panel.querySelectorAll(".condition-icon.selected")
                    .forEach(el => el.classList.remove("selected"));

                // toggle off
                if (String(hiddenInput.value) === String(lvl.id)) {
                    hiddenInput.value = "";
                    currentIcon.src = `/siege/img/defensetower/DefenseTower.webp`;

                    panel.classList.remove("open");
                    saveCurrentPost();
                    return;
                }

                // nouvelle sélection
                hiddenInput.value = lvl.id;
                icon.classList.add("selected");
                currentIcon.src = `/siege/img/defensetower/${lvl.image}.webp`;

                // fermer après clic
                panel.classList.remove("open");

                saveCurrentPost();
            });

            iconsWrapper.appendChild(icon);
        });

        row.appendChild(iconsWrapper);
        panel.appendChild(row);
    });

    toggleBtn.onclick = () => panel.classList.toggle("open");
}

function getMagicTowerLevels() {
    if (!siegeDB) return [];

    try {
        const stmt = siegeDB.prepare(
            "SELECT id, level, image, description FROM magictower ORDER BY level ASC;"
        );
        const levels = [];
        while (stmt.step()) {
            levels.push(stmt.getAsObject());
        }
        stmt.free();
        return levels;
    } catch (e) {
        console.error("Erreur getMagicTowerLevels", e);
        return [];
    }
}

function renderMagicTowerUI(panel, toggleBtn, currentIcon, hiddenInput, currentValue) {
    const levels = getMagicTowerLevels();
    panel.innerHTML = "";

    // 1) Grouper par niveau
    const grouped = {};
    levels.forEach(lvl => {
        if (!grouped[lvl.level]) grouped[lvl.level] = [];
        grouped[lvl.level].push(lvl);
    });

    // 2) Déterminer sélection
    let selected = levels.find(l => String(l.id) === String(currentValue));

    if (!selected) {
        selected = levels.find(l => String(l.level) === String(currentValue));
    }

    // icône affichée
    if (selected) {
        currentIcon.src = `/siege/img/magictower/${selected.image}.webp`;
        currentIcon.title = selected.description || "";
        hiddenInput.value = selected.id;
    } else {
        currentIcon.src = `/siege/img/magictower/MagicTower.webp`;
        currentIcon.title = "Choisir une condition Magic Tower";
        hiddenInput.value = "";
    }

    // 3) Construire lignes
    Object.keys(grouped).sort((a,b)=>a-b).forEach(level => {
        const row = document.createElement("div");
        row.className = "condition-row";

        const iconsWrapper = document.createElement("div");
        iconsWrapper.className = "condition-row-icons";

        grouped[level].forEach(lvl => {
            const icon = document.createElement("img");
            icon.src = `/siege/img/magictower/${lvl.image}.webp`;
            icon.className = "condition-icon";
            icon.title = lvl.description || "";

            if (selected && lvl.id === selected.id) {
                icon.classList.add("selected");
            }

            icon.addEventListener("click", () => {

                // Enlever anciennes sélections
                panel.querySelectorAll(".condition-icon.selected")
                    .forEach(el => el.classList.remove("selected"));

                // toggle OFF
                if (String(hiddenInput.value) === String(lvl.id)) {
                    hiddenInput.value = "";
                    currentIcon.src = `/siege/img/magictower/MagicTower.webp`;

                    panel.classList.remove("open");
                    saveCurrentPost();
                    return;
                }

                // nouvelle sélection
                hiddenInput.value = lvl.id;
                icon.classList.add("selected");
                currentIcon.src = `/siege/img/magictower/${lvl.image}.webp`;

                panel.classList.remove("open");
                saveCurrentPost();
            });

            iconsWrapper.appendChild(icon);
        });

        row.appendChild(iconsWrapper);
        panel.appendChild(row);
    });

    toggleBtn.onclick = () => panel.classList.toggle("open");
}


function updatePostConditionsOnMap(postId) {
    const postEl = document.getElementById(postId);
    if (!postEl || postEl.dataset.type !== "post") return;

    const data = postDataCache[postId] || {};
    const conditionsDiv = postEl.querySelector(".post-conditions");
    if (!conditionsDiv) return;

    // Masquer si le poste est locked et ajouter la classe pour ajuster le label
    if (data.frozen) {
        conditionsDiv.classList.add("hidden");
        postEl.classList.add("post-frozen");
        return;
    } else {
        conditionsDiv.classList.remove("hidden");
        postEl.classList.remove("post-frozen");
    }

    const conditionsArr = Array.isArray(data.conditions) ? data.conditions : [];
    const icons = conditionsDiv.querySelectorAll(".post-cond-icon");

    icons.forEach((icon, index) => {
        const condId = conditionsArr[index];

        if (condId) {
            // Trouver la condition dans la DB
            const { orderedTypes, byType } = getConditionsByType();
            let condRow = null;

            for (const t of orderedTypes) {
                for (const c of byType[t]) {
                    if (String(c.id) === String(condId)) {
                        condRow = c;
                        break;
                    }
                }
                if (condRow) break;
            }

            if (condRow) {
                icon.src = `/siege/img/conditions/${condRow.image}.webp`;
                icon.title = condRow.description || condRow.name || "";
            } else {
                icon.src = "/siege/img/conditions/Condition.webp";
                icon.title = "";
            }
        } else {
            // Pas de condition sélectionnée → fallback
            icon.src = "/siege/img/conditions/Condition.webp";
            icon.title = "";
        }
    });
}

function updateTeamsCountOnMap(postId) {
    const postEl = document.getElementById(postId);
    if (!postEl) return;

    const countDiv = postEl.querySelector(".post-teams-count");
    if (!countDiv) return;

    const data = postDataCache[postId] || {};
    const teams = Array.isArray(data.teams) ? data.teams : [];

    // Compter les équipes qui ont au moins un champion assigné
    const teamsWithMembers = teams.filter(team => {
        return team.c1 || team.c2 || team.c3 || team.c4;
    });

    const count = teamsWithMembers.length;
    countDiv.textContent = count;

    // Ajouter/retirer la classe 'empty' selon le nombre
    if (count === 0) {
        countDiv.classList.add("empty");
    } else {
        countDiv.classList.remove("empty");
    }
}

let globalTooltip = null;

function createTooltipContent(postId) {
    const data = postDataCache[postId] || {};
    const teams = Array.isArray(data.teams) ? data.teams : [];
    const postEl = document.getElementById(postId);
    const postType = postEl ? postEl.dataset.type : "post";

    // Filtrer les équipes qui ont au moins un champion
    const teamsWithMembers = teams.filter(team => {
        return team.member || team.c1 || team.c2 || team.c3 || team.c4;
    });

    if (teamsWithMembers.length === 0) return null;

    const content = document.createElement("div");

    // Titre
    const title = document.createElement("div");
    title.className = "post-tooltip-title";
    title.textContent = getPostLabel(postId);
    content.appendChild(title);

    // Afficher toutes les équipes
    teamsWithMembers.forEach((team, index) => {
        const teamDiv = document.createElement("div");
        teamDiv.className = "post-tooltip-team";

        // Pseudo
        const memberSpan = document.createElement("span");
        memberSpan.className = "post-tooltip-member";
        memberSpan.textContent = team.member || `Team ${index + 1}`;
        teamDiv.appendChild(memberSpan);

        // Icône de condition (seulement pour les posts classiques)
        if (postType === "post" && team.condition) {
            const { orderedTypes, byType } = getConditionsByType();
            let condRow = null;

            for (const t of orderedTypes) {
                for (const c of byType[t]) {
                    if (String(c.id) === String(team.condition)) {
                        condRow = c;
                        break;
                    }
                }
                if (condRow) break;
            }

            if (condRow) {
                const condIcon = document.createElement("img");
                condIcon.className = "post-tooltip-cond-icon";
                condIcon.src = `/siege/img/conditions/${condRow.image}.webp`;
                condIcon.title = condRow.description || condRow.name || "";
                teamDiv.appendChild(condIcon);
            }
        }

        // Champions (images carrées)
        const champsDiv = document.createElement("div");
        champsDiv.className = "post-tooltip-champs";

        for (let i = 1; i <= 4; i++) {
            const champName = team["c" + i];

            if (champName && championsDB) {
                const champ = getChampionByNameExact(champName);

                if (champ && champ.image) {
                    const champImg = document.createElement("img");
                    champImg.className = "post-tooltip-champ-img";
                    champImg.src = `/tools/champions-index/img/champions/${champ.image}.webp`;
                    champImg.title = champName;
                    champsDiv.appendChild(champImg);
                } else {
                    const emptySlot = document.createElement("div");
                    emptySlot.className = "post-tooltip-champ-empty";
                    emptySlot.title = "Champion non trouvé";
                    champsDiv.appendChild(emptySlot);
                }
            } else {
                const emptySlot = document.createElement("div");
                emptySlot.className = "post-tooltip-champ-empty";
                champsDiv.appendChild(emptySlot);
            }
        }

        teamDiv.appendChild(champsDiv);
        content.appendChild(teamDiv);
    });

    return content;
}

function showTooltip(postEl, postId) {
    const content = createTooltipContent(postId);
    if (!content) return;

    if (!globalTooltip) {
        globalTooltip = document.createElement("div");
        globalTooltip.className = "post-tooltip";
        document.body.appendChild(globalTooltip);
    }

    globalTooltip.innerHTML = "";
    globalTooltip.appendChild(content);

    const rect = postEl.getBoundingClientRect();
    const tooltipRect = globalTooltip.getBoundingClientRect();

    // Position de base : à droite du point, centré verticalement
    let left = rect.right + 12;
    let top = rect.top + rect.height / 2;
    let transform = "translateY(-50%)";

    // Vérifier si le tooltip dépasse en haut
    const tooltipHalfHeight = tooltipRect.height / 2;
    if (top - tooltipHalfHeight < 0) {
        // Aligner en haut au lieu de centrer
        top = 8;
        transform = "translateY(0)";
    }

    // Vérifier si le tooltip dépasse en bas
    if (top + tooltipHalfHeight > window.innerHeight) {
        // Aligner en bas au lieu de centrer
        top = window.innerHeight - 8;
        transform = "translateY(-100%)";
    }

    // Vérifier si le tooltip dépasse à droite
    if (left + tooltipRect.width > window.innerWidth) {
        // Positionner à gauche du point au lieu de droite
        left = rect.left - tooltipRect.width - 12;
    }

    globalTooltip.style.position = "fixed";
    globalTooltip.style.left = left + "px";
    globalTooltip.style.top = top + "px";
    globalTooltip.style.transform = transform;
    globalTooltip.style.opacity = "1";
}

function hideTooltip() {
    if (globalTooltip) {
        globalTooltip.style.opacity = "0";
    }
}

function updateTooltipOnMap(postId) {
    const postEl = document.getElementById(postId);
    if (!postEl) return;

    // Retirer les anciens listeners
    postEl.removeEventListener("mouseenter", postEl._tooltipMouseEnter);
    postEl.removeEventListener("mouseleave", postEl._tooltipMouseLeave);

    // Créer les nouveaux handlers
    postEl._tooltipMouseEnter = () => showTooltip(postEl, postId);
    postEl._tooltipMouseLeave = hideTooltip;

    // Ajouter les listeners
    postEl.addEventListener("mouseenter", postEl._tooltipMouseEnter);
    postEl.addEventListener("mouseleave", postEl._tooltipMouseLeave);
}

function updateSummaryTable() {
    const tbody = document.querySelector("#summaryTable tbody");
    tbody.innerHTML = "";

    const rows = [];

    for (const postId of postIds) {
        const data = postDataCache[postId];
        if (!data || !data.teams) continue;

        data.teams.forEach((team, i) => {
            if (!team.member) return;

            rows.push({
                postId,
                member: team.member,
                group: team.group || "-",
                teamIndex: i + 1,
                teamCondition: team.condition || "",
                c1: team.c1,
                c2: team.c2,
                c3: team.c3,
                c4: team.c4
            });
        });
    }

    // === METTRE À JOUR LE COMPTEUR DE TEAMS DANS LE TITRE ===
    const summaryTitle = document.getElementById("summaryTitle");
    if (summaryTitle) {
        summaryTitle.textContent = `TEAMS (${rows.length})`;
    }

    // ---- Désaturer / Réactiver les icônes de la map ----
    postIds.forEach(pid => {
        const icon = document.querySelector(`#${pid} .post-icon`);
        if (!icon) return;

        const hasTeam = rows.some(r => r.postId === pid);

        if (hasTeam) {
            icon.classList.remove("desaturated");
        } else {
            icon.classList.add("desaturated");
        }
    });

    // TRI
    if (summarySortMode === "member") {
        rows.sort((a, b) => a.member.localeCompare(b.member));
    } 
    else if (summarySortMode === "post") {

        rows.sort((a, b) => {

            const pa = a.postId;
            const pb = b.postId;

            // extraction du numéro si postX
            const na = pa.startsWith("post") ? parseInt(pa.replace("post", "")) : null;
            const nb = pb.startsWith("post") ? parseInt(pb.replace("post", "")) : null;

            // si deux postes classiques : tri numérique correct
            if (na !== null && nb !== null) {
                return na - nb;
            }

            // sinon tri alphabétique standard pour towers/shrines/etc
            return pa.localeCompare(pb);
        });
    }

    // Rendu HTML
    rows.forEach(r => {
        const tr = document.createElement("tr");
        tr.dataset.post = r.postId;        // l’ID du poste (ex: post1)
        tr.dataset.member = r.member;      // pour retrouver la bonne team
        const memberData = clanMembers[r.member];
        const hhIcon = memberData && memberData.link 
            ? `<a href="${memberData.link}" target="_blank" class="hh-table-icon">
                <img src="/siege/img/HH.ico" alt="HH" />
            </a>`
            : "";  
            let condIcon = "";

            const postElForRow = document.getElementById(r.postId);
            const typeForRow = postElForRow ? postElForRow.dataset.type : "post";

            // ------------------------------
            // CAS 1 : POST CLASSIQUE → condition par team
            // ------------------------------
            if (typeForRow === "post") {
                if (r.teamCondition) {
                    // récupérer la condition dans la table CONDITIONS
                    const { orderedTypes, byType } = getConditionsByType();
                    let condRow = null;

                    for (const t of orderedTypes) {
                        for (const c of byType[t]) {
                            if (String(c.id) === String(r.teamCondition)) {
                                condRow = c;
                                break;
                            }
                        }
                        if (condRow) break;
                    }

                    if (condRow) {
                        condIcon = `<img class="summary-cond-icon" src="/siege/img/conditions/${condRow.image}.webp" />`;
                    }
                }
            }

            // ------------------------------
            // CAS 2 : STRONGHOLD, DEFENSE, MAGIC → 1 condition pour TOUT LE POST
            // ------------------------------
            else {
                const postData = postDataCache[r.postId];
                if (postData && postData.condition) {

                    let folder = {
                        stronghold: "stronghold",
                        defensetower: "defensetower",
                        magictower: "magictower",
                        manashrine: "manashrine"
                    }[typeForRow] || "conditions";


                    let condRow = null;

                    if (folder === "conditions") {
                        const { orderedTypes, byType } = getConditionsByType();
                        for (const t of orderedTypes) {
                            for (const c of byType[t]) {
                                if (String(c.id) === String(postData.condition)) {
                                    condRow = c;
                                    break;
                                }
                            }
                            if (condRow) break;
                        }
                    } else {
                        // SHRINE → pas de condition dynamique, seulement une icône fixe
                        if (folder === "manashrine") {
                            condIcon = `<img class="summary-cond-icon" src="/siege/img/manashrine/ManaShrine.webp" />`;
                            return;
                        }
                        let tableFn = {
                            stronghold: getStrongholdLevels,
                            defensetower: getDefenseTowerLevels,
                            magictower: getMagicTowerLevels
                        }[folder];

                        const table = tableFn ? tableFn() : [];
                        condRow = table.find(c => String(c.id) === String(postData.condition));
                    }

                    if (condRow) {
                        condIcon = `<img class="summary-cond-icon" src="/siege/img/${folder}/${condRow.image}.webp" />`;
                    }
                }
            }

        
        tr.innerHTML = `
            <td>${getPostLabel(r.postId)}</td>
            <td class="summary-group-cell">${r.group || "-"}</td>
            <td class="summary-team-cell">${r.teamIndex || "-"}</td>
            <td class="summary-cond-cell">${condIcon}</td>
            <td>${r.member}</td>
            <td class="summary-hh-cell">${hhIcon}</td>
            <td>${r.c1}</td>
            <td>${r.c2}</td>
            <td>${r.c3}</td>
            <td>${r.c4}</td>
        `;
        tbody.appendChild(tr);
        tr.addEventListener("click", () => {
            openPostFromSummary(r.postId, r.member);
        });
    });
}

// --- init ---
window.addEventListener("DOMContentLoaded", () => {

    // Remplace automatiquement les points roses par les icônes correspondantes
    document.querySelectorAll(".post-point").forEach(pp => {
        const type = pp.dataset.type;
        if (!type) return;

        const iconEl = pp.querySelector(".post-icon");
        if (iconEl) {
            iconEl.src = `/siege/img/posts/${type}.webp`;
        }

        // Ajouter les 3 icônes de conditions pour les posts uniquement
        if (type === "post" && !pp.querySelector(".post-conditions")) {
            const conditionsDiv = document.createElement("div");
            conditionsDiv.className = "post-conditions";

            for (let i = 0; i < 3; i++) {
                const img = document.createElement("img");
                img.className = "post-cond-icon";
                img.dataset.index = i;
                img.src = "/siege/img/conditions/Condition.webp";
                conditionsDiv.appendChild(img);
            }

            // Insérer avant le post-icon
            pp.insertBefore(conditionsDiv, pp.querySelector(".post-icon"));
        }

        // Ajouter le compteur d'équipes pour tous les points
        if (!pp.querySelector(".post-teams-count")) {
            const countDiv = document.createElement("div");
            countDiv.className = "post-teams-count empty";
            countDiv.textContent = "0";
            pp.appendChild(countDiv);
        }
    });

    const joinBtn = document.getElementById("joinRoomBtn");
    const createBtn = document.getElementById("createRoomBtn");
    const copyBtn = document.getElementById("copyLinkBtn");
    const roomInput = document.getElementById("roomInput");
    const saveBtn = document.getElementById("saveBtn");
    const closeModalBtn = document.getElementById("closeModal");
    const addTeamBtn = document.getElementById("addTeamBtn");
    const freezePostBtn = document.getElementById("freezePostBtn");

    postIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("click", () => {
            if (!currentRoomId) {
                alert("Join or create a room first.");
                return;
            }
            openModal(id);
        });
    });

    joinBtn.addEventListener("click", () => {
        const room = roomInput.value.trim();
        if (!room) {
            alert("Enter a room code.");
            return;
        }
        connectRoom(room);
    });

    createBtn.addEventListener("click", () => {
        const id = randomRoomId();
        roomInput.value = id;
        connectRoom(id);
    });

    document.getElementById("addMemberBtn").addEventListener("click", () => {
        const pseudo = document.getElementById("newMemberPseudo").value.trim();
        const link = document.getElementById("newMemberLink").value.trim();

        if (!pseudo) return;

        clanMembers[pseudo] = {
            pseudo,
            link: link || ""
        };

        const refMembers = ref(db, "siege/" + currentRoomId + "/members");
        set(refMembers, clanMembers);

        document.getElementById("newMemberPseudo").value = "";
        document.getElementById("newMemberLink").value = "";
    });

    copyBtn.addEventListener("click", () => {
        if (!currentRoomId) {
            alert("No active room.");
            return;
        }
        const url = new URL(window.location.href);
        url.searchParams.set("room", currentRoomId);
        navigator.clipboard.writeText(url.toString())
            .then(() => setStatus("Link copied ✔"))
            .catch(() => setStatus("Impossible to copy link.", true));
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

    freezePostBtn.addEventListener("click", () => {
        toggleFreezePost();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const overlay = document.getElementById("modalOverlay");
            if (overlay.style.display === "flex") {
                closeModal();
            }
        }
    });

    const overlay = document.getElementById("modalOverlay");
    overlay.addEventListener("click", (e) => {
        // Si on clique l'overlay (et pas le modal lui-même)
        if (e.target === overlay) {
            closeModal();
        }
    });

    // Fermer les menus de transfert quand on clique ailleurs
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".transfer-team-btn") && !e.target.closest(".transfer-menu")) {
            document.querySelectorAll(".transfer-menu.open").forEach(m => {
                m.classList.remove("open");
            });
        }
    });

    document.getElementById("sortByMember").addEventListener("click", () => {
        summarySortMode = "member";
        updateSummaryTable();
    });

    document.getElementById("sortByPost").addEventListener("click", () => {
        summarySortMode = "post";
        updateSummaryTable();
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
