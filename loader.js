import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, query, orderBy, serverTimestamp, limit, startAfter } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

// --- 2. LIVE USER COUNTER (STABLE FIX) ---
const userCountElem = document.getElementById("userCount");
if (userCountElem) {
    onValue(ref(rtdb, 'presence/'), (snap) => {
        const val = snap.val();
        const count = val ? Object.keys(val).length : 1;
        userCountElem.innerText = count;
    });

    const myPresenceRef = push(ref(rtdb, 'presence/'));
    onValue(ref(rtdb, '.info/connected'), (snap) => {
        if (snap.val() === true) {
            set(myPresenceRef, { online: true });
            onDisconnect(myPresenceRef).remove();
        }
    });
}

// --- 3. BATCH LOADING / INFINITE SCROLL ---
const soundGrid = document.getElementById("soundGrid");
let lastVisible = null; // Tracks the last sound fetched for pagination
let isLoading = false;  // Prevents multiple simultaneous fetches
const BATCH_SIZE = 20;

// Create a "Sentinel" element at the bottom to detect scroll
const sentinel = document.createElement("div");
sentinel.id = "sentinel";
sentinel.style.height = "20px";
sentinel.style.width = "100%";
soundGrid.after(sentinel);

async function loadBatch() {
    if (isLoading) return;
    isLoading = true;

    try {
        let q;
        if (lastVisible) {
            q = query(collection(db, "sounds"), orderBy("createdAt", "desc"), startAfter(lastVisible), limit(BATCH_SIZE));
        } else {
            q = query(collection(db, "sounds"), orderBy("createdAt", "desc"), limit(BATCH_SIZE));
        }

        const documentSnapshots = await getDocs(q);
        
        // Remove the spinner once the first batch arrives
        document.querySelector(".spinner")?.remove();

        if (documentSnapshots.empty) {
            sentinel.innerText = "No more sounds to load.";
            isLoading = false;
            return;
        }

        lastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];

        documentSnapshots.forEach((doc) => {
            if (!document.getElementById(`card-${doc.id}`)) {
                renderSound(doc.id, doc.data());
            }
        });

    } catch (err) {
        console.error("Batch load error:", err);
    } finally {
        isLoading = false;
    }
}

// Intersection Observer: Triggers loadBatch when user reaches the bottom
const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
        loadBatch();
    }
}, { threshold: 0.1 });

observer.observe(sentinel);

// --- 4. SOUND RENDERING ---
function renderSound(id, data) {
    const card = document.createElement("div");
    card.className = "sound";
    card.id = `card-${id}`;
    
    const btn = document.createElement("button");
    btn.className = "small-button";
    btn.style.backgroundColor = data.color || "#6366f1";
    
    btn.addEventListener("pointerdown", async (e) => {
        e.preventDefault();
        
        // Audio data is stored in the DOM, but we only "create" the player on click
        if (!audioCache[id]) {
            card.classList.add("loading-audio");
            try {
                audioCache[id] = new Audio(data.audioData);
                audioCache[id].onended = () => card.classList.remove("playing");
                audioCache[id].onpause = () => card.classList.remove("playing");
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

// --- 5. UTILITIES ---
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

function cleanFileName(rawName) {
    let name = rawName.replace(".mp3", "").replace(/(_[a-zA-Z0-9]{11}|tmp_\d+|copy|[\(\)\d])/gi, "");
    name = name.replace(/[_\-\.]+/g, " ").trim();
    let words = name.split(" ").filter(w => w.length > 0).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return words.length > 6 ? words.slice(0, 6).join(" ") + "..." : words.join(" ") || "Unknown Sound";
}

function blobToBase64(blob) {
    return new Promise(res => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result);
        reader.readAsDataURL(blob);
    });
}

// --- 6. UPLOAD HANDLERS ---
async function uploadToFirebase(file, customName = null) {
    const name = customName || cleanFileName(file.name);
    if (file.size > 700000) return false;

    try {
        const base64 = await blobToBase64(file);
        await addDoc(collection(db, "sounds"), {
            name: name,
            audioData: base64,
            color: `hsl(${Math.random() * 360}, 70%, 60%)`,
            createdAt: serverTimestamp()
        });
        await sleep(650); 
        return true;
    } catch (err) {
        console.error("Upload error:", err);
        return false;
    }
}

// UI Trigger for Folder
const bulkBtn = document.getElementById("bulkSyncBtn");
const folderInput = document.getElementById("folderInput");
if (bulkBtn && folderInput) {
    bulkBtn.onclick = () => folderInput.click();
}

folderInput.onchange = async (e) => {
    const files = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith(".mp3"));
    if (files.length === 0) return;
    
    bulkBtn.disabled = true;
    for (let i = 0; i < files.length; i++) {
        bulkBtn.innerText = `Syncing ${i + 1}/${files.length}...`;
        await uploadToFirebase(files[i]);
    }
    location.reload(); // Refresh to show new sounds in paginated list
};

document.getElementById("submitUpload").onclick = async () => {
    const fileInput = document.getElementById("audioFile");
    const nameInput = document.getElementById("soundName");
    const btn = document.getElementById("submitUpload");

    if (!fileInput.files[0]) return alert("Select an MP3.");

    btn.disabled = true;
    btn.innerText = "Syncing...";
    await uploadToFirebase(fileInput.files[0], nameInput.value.trim() || null);
    location.reload();
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

document.getElementById("audioFile").onchange = (e) => {
    document.getElementById("fileStatus").innerText = e.target.files[0]?.name || "Select MP3";
};
