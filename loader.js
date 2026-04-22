const spinnerElement = document.querySelector(".spinner");
const containerElement = document.querySelector(".flex-container");
const audioElements = {};
let hasLoaded = false;

async function loadSoundboard() {
  try {
    // Cache bust the JSON file so we always get the newest sound list
    const response = await fetch(`sounds.json?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json();
    
    // Use a Document Fragment for performance. 
    // This allows us to build all the buttons in memory and push them to the screen all at once.
    const fragment = document.createDocumentFragment();

    data.sounds.forEach(sound => {
      // 1. Preload audio in JS memory (No need to clutter the DOM with <audio> tags)
      const audio = new Audio(sound.mp3);
      audio.preload = "auto";
      audioElements[sound.name] = audio;

      // 2. Build the Sound Card
      const soundElement = document.createElement("div");
      soundElement.classList.add("sound");

      // 3. Build the Button
      const buttonElement = document.createElement("button");
      buttonElement.classList.add("small-button");
      buttonElement.style.backgroundColor = sound.color;

      // CRITICAL UPGRADE: 'pointerdown' fires instantly on touch/click with zero delay.
      buttonElement.addEventListener("pointerdown", (e) => {
        e.preventDefault(); // Prevents ghost-clicks
        const a = audioElements[sound.name];
        a.currentTime = 0; // Reset to start instantly
        
        // Catch handles the error if browsers block audio before user interaction
        a.play().catch(err => console.warn("Audio playback prevented:", err));
      });

      // 4. Build the Label
      const nameElement = document.createElement("p");
      nameElement.classList.add("name");
      nameElement.innerText = sound.name;

      // 5. Assemble
      soundElement.appendChild(buttonElement);
      soundElement.appendChild(nameElement);
      fragment.appendChild(soundElement);
    });

    // Push everything to the screen at once
    containerElement.appendChild(fragment);
    spinnerElement?.remove();
    hasLoaded = true;
    console.log(`${data.sounds.length} sounds loaded!`);

  } catch (error) {
    displayError(`Error loading soundboard: ${error.message}`);
  }
}

// Reusable error display
function displayError(message) {
  const errorMessageElement = document.createElement("h3");
  errorMessageElement.style.color = "#ef4444";
  errorMessageElement.innerText = message;
  containerElement.appendChild(errorMessageElement);
  spinnerElement?.remove();
}

// Timeout fallback
setTimeout(() => {
  if (!hasLoaded) {
    displayError("An unknown error occurred while trying to load the soundboard.");
  }
}, 7000);

// Global Audio Controls
function playAll() {
  Object.values(audioElements).forEach(audio => {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  });
}

function stopAll() {
  Object.values(audioElements).forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
}

// Initialize
loadSoundboard();
