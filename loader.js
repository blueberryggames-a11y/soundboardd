import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getDatabase, ref, onValue, set, onDisconnect, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyBa2orhKFThmsjBYcnIoM1iml2xNhOmjh8",
    authDomain: "newsound-15fa5.firebaseapp.com",
    projectId: "newsound-15fa5",
    databaseURL: "https://newsound-15fa5-default-rtdb.firebaseio.com",
    appId: "1:29777437103:web:f038577254c76c38168f5a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const audioCache = {}; 

// --- 1. LIVE USER COUNTER ---
const userCountElem = document.getElementById("userCount");
if (userCountElem) {
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
}

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

// --- 3. UI RENDERING ---
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
        if (!audioCache[id]) {
            card.classList.add("loading-audio");
            audioCache[id] = new Audio(data.audioData);
            audioCache[id].onended = () => card.classList.remove("playing");
            audioCache[id].onpause = () => card.classList.remove("playing");
            await sleep(50);
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

// --- 4. THE FIX: BULK UPLOAD TRIGGERING ---

const bulkBtn = document.getElementById("bulkSyncBtn");
const folderInput = document.getElementById("folderInput");

// 1. Force the hidden input to open when the button is clicked
if (bulkBtn && folderInput) {
    bulkBtn.addEventListener("click", (e) => {
        e.preventDefault();
        folderInput.click();
    });
}

// 2. Handle the file processing after folder selection
folderInput.onchange = async (e) => {
    const files = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith(".mp3"));
    
    if (files.length === 0) {
        alert("No MP3 files found in that folder.");
        return;
    }

    if (files.length > 30 && !confirm(`Upload ${files.length} sounds? This may take a moment.`)) {
        e.target.value = "";
        return;
    }

    bulkBtn.disabled = true;
    let count = 0;

    for (const file of files) {
        count++;
        bulkBtn.innerText = `Syncing ${count}/${files.length}...`;
        await uploadToFirebase(file);
    }

    bulkBtn.disabled = false;
    bulkBtn.innerText = "📁 Bulk Sync Folder";
    e.target.value = ""; // Reset so you can select the same folder again
};

// --- 5. UPLOAD CORE ---
async function uploadToFirebase(file, customName = null) {
    const name = customName || cleanFileName(file.name);
    if (file.size > 750000) { // Slightly increased tolerance
        console.warn(`[Skipped] ${name}: Over limit.`);
        return false;
    }

    try {
        const base64 = await blobToBase64(file);
        await addDoc(collection(db, "sounds"), {
            name: name,
            audioData: base64,
            color: `hsl(${Math.random() * 360}, 70%, 60%)`,
            createdAt: serverTimestamp()
        });
        await sleep(600); // Increased delay for safety
        return true;
    } catch (err) {
        console.error("Upload error:", err);
        return false;
    }
}

// Single Upload Handler
document.getElementById("submitUpload").onclick = async () => {
    const fileInput = document.getElementById("audioFile");
    const nameInput = document.getElementById("soundName");
    const btn = document.getElementById("submitUpload");

    if (!fileInput.files[0]) return alert("Select an MP3.");

    btn.disabled = true;
    btn.innerText = "Syncing...";
    const success = await uploadToFirebase(fileInput.files[0], nameInput.value.trim() || null);
    
    btn.disabled = false;
    btn.innerText = "Sync to Cloud";
    if (success) {
        nameInput.value = "";
        fileInput.value = "";
        document.getElementById("fileStatus").innerText = "Click to select MP3 (Max 700KB)";
        document.getElementById("uploadForm").classList.add("hidden");
    }
};

document.getElementById("audioFile").onchange = (e) => {
    document.getElementById("fileStatus").innerText = e.target.files[0]?.name || "Select MP3";
};

// --- 6. GLOBAL CONTROLS ---
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
