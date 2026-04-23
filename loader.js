import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, query, orderBy, serverTimestamp, limit, startAfter } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getDatabase, ref, onValue, set, onDisconnect, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// --- 1. FIREBASE SETUP ---
const firebaseConfig = {
    apiKey: "AIzaSyBa2orhKFThmsjBYcnIoM1iml2xNhOmjh8",
    authDomain: "newsound-15fa5.firebaseapp.com",
    projectId: "newsound-15fa5",
    databaseURL: "https://newsound-15fa5-default-rtdb.firebaseio.com",
    storageBucket: "newsound-15fa5.appspot.com",   // ← ADD THIS to your firebaseConfig
    appId: "1:29777437103:web:f038577254c76c38168f5a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const storage = getStorage(app);

// audioCache stores Audio objects keyed by doc ID — only created on first click
const audioCache = {};

// --- 2. LIVE USER COUNTER ---
const userCountElem = document.getElementById("userCount");
if (userCountElem) {
    onValue(ref(rtdb, 'presence/'), (snap) => {
        const val = snap.val();
        userCountElem.innerText = val ? Object.keys(val).length : 1;
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
let lastVisible = null;
let isLoading = false;
let allLoaded = false;
const BATCH_SIZE = 20;

// Sentinel triggers next page load when scrolled into view
const sentinel = document.createElement("div");
sentinel.id = "sentinel";
sentinel.style.cssText = "height:20px;width:100%;";
soundGrid.after(sentinel);

async function loadBatch() {
    if (isLoading || allLoaded) return;
    isLoading = true;

    try {
        const q = lastVisible
            ? query(collection(db, "sounds"), orderBy("createdAt", "desc"), startAfter(lastVisible), limit(BATCH_SIZE))
            : query(collection(db, "sounds"), orderBy("createdAt", "desc"), limit(BATCH_SIZE));

        const snap = await getDocs(q);

        document.querySelector(".spinner")?.remove();

        if (snap.empty) {
            allLoaded = true;
            sentinel.innerText = "No more sounds.";
            observer.unobserve(sentinel); // Stop watching — nothing left to load
            return;
        }

        lastVisible = snap.docs[snap.docs.length - 1];

        // Build all cards in a DocumentFragment — one DOM write instead of many
        const fragment = document.createDocumentFragment();
        snap.forEach((doc) => {
            if (!document.getElementById(`card-${doc.id}`)) {
                fragment.appendChild(buildCard(doc.id, doc.data()));
            }
        });
        soundGrid.appendChild(fragment);

    } catch (err) {
        console.error("Batch load error:", err);
    } finally {
        isLoading = false;
    }
}

const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadBatch();
}, { rootMargin: "200px" }); // Start loading 200px before user hits the bottom

observer.observe(sentinel);

// --- 4. SOUND CARD BUILDER ---
// Separated from renderSound so we can batch into a fragment above.
// Audio is NOT created here — only on first click.
function buildCard(id, data) {
    const card = document.createElement("div");
    card.className = "sound";
    card.id = `card-${id}`;

    const btn = document.createElement("button");
    btn.className = "small-button";
    btn.style.backgroundColor = data.color || "#6366f1";

    btn.addEventListener("pointerdown", async (e) => {
        e.preventDefault();

        // First click: create Audio from Storage URL (tiny metadata fetch, no full download yet)
        if (!audioCache[id]) {
            card.classList.add("loading-audio");
            try {
                // data.url is just a short HTTPS string — loads instantly from Firestore
                const audio = new Audio();
                audio.preload = "none"; // Don't download until .play() is called
                audio.src = data.url;
                audio.onended = () => card.classList.remove("playing");
                audio.onpause = () => card.classList.remove("playing");
                audioCache[id] = audio;
            } catch (err) {
                console.error("Audio init error:", err);
                card.classList.remove("loading-audio");
                return;
            }
            card.classList.remove("loading-audio");
        }

        const audio = audioCache[id];
        if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
        } else {
            stopAll(); // Stop anything currently playing
            audio.play()
                .then(() => card.classList.add("playing"))
                .catch((err) => console.warn("Playback error:", err));
        }
    });

    const name = document.createElement("p");
    name.className = "name";
    name.innerText = data.name;

    card.appendChild(btn);
    card.appendChild(name);
    return card;
}

// --- 5. UTILITIES ---
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

function cleanFileName(rawName) {
    let name = rawName
        .replace(/\.mp3$/i, "")
        .replace(/(_[a-zA-Z0-9]{11}|tmp_\d+|copy|[\(\)\d])/gi, "")
        .replace(/[_\-\.]+/g, " ")
        .trim();
    const words = name.split(" ")
        .filter(w => w.length > 0)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return words.length > 6
        ? words.slice(0, 6).join(" ") + "..."
        : words.join(" ") || "Unknown Sound";
}

// --- 6. UPLOAD: Now uses Firebase Storage ---
// Stores the file in Storage, saves a short URL in Firestore.
// A 700KB MP3 stays as a 700KB binary — not inflated to 933KB of base64.
async function uploadToFirebase(file, customName = null) {
    if (file.size > 700_000) return false;

    const name = customName || cleanFileName(file.name);
    const fileRef = storageRef(storage, `sounds/${Date.now()}_${file.name}`);

    try {
        // Upload raw binary — much faster than base64 encoding + Firestore write
        const snapshot = await uploadBytes(fileRef, file);
        const url = await getDownloadURL(snapshot.ref);

        await addDoc(collection(db, "sounds"), {
            name,
            url,   // ← Short URL string instead of full base64 blob
            color: `hsl(${Math.random() * 360}, 70%, 60%)`,
            createdAt: serverTimestamp()
        });

        await sleep(300); // Brief pause between bulk uploads to avoid rate limits
        return true;
    } catch (err) {
        console.error("Upload error:", err);
        return false;
    }
}

// --- 7. UPLOAD UI HANDLERS ---
const bulkBtn = document.getElementById("bulkSyncBtn");
const folderInput = document.getElementById("folderInput");

if (bulkBtn && folderInput) {
    bulkBtn.onclick = () => folderInput.click();

    folderInput.onchange = async (e) => {
        const files = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith(".mp3"));
        if (!files.length) return;

        bulkBtn.disabled = true;
        for (let i = 0; i < files.length; i++) {
            bulkBtn.innerText = `Syncing ${i + 1}/${files.length}...`;
            await uploadToFirebase(files[i]);
        }
        location.reload();
    };
}

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

document.getElementById("audioFile").onchange = (e) => {
    document.getElementById("fileStatus").innerText = e.target.files[0]?.name || "Select MP3";
};

// --- 8. GLOBAL CONTROLS ---
document.getElementById("toggleUpload").onclick = () =>
    document.getElementById("uploadForm").classList.toggle("hidden");

function stopAll() {
    Object.values(audioCache).forEach(a => {
        if (a && !a.paused) { a.pause(); a.currentTime = 0; }
    });
    document.querySelectorAll(".sound.playing").forEach(s => s.classList.remove("playing"));
}

window.stopAll = stopAll;

window.playAll = () => {
    Object.values(audioCache).forEach(a => {
        if (a) { a.currentTime = 0; a.play().catch(() => {}); }
    });
};
