import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, query, orderBy, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- 1. FIREBASE CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyB1XRR_Oi68prosRM6WUgcZA7hPzT-DmOk",
    authDomain: "soundboard-ce3f9.firebaseapp.com",
    projectId: "soundboard-ce3f9",
    appId: "1:554974413045:web:1a1489c5dd8bc2723bc5bc"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const audioElements = {};

// --- 2. THE IMPROVED NAME CLEANER (6-WORD LIMIT) ---
function cleanFileName(rawName) {
    let name = rawName.replace(".mp3", "");

    // Remove YouTube IDs, tmp strings, and random numbers/parentheses
    name = name.replace(/(_[a-zA-Z0-9]{11}|tmp_\d+|copy|[\(\)\d])/gi, "");
    
    // Replace underscores, dashes, and dots with spaces
    name = name.replace(/[_\-\.]+/g, " ").trim();
    
    // Capitalize Words
    let words = name.split(" ").filter(w => w.length > 0).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    // CRITICAL FIX: Trim to max 5 words
    if (words.length > 5) {
        return words.slice(0, 6).join(" ") + "...";
    }

    return words.join(" ") || "Unknown Sound";
}

// --- 3. REAL-TIME UI SYNC ---
const soundGrid = document.getElementById("soundGrid");

onSnapshot(query(collection(db, "sounds"), orderBy("createdAt", "desc")), (snapshot) => {
    soundGrid.innerHTML = ""; 
    snapshot.forEach((doc) => {
        renderSound(doc.data());
    });
    const spinner = document.querySelector(".spinner");
    if (spinner) spinner.remove();
});

function renderSound(data) {
    const card = document.createElement("div");
    card.className = "sound";
    
    const btn = document.createElement("button");
    btn.className = "small-button";
    btn.style.backgroundColor = data.color || "#6366f1";
    
    const audio = new Audio(data.audioData);
    audio.preload = "auto";
    audioElements[data.name] = audio;

    // Toggle Logic: Play if stopped, Stop if playing
    btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
            card.classList.remove("playing");
        } else {
            stopAll(); // Stops others so only one pulses
            audio.play().catch(() => {});
            card.classList.add("playing");
        }
    });
    
    // Auto-remove animation when sound ends
    audio.addEventListener("ended", () => {
        card.classList.remove("playing");
        audio.currentTime = 0;
    });
    
    audio.addEventListener("pause", () => card.classList.remove("playing"));

    const name = document.createElement("p");
    name.className = "name";
    name.innerText = data.name;

    card.appendChild(btn);
    card.appendChild(name);
    soundGrid.appendChild(card);
}

// --- 4. BULK SYNC ENGINE ---
const folderInput = document.getElementById("folderInput");
const bulkSyncBtn = document.getElementById("bulkSyncBtn");

if (bulkSyncBtn) bulkSyncBtn.onclick = () => folderInput.click();

folderInput.onchange = async (e) => {
    const files = Array.from(e.target.files).filter(file => file.name.endsWith(".mp3"));
    if (files.length === 0) return;

    bulkSyncBtn.disabled = true;
    bulkSyncBtn.innerText = "Cleaning Names...";

    const querySnapshot = await getDocs(collection(db, "sounds"));
    const existingNames = querySnapshot.docs.map(doc => doc.data().name);

    let uploadCount = 0;

    for (const file of files) {
        const cleanedName = cleanFileName(file.name);

        // Check for duplicates or size limits
        if (existingNames.includes(cleanedName) || file.size > 720000) continue;

        try {
            bulkSyncBtn.innerText = `Syncing: ${cleanedName}`;
            const base64 = await blobToBase64(file);
            
            await addDoc(collection(db, "sounds"), {
                name: cleanedName,
                audioData: base64,
                color: `hsl(${Math.random() * 360}, 70%, 60%)`,
                createdAt: serverTimestamp()
            });
            uploadCount++;
        } catch (err) { console.error(err); }
    }

    bulkSyncBtn.disabled = false;
    bulkSyncBtn.innerText = "📁 Bulk Sync Folder";
    alert(`Added ${uploadCount} sounds. All names trimmed to max 6 words.`);
};

// --- 5. INDIVIDUAL UPLOAD ---
const manualFileInput = document.getElementById("audioFile");
const submitBtn = document.getElementById("submitUpload");

submitBtn.onclick = async () => {
    const file = manualFileInput.files[0];
    if (!file || file.size > 720000) return alert("File missing or too large!");

    submitBtn.disabled = true;
    const base64 = await blobToBase64(file);
    const rawName = document.getElementById("soundName").value || file.name;
    const finalName = cleanFileName(rawName);

    await addDoc(collection(db, "sounds"), {
        name: finalName,
        audioData: base64,
        color: `hsl(${Math.random() * 360}, 70%, 60%)`,
        createdAt: serverTimestamp()
    });

    submitBtn.disabled = false;
    document.getElementById("uploadForm").classList.add("hidden");
};

function blobToBase64(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

document.getElementById("toggleUpload").onclick = () => document.getElementById("uploadForm").classList.toggle("hidden");
window.playAll = () => Object.values(audioElements).forEach(a => { a.currentTime = 0; a.play(); });
window.stopAll = () => Object.values(audioElements).forEach(a => { a.pause(); a.currentTime = 0; });
