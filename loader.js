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

// --- 1. LIVE USER COUNTER (THE FIX) ---
const userCountElem = document.getElementById("userCount");
if (userCountElem) {
    onValue(ref(rtdb, 'presence/'), (snap) => {
        let count = 0;
        // Robust counting: forEach is guaranteed to work on RTDB snapshots
        snap.forEach(() => {
            count++;
        });
        userCountElem.innerText = count || 1;
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

// --- 3. UI RENDERING (Optimized for speed) ---
const soundGrid = document.getElementById("soundGrid");
onSnapshot(query(collection(db, "sounds"), orderBy("createdAt", "desc")), (snapshot) => {
    const spinner = document.querySelector(".spinner");
    if (spinner) spinner.remove();
    
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
            // Guard against duplicate rendering during slow loads
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
        
        // Lazy-loading audio only when clicked to keep initial page load fast
        if (!audioCache[id]) {
            card.classList.add("loading-audio");
            try {
                audioCache[id] = new Audio(data.audioData);
                audioCache[id].onended = () => card.classList.remove("playing");
                audioCache[id].onpause = () => card.classList.remove("playing");
                // Pre-warm the audio
                audioCache[id].load();
            } catch (err) {
                console.error("Audio init error:", err);
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

// --- 4. BULK UPLOAD HANDLERS ---
const bulkBtn = document.getElementById("bulkSyncBtn");
const folderInput = document.getElementById("folderInput");

if (bulkBtn && folderInput) {
    bulkBtn.addEventListener("click", (e) => {
        e.preventDefault();
        folderInput.click();
    });
}

folderInput.onchange = async (e) => {
    const files = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith(".mp3"));
    if (files.length === 0) return;

    if (files.length > 20 && !confirm(`Uploading ${files.length} sounds. The site may lag during sync. Continue?`)) {
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

// --- 5. UPLOAD CORE ---
async function uploadToFirebase(file, customName = null) {
    const name = customName || cleanFileName(file.name);
    // Firestore max document size is 1MB. Base64 adds ~33% overhead.
    if (file.size > 720000) { 
        console.warn(`Skipped ${name}: File too large (Max 700KB)`);
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
        // Cooldown prevents the browser from freezing and Firestore from rate-limiting
        await sleep(600); 
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

    if (!fileInput.files[0]) return alert("Select an MP3 file first.");

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
    Object.values(audioCache).forEach(a => { 
        if (a) {
            a.pause(); 
            a.currentTime = 0; 
        }
    });
    document.querySelectorAll('.sound').forEach(s => s.classList.remove('playing'));
};

window.playAll = () => {
    Object.values(audioCache).forEach(a => {
        if (a) {
            a.currentTime = 0;
            a.play().catch(() => {});
        }
    });
};
