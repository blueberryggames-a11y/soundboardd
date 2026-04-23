import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getDatabase, ref, onValue, set, onDisconnect, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- 1. FIREBASE SETUP ---
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

// --- 2. LIVE USER COUNTER (THE DEFINITIVE FIX) ---
const userCountElem = document.getElementById("userCount");
if (userCountElem) {
    onValue(ref(rtdb, 'presence/'), (snap) => {
        // We avoid snap.numChildren() entirely to prevent the TypeError.
        // We get the raw object and count the keys using standard JS.
        const data = snap.val();
        const count = data ? Object.keys(data).length : 0;
        userCountElem.innerText = count > 0 ? count : 1;
    }, (error) => {
        console.error("Presence sync error:", error);
    });

    // Mark current user as online
    const myPresenceRef = push(ref(rtdb, 'presence/'));
    onValue(ref(rtdb, '.info/connected'), (snap) => {
        if (snap.val() === true) {
            set(myPresenceRef, { online: true });
            onDisconnect(myPresenceRef).remove();
        }
    });
}

// --- 3. UTILITIES ---
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

function cleanFileName(rawName) {
    let name = rawName.replace(".mp3", "").replace(/(_[a-zA-Z0-9]{11}|tmp_\d+|copy|[\(\)\d])/gi, "");
    name = name.replace(/[_\-\.]+/g, " ").trim();
    let words = name.split(" ").filter(w => w.length > 0).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return words.length > 6 ? words.slice(0, 6).join(" ") + "..." : words.join(" ") || "Unknown Sound";
}

function blobToBase64(blob) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

// --- 4. UI & SOUNDBOARD LOGIC ---
const soundGrid = document.getElementById("soundGrid");

onSnapshot(query(collection(db, "sounds"), orderBy("createdAt", "desc")), (snapshot) => {
    // Remove spinner on first load
    const spinner = document.querySelector(".spinner");
    if (spinner) spinner.remove();
    
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
            // Check to see if we already rendered this to prevent UI glitching
            if (!document.getElementById(`card-${change.doc.id}`)) {
                renderSound(change.doc.id, change.doc.data());
            }
        }
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
        
        // Lazy-load the audio data only when clicked to keep page speed high
        if (!audioCache[id]) {
            card.classList.add("loading-audio");
            try {
                audioCache[id] = new Audio(data.audioData);
                audioCache[id].onended = () => card.classList.remove("playing");
                audioCache[id].onpause = () => card.classList.remove("playing");
            } catch (err) {
                console.error("Audio playback error:", err);
            }
            card.classList.remove("loading-audio");
        }

        const audio = audioCache[id];
        if (audio) {
            if (!audio.paused) {
                audio.pause();
                audio.currentTime = 0;
            } else {
                window.stopAll(); 
                audio.play().then(() => card.classList.add("playing")).catch(() => {});
            }
        }
    });

    const name = document.createElement("p");
    name.className = "name";
    name.innerText = data.name;

    card.appendChild(btn);
    card.appendChild(name);
    soundGrid.appendChild(card);
}

// --- 5. BULK UPLOAD TRIGGER ---
const bulkBtn = document.getElementById("bulkSyncBtn");
const folderInput = document.getElementById("folderInput");

if (bulkBtn && folderInput) {
    bulkBtn.addEventListener("click", (e) => {
        e.preventDefault();
        folderInput.click(); // This manually triggers the hidden input
    });
}

folderInput.onchange = async (e) => {
    const files = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith(".mp3"));
    if (files.length === 0) return;

    if (files.length > 20 && !confirm(`Syncing ${files.length} sounds. This might take a minute. Continue?`)) {
        e.target.value = "";
        return;
    }

    bulkBtn.disabled = true;
    for (let i = 0; i < files.length; i++) {
        bulkBtn.innerText = `Syncing ${i + 1}/${files.length}...`;
        await uploadToFirebase(files[i]);
    }

    bulkBtn.disabled = false;
    bulkBtn.innerText = "📁 Bulk Sync Folder";
    e.target.value = ""; 
};

// --- 6. UPLOAD CORE ---
async function uploadToFirebase(file, customName = null) {
    const name = customName || cleanFileName(file.name);
    
    // Firestore Documents have a 1MB limit. Base64 strings are 33% larger than raw files.
    // 700KB is the safest ceiling to avoid "Document too large" errors.
    if (file.size > 700000) { 
        console.warn(`[Skipped] ${name}: File exceeds 700KB limit.`);
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
        // Cooldown prevents Firestore from rate-limiting your burst uploads
        await sleep(650); 
        return true;
    } catch (err) {
        console.error("Upload failure:", err);
        return false;
    }
}

// Single Upload UI logic
document.getElementById("submitUpload").onclick = async () => {
    const fileInput = document.getElementById("audioFile");
    const nameInput = document.getElementById("soundName");
    const btn = document.getElementById("submitUpload");

    if (!fileInput.files[0]) return alert("Please select an MP3 file.");

    btn.disabled = true;
    btn.innerText = "Syncing...";
    const success = await uploadToFirebase(fileInput.files[0], nameInput.value.trim() || null);
    
    btn.disabled = false;
    btn.innerText = "Sync to Cloud";
    if (success) {
        nameInput.value = "";
        fileInput.value = "";
        document.getElementById("uploadForm").classList.add("hidden");
    }
};

document.getElementById("audioFile").onchange = (e) => {
    document.getElementById("fileStatus").innerText = e.target.files[0]?.name || "Select MP3";
};

// --- 7. GLOBAL CONTROLS ---
document.getElementById("toggleUpload").onclick = () => document.getElementById("uploadForm").classList.toggle("hidden");

window.stopAll = () => {
    Object.values(audioCache).forEach(a => { 
        if (a) { a.pause(); a.currentTime = 0; }
    });
    document.querySelectorAll('.sound').forEach(s => s.classList.remove('playing'));
};

window.playAll = () => {
    Object.values(audioCache).forEach(a => {
        if (a) { a.currentTime = 0; a.play().catch(() => {}); }
    });
};
