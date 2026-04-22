import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// PASTE YOUR FIREBASE CONFIG HERE
const firebaseConfig = {
    apiKey: "AIzaSyB1XRR_Oi68prosRM6WUgcZA7hPzT-DmOk",
    authDomain: "soundboard-ce3f9.firebaseapp.com",
    projectId: "soundboard-ce3f9",
    storageBucket: "soundboard-ce3f9.firebasestorage.app",
    messagingSenderId: "554974413045",
    appId: "1:554974413045:web:1a1489c5dd8bc2723bc5bc",
    measurementId: "G-N7KQJQGCZ8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const audioElements = {};

// 1. Listen for Real-time Updates
const soundGrid = document.getElementById("soundGrid");

onSnapshot(query(collection(db, "sounds"), orderBy("createdAt", "desc")), (snapshot) => {
    soundGrid.innerHTML = ""; // Clear grid
    snapshot.forEach((doc) => {
        renderSound(doc.data());
    });
    document.querySelector(".spinner")?.remove();
});

function renderSound(data) {
    const card = document.createElement("div");
    card.className = "sound";
    
    const btn = document.createElement("button");
    btn.className = "small-button";
    btn.style.backgroundColor = data.color || "#6366f1";
    
    const audio = new Audio(data.url);
    audio.preload = "auto";
    audioElements[data.name] = audio;

    // Instant Response using pointerdown
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

// 2. Upload Logic
const fileInput = document.getElementById("audioFile");
const nameInput = document.getElementById("soundName");
const submitBtn = document.getElementById("submitUpload");
const fileStatus = document.getElementById("fileStatus");

fileInput.onchange = () => {
    if (fileInput.files[0]) fileStatus.innerText = "Selected: " + fileInput.files[0].name;
};

submitBtn.onclick = async () => {
    const file = fileInput.files[0];
    if (!file) return alert("Please select an MP3 first!");

    submitBtn.disabled = true;
    submitBtn.innerText = "Uploading...";

    try {
        // Auto-name logic
        const finalName = nameInput.value || file.name.replace(".mp3", "");
        
        // Upload to Storage
        const fileRef = ref(storage, `sounds/${Date.now()}_${file.name}`);
        const uploadResult = await uploadBytes(fileRef, file);
        const url = await getDownloadURL(uploadResult.ref);

        // Save to Database (triggers sync for everyone)
        await addDoc(collection(db, "sounds"), {
            name: finalName,
            url: url,
            color: `hsl(${Math.random() * 360}, 70%, 60%)`,
            createdAt: serverTimestamp()
        });

        // Reset
        nameInput.value = "";
        fileInput.value = "";
        fileStatus.innerText = "Drop .mp3 here or click to browse";
        document.getElementById("uploadForm").classList.add("hidden");
    } catch (e) {
        console.error(e);
        alert("Upload failed. Check console.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Upload & Sync";
    }
};

// Toggle UI
document.getElementById("toggleUpload").onclick = () => {
    document.getElementById("uploadForm").classList.toggle("hidden");
};

// Global Controls
window.playAll = () => Object.values(audioElements).forEach(a => { a.currentTime = 0; a.play(); });
window.stopAll = () => Object.values(audioElements).forEach(a => { a.pause(); a.currentTime = 0; });
