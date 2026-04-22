import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, query, orderBy, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getDatabase, ref, onValue, set, onDisconnect, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyB1XRR_Oi68prosRM6WUgcZA7hPzT-DmOk",
    authDomain: "soundboard-ce3f9.firebaseapp.com",
    projectId: "soundboard-ce3f9",
    databaseURL: "https://soundboard-ce3f9-default-rtdb.firebaseio.com",
    appId: "1:554974413045:web:1a1489c5dd8bc2723bc5bc"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const audioElements = {};

// --- 1. LIVE USER COUNTER (Presence) ---
const userCountElem = document.getElementById("userCount");
const presenceRef = ref(rtdb, 'presence/');
const myPresenceRef = push(presenceRef);

onValue(ref(rtdb, '.info/connected'), (snap) => {
    if (snap.val() === true) {
        set(myPresenceRef, { online: true });
        onDisconnect(myPresenceRef).remove();
    }
});

onValue(presenceRef, (snap) => {
    userCountElem.innerText = snap.size || 1;
});

// --- 2. AI-STYLE NAME CLEANER (6-Word Limit) ---
function cleanFileName(rawName) {
    let name = rawName.replace(".mp3", "");
    // Remove IDs, tmp strings, and special chars
    name = name.replace(/(_[a-zA-Z0-9]{11}|tmp_\d+|copy|[\(\)\d])/gi, "");
    name = name.replace(/[_\-\.]+/g, " ").trim();
    
    let words = name.split(" ").filter(w => w.length > 0)
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    if (words.length > 6) {
        return words.slice(0, 6).join(" ") + "...";
    }
    return words.join(" ") || "Unknown Sound";
}

// --- 3. UI RENDERING & TOGGLE LOGIC ---
const soundGrid = document.getElementById("soundGrid");

onSnapshot(query(collection(db, "sounds"), orderBy("createdAt", "desc")), (snapshot) => {
    soundGrid.innerHTML = ""; 
    snapshot.forEach((doc) => renderSound(doc.data()));
    document.querySelector(".spinner")?.remove();
});

function renderSound(data) {
    const card = document.createElement("div");
    card.className = "sound";
    const btn = document.createElement("button");
    btn.className = "small-button";
    btn.style.backgroundColor = data.color || "#6366f1";
    
    const audio = new Audio(data.audioData);
    audioElements[data.name] = audio;

    btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
        } else {
            stopAll(); 
            audio.play().catch(() => {});
            card.classList.add("playing");
        }
    });
    
    audio.addEventListener("ended", () => card.classList.remove("playing"));
    audio.addEventListener("pause", () => card.classList.remove("playing"));

    const name = document.createElement("p");
    name.className = "name";
    name.innerText = data.name;

    card.appendChild(btn);
    card.appendChild(name);
    soundGrid.appendChild(card);
}

// --- 4. BULK SYNC & UPLOAD ---
const folderInput = document.getElementById("folderInput");
const bulkSyncBtn = document.getElementById("bulkSyncBtn");

bulkSyncBtn.onclick = () => folderInput.click();

folderInput.onchange = async (e) => {
    const files = Array.from(e.target.files).filter(f => f.name.endsWith(".mp3"));
    bulkSyncBtn.disabled = true;
    const existingNames = (await getDocs(collection(db, "sounds"))).docs.map(d => d.data().name);

    for (const file of files) {
        const cleanedName = cleanFileName(file.name);
        if (existingNames.includes(cleanedName) || file.size > 720000) continue;

        const base64 = await blobToBase64(file);
        await addDoc(collection(db, "sounds"), {
            name: cleanedName,
            audioData: base64,
            color: `hsl(${Math.random() * 360}, 70%, 60%)`,
            createdAt: serverTimestamp()
        });
    }
    bulkSyncBtn.disabled = false;
    bulkSyncBtn.innerText = "📁 Bulk Sync Folder";
};

function blobToBase64(blob) {
    return new Promise(r => {
        const reader = new FileReader();
        reader.onloadend = () => r(reader.result);
        reader.readAsDataURL(blob);
    });
}

// --- 5. GLOBAL CONTROLS ---
document.getElementById("toggleUpload").onclick = () => document.getElementById("uploadForm").classList.toggle("hidden");
window.playAll = () => Object.values(audioElements).forEach(a => { a.currentTime = 0; a.play(); });
window.stopAll = () => Object.values(audioElements).forEach(a => { a.pause(); a.currentTime = 0; });
