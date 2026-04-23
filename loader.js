import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, query, orderBy, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getDatabase, ref, onValue, set, onDisconnect, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- CONFIG (Your Original Credentials) ---
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

// Global cache for loaded audio to prevent redundant memory usage
const audioCache = {}; 

// --- 1. LIVE USER COUNTER (Optimized) ---
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
    // numChildren() is much more efficient than manual counting
    userCountElem.innerText = snap.numChildren() || 1;
});

// --- 2. AI-STYLE NAME CLEANER ---
function cleanFileName(rawName) {
    let name = rawName.replace(".mp3", "");
    name = name.replace(/(_[a-zA-Z0-9]{11}|tmp_\d+|copy|[\(\)\d])/gi, "");
    name = name.replace(/[_\-\.]+/g, " ").trim();
    
    let words = name.split(" ").filter(w => w.length > 0)
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    return words.length > 6 ? words.slice(0, 6).join(" ") + "..." : words.join(" ") || "Unknown Sound";
}

// --- 3. UI RENDERING (Incremental Loading) ---
const soundGrid = document.getElementById("soundGrid");

// Using docChanges() prevents the entire grid from flickering/reloading
onSnapshot(query(collection(db, "sounds"), orderBy("createdAt", "desc")), (snapshot) => {
    document.querySelector(".spinner")?.remove();
    
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
            renderSound(change.doc.id, change.doc.data());
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
    
    // LAZY LOADING: We only create the Audio object when the user clicks
    btn.addEventListener("pointerdown", async (e) => {
        e.preventDefault();

        if (!audioCache[id]) {
            // Create audio only on first interaction
            audioCache[id] = new Audio(data.audioData);
            audioCache[id].addEventListener("ended", () => card.classList.remove("playing"));
            audioCache[id].addEventListener("pause", () => card.classList.remove("playing"));
        }

        const audio = audioCache[id];

        if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
        } else {
            window.stopAll(); 
            try {
                await audio.play();
                card.classList.add("playing");
            } catch (err) {
                console.warn("Playback blocked by browser. Click the page first!");
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

// --- 4. BULK SYNC & UPLOAD ---
const folderInput = document.getElementById("folderInput");
const bulkSyncBtn = document.getElementById("bulkSyncBtn");

bulkSyncBtn.onclick = () => folderInput.click();

folderInput.onchange = async (e) => {
    const files = Array.from(e.target.files).filter(f => f.name.endsWith(".mp3"));
    if (files.length === 0) return;

    bulkSyncBtn.disabled = true;
    bulkSyncBtn.innerText = "Processing...";

    const existingDocs = await getDocs(collection(db, "sounds"));
    const existingNames = existingDocs.docs.map(d => d.data().name);

    for (const file of files) {
        const cleanedName = cleanFileName(file.name);
        
        // Safety: Base64 makes files ~33% larger. Firestore has a 1MB limit per document.
        // We limit to 700KB to be safe.
        if (existingNames.includes(cleanedName) || file.size > 700000) continue;

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

window.stopAll = () => {
    Object.values(audioCache).forEach(a => {
        a.pause();
        a.currentTime = 0;
    });
    document.querySelectorAll('.sound').forEach(s => s.classList.remove('playing'));
};

window.playAll = () => {
    // Note: This may fail in some browsers due to 'Autoplay' security policies
    Object.values(audioCache).forEach(a => {
        a.currentTime = 0;
        a.play().catch(() => {});
    });
};
