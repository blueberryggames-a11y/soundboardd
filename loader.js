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
const audioCache = {}; 

// --- 1. LIVE USER COUNTER (Optimized) ---
const userCountElem = document.getElementById("userCount");
onValue(ref(rtdb, 'presence/'), (snap) => {
    userCountElem.innerText = snap.numChildren() || 1;
});

const myPresenceRef = push(ref(rtdb, 'presence/'));
onValue(ref(rtdb, '.info/connected'), (snap) => {
    if (snap.val()) {
        set(myPresenceRef, { online: true });
        onDisconnect(myPresenceRef).remove();
    }
});

// --- 2. UTILITIES ---
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

function cleanFileName(rawName) {
    let name = rawName.replace(".mp3", "").replace(/(_[a-zA-Z0-9]{11}|tmp_\d+|copy|[\(\)\d])/gi, "");
    name = name.replace(/[_\-\.]+/g, " ").trim();
    let words = name.split(" ").filter(w => w.length > 0).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return words.length > 6 ? words.slice(0, 6).join(" ") + "..." : words.join(" ") || "Unknown Sound";
}

function blobToBase64(blob) {
    return new Promise(r => {
        const reader = new FileReader();
        reader.onloadend = () => r(reader.result);
        reader.readAsDataURL(blob);
    });
}

// --- 3. UI RENDERING (Incremental & Lazy) ---
const soundGrid = document.getElementById("soundGrid");

onSnapshot(query(collection(db, "sounds"), orderBy("createdAt", "desc")), (snapshot) => {
    document.querySelector(".spinner")?.remove();
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added") renderSound(change.doc.id, change.doc.data());
    });
});

function renderSound(id, data) {
    const card = document.createElement("div");
    card.className = "sound";
    card.id = `card-${id}`;
    
    const btn = document.createElement("button");
    btn.className = "small-button";
    btn.style.backgroundColor = data.color || "#6366f1";
    
    btn.addEventListener("pointerdown", async (e) => {
        e.preventDefault();
        
        // Lazy Initialize Audio
        if (!audioCache[id]) {
            card.classList.add("loading-audio");
            audioCache[id] = new Audio(data.audioData);
            audioCache[id].onended = () => card.classList.remove("playing");
            audioCache[id].onpause = () => card.classList.remove("playing");
            await sleep(50); // Short delay to let the browser process the blob
            card.classList.remove("loading-audio");
        }

        const audio = audioCache[id];
        if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
        } else {
            window.stopAll(); 
            audio.play().then(() => card.classList.add("playing")).catch(() => {});
        }
    });

    const name = document.createElement("p");
    name.className = "name";
    name.innerText = data.name;

    card.appendChild(btn);
    card.appendChild(name);
    soundGrid.appendChild(card);
}

// --- 4. RATE-LIMITED UPLOADS ---
async function uploadToFirebase(file, customName = null) {
    const name = customName || cleanFileName(file.name);
    if (file.size > 720000) {
        console.warn(`${name} skipped: File over 700KB limit.`);
        return;
    }

    const base64 = await blobToBase64(file);
    await addDoc(collection(db, "sounds"), {
        name: name,
        audioData: base64,
        color: `hsl(${Math.random() * 360}, 70%, 60%)`,
        createdAt: serverTimestamp()
    });
    // Cooldown prevents Firestore burst rate limiting
    await sleep(400); 
}

// Bulk Sync Logic
document.getElementById("folderInput").onchange = async (e) => {
    const files = Array.from(e.target.files).filter(f => f.name.endsWith(".mp3"));
    const btn = document.getElementById("bulkSyncBtn");
    if (files.length === 0) return;

    btn.disabled = true;
    for (let i = 0; i < files.length; i++) {
        btn.innerText = `Syncing ${i + 1}/${files.length}...`;
        await uploadToFirebase(files[i]);
    }
    btn.disabled = false;
    btn.innerText = "📁 Bulk Sync Folder";
};

// Single Upload Logic
document.getElementById("submitUpload").onclick = async () => {
    const fileInput = document.getElementById("audioFile");
    const nameInput = document.getElementById("soundName");
    const btn = document.getElementById("submitUpload");

    if (!fileInput.files[0]) return alert("Please select an MP3 file.");

    btn.disabled = true;
    btn.innerText = "Syncing...";
    await uploadToFirebase(fileInput.files[0], nameInput.value.trim() || null);
    
    btn.disabled = false;
    btn.innerText = "Sync to Cloud";
    nameInput.value = "";
    fileInput.value = "";
    document.getElementById("uploadForm").classList.add("hidden");
};

// Update file selection text
document.getElementById("audioFile").onchange = (e) => {
    const fileName = e.target.files[0]?.name || "Click to select MP3 (Max 700KB)";
    document.getElementById("fileStatus").innerText = fileName;
};

// --- 5. GLOBAL CONTROLS ---
document.getElementById("toggleUpload").onclick = () => document.getElementById("uploadForm").classList.toggle("hidden");

window.stopAll = () => {
    Object.values(audioCache).forEach(a => { a.pause(); a.currentTime = 0; });
    document.querySelectorAll('.sound').forEach(s => s.classList.remove('playing'));
};

window.playAll = () => {
    Object.values(audioCache).forEach(a => {
        a.currentTime = 0;
        a.play().catch(() => {});
    });
};
