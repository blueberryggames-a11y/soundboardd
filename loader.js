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

// --- 2. REAL-TIME UI SYNC ---
const soundGrid = document.getElementById("soundGrid");

onSnapshot(query(collection(db, "sounds"), orderBy("createdAt", "desc")), (snapshot) => {
    soundGrid.innerHTML = ""; 
    snapshot.forEach((doc) => {
        renderSound(doc.data());
    });
    const spinner = document.querySelector(".spinner");
    if (spinner) spinner.remove();
});

// --- 3. RENDER CARD WITH TOGGLE LOGIC ---
function renderSound(data) {
    const card = document.createElement("div");
    card.className = "sound";
    
    const btn = document.createElement("button");
    btn.className = "small-button";
    btn.style.backgroundColor = data.color || "#6366f1";
    
    const audio = new Audio(data.audioData);
    audio.preload = "auto";
    audioElements[data.name] = audio;

    // TOGGLE LOGIC: Play if stopped, Stop if playing
    btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();

        if (!audio.paused) {
            // If it's already playing, stop it
            audio.pause();
            audio.currentTime = 0;
            card.classList.remove("playing");
        } else {
            // OPTIONAL: Stop all other sounds before starting this one 
            // Remove the next line if you want sounds to overlap
            stopAll(); 

            audio.play().catch(err => console.warn("Playback blocked"));
            card.classList.add("playing");
        }
    });
    
    // FIX: Remove animation immediately when audio naturally ends
    audio.addEventListener("ended", () => {
        card.classList.remove("playing");
        audio.currentTime = 0;
    });

    // FIX: Also remove animation if audio is manually paused via stopAll()
    audio.addEventListener("pause", () => {
        card.classList.remove("playing");
    });

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

if (bulkSyncBtn) {
    bulkSyncBtn.onclick = () => folderInput.click();
}

folderInput.onchange = async (e) => {
    const files = Array.from(e.target.files).filter(file => file.name.endsWith(".mp3"));
    if (files.length === 0) return alert("No MP3 files found!");

    bulkSyncBtn.disabled = true;
    bulkSyncBtn.innerText = "Checking...";

    const querySnapshot = await getDocs(collection(db, "sounds"));
    const existingNames = querySnapshot.docs.map(doc => doc.data().name);

    let uploadCount = 0;

    for (const file of files) {
        const cleanName = file.name.replace(".mp3", "").replace(/-/g, " ");
        if (existingNames.includes(cleanName) || file.size > 720000) continue;

        try {
            bulkSyncBtn.innerText = `Syncing: ${cleanName}...`;
            const base64 = await blobToBase64(file);
            await addDoc(collection(db, "sounds"), {
                name: cleanName,
                audioData: base64,
                color: `hsl(${Math.random() * 360}, 70%, 60%)`,
                createdAt: serverTimestamp()
            });
            uploadCount++;
        } catch (err) { console.error(err); }
    }

    bulkSyncBtn.disabled = false;
    bulkSyncBtn.innerText = "📁 Bulk Sync Folder";
    alert(`Sync Complete! Added ${uploadCount} new sounds.`);
};

// --- 5. MANUAL UPLOAD ---
const manualFileInput = document.getElementById("audioFile");
const submitBtn = document.getElementById("submitUpload");

submitBtn.onclick = async () => {
    const file = manualFileInput.files[0];
    if (!file || file.size > 720000) return alert("File missing or too large!");

    submitBtn.disabled = true;
    const base64 = await blobToBase64(file);
    const name = document.getElementById("soundName").value || file.name.replace(".mp3", "");

    await addDoc(collection(db, "sounds"), {
        name: name,
        audioData: base64,
        color: `hsl(${Math.random() * 360}, 70%, 60%)`,
        createdAt: serverTimestamp()
    });

    submitBtn.disabled = false;
    document.getElementById("uploadForm").classList.add("hidden");
};

// --- HELPERS ---
function blobToBase64(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

document.getElementById("toggleUpload").onclick = () => document.getElementById("uploadForm").classList.toggle("hidden");

// Updated Global Controls
window.playAll = () => Object.values(audioElements).forEach(a => { a.currentTime = 0; a.play(); });
window.stopAll = () => Object.values(audioElements).forEach(a => { 
    a.pause(); 
    a.currentTime = 0; 
});
