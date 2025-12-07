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

            updateSummaryTable();   // ← AJOUT CRITIQUE
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


function createTeamRow(teamData = {}, index = 0) {
    const teamsContainer = document.getElementById("teamsContainer");
    const teamRow = document.createElement("div");
    teamRow.className = "team-row";

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

    // logiquement : [member][4 champs][trash]
    teamRow.appendChild(clearBtn);

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
    teamRow.appendChild(clearBtn);
    if (index > 0) {
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "-";
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

    // ⚠️ d'abord les conditions (post-level)
    renderConditionsUI(postId, data);

    // puis les teams (qui ont besoin des 3 conditions du post)
    fillModalFromData(data);

    setStatus("");
}

function closeModal() {
    document.body.classList.remove("modal-open");
    document.getElementById("modalOverlay").style.display = "none";
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
                        magictower: "magictower"
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
    });

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
