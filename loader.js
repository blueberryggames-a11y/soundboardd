import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// !!! REPLACE WITH YOUR CONFIG !!!
const firebaseConfig = {
    apiKey: "AIzaSyB1XRR_Oi68prosRM6WUgcZA7hPzT-DmOk",
    authDomain: "soundboard-ce3f9.firebaseapp.com",
    projectId: "soundboard-ce3f9",
    appId: "1:554974413045:web:1a1489c5dd8bc2723bc5bc"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const audioElements = {};
const BASE_SOUNDS = ["vine-boom.mp3", "bruh.mp3"]; 

// 1. Real-time Listener
const soundGrid = document.getElementById("soundGrid");

onSnapshot(query(collection(db, "sounds"), orderBy("createdAt", "desc")), (snapshot) => {
    if (snapshot.empty) seedDatabase(); // Runs if the cloud is empty

    soundGrid.innerHTML = ""; 
    snapshot.forEach((doc) => {
        renderSound(doc.data());
    });
    document.querySelector(".spinner")?.remove();
});

// 2. Render Card
function renderSound(data) {
    const card = document.createElement("div");
    card.className = "sound";
    const btn = document.createElement("button");
    btn.className = "small-button";
    btn.style.backgroundColor = data.color || "#6366f1";
    
    // We play the Base64 string directly
    const audio = new Audio(data.audioData);
    audio.preload = "auto";
    audioElements[data.name] = audio;

    btn.addEventListener("pointerdown", () => {
        audio.currentTime = 0;
        audio.play();
        card.classList.add("playing");
    });
    
    audio.onended = () => card.classList.remove("playing");
    const name = document.createElement("p");
    name.className = "name";
    name.innerText = data.name;

    card.appendChild(btn);
    card.appendChild(name);
    soundGrid.appendChild(card);
}

// 3. Auto-Seeding (Local folder -> Firestore)
async function seedDatabase() {
    console.log("Seeding base sounds...");
    for (const file of BASE_SOUNDS) {
        try {
            const res = await fetch(`sounds/${file}`);
            const blob = await res.blob();
            const base64 = await blobToBase64(blob);
            await addDoc(collection(db, "sounds"), {
                name: file.replace(".mp3", ""),
                audioData: base64,
                color: "#6366f1",
                createdAt: serverTimestamp()
            });
        } catch (e) { console.error("Seeding failed for " + file, e); }
    }
}

// 4. User Upload Logic
const fileInput = document.getElementById("audioFile");
const submitBtn = document.getElementById("submitUpload");

submitBtn.onclick = async () => {
    const file = fileInput.files[0];
    if (!file) return alert("Select an MP3!");
    if (file.size > 750000) return alert("File too big! Keep sounds under 700KB (approx 10-15 seconds).");

    submitBtn.disabled = true;
    submitBtn.innerText = "Encoding...";

    const base64 = await blobToBase64(file);
    const name = document.getElementById("soundName").value || file.name.replace(".mp3", "");

    await addDoc(collection(db, "sounds"), {
        name: name,
        audioData: base64,
        color: `hsl(${Math.random() * 360}, 70%, 60%)`,
        createdAt: serverTimestamp()
    });

    submitBtn.disabled = false;
    submitBtn.innerText = "Upload to Cloud";
    document.getElementById("uploadForm").classList.add("hidden");
};

// Helpers
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
