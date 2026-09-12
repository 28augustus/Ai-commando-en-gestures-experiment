const URL = "https://teachablemachine.withgoogle.com/models/e8z50xZTW/";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

let model;
let modelBelofte;
let webcam;
let labelContainer;
let maxPredictions;
let recognition;

let microfoonActief = false;
let spraakBezig = false;
let cameraActief = false;

let wachtendeOpdracht = null;
let bevestigingGereed = false;

const micButton = document.getElementById("mic-toggle-button");
const spraakStatus = document.getElementById("spraak-status");
const herkendeTekst = document.getElementById("herkende-tekst");
const actieVak = document.getElementById("actie");
const systeemStatus = document.getElementById("systeem-status");
const webcamContainer = document.getElementById("webcam-container");
const webcamPlaceholder = document.getElementById("webcam-placeholder");

if (!SpeechRecognition) {
  micButton.disabled = true;

  spraakStatus.textContent =
    "Spraakherkenning wordt niet ondersteund. Gebruik Chrome of Edge.";
} else {
  recognition = new SpeechRecognition();

  recognition.lang = "nl-NL";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  micButton.addEventListener("click", () => {
    if (microfoonActief) {
      zetMicrofoonUit();
    } else {
      zetMicrofoonAan();
    }
  });

  recognition.onstart = () => {
    spraakBezig = true;
  };

  recognition.onresult = async (event) => {
    const resultaat = event.results[event.resultIndex];

    if (!resultaat.isFinal) {
      return;
    }

    const gesprokenTekst = resultaat[0].transcript;

    herkendeTekst.textContent = `"${gesprokenTekst}"`;

    /*
      Er is al een opdracht gevonden en de gebruiker moet nu
      eerst met een handgebaar bevestigen of annuleren.

      De microfoon blijft aan, maar nieuwe zinnen worden genegeerd.
    */
    if (wachtendeOpdracht !== null) {
      return;
    }

    const opdracht = herkenOpdracht(gesprokenTekst);

    if (opdracht === null) {
      spraakStatus.textContent =
        "Geen Bubbels-opdracht herkend. Ik blijf luisteren.";

      return;
    }

    wachtendeOpdracht = opdracht;
    bevestigingGereed = false;

    spraakStatus.textContent =
      `Opdracht herkend: ${opdracht.tekst}. Camera wordt gestart.`;

    /*
      Belangrijk:
      Hier staat GEEN recognition.stop().
      De microfoon blijft dus luisteren.
    */
    await startCamera();

    toonActie(
      `Ik herkende: ${opdracht.tekst}. ` +
        "Laat eerst kort geen handgebaar zien.",
      "#fff7e6",
      "#9a5b00",
    );
  };

  recognition.onerror = (event) => {
    if (event.error === "no-speech" || event.error === "aborted") {
      return;
    }

    spraakStatus.textContent = "Spraakherkenning: " + event.error;
  };

  recognition.onend = () => {
    spraakBezig = false;

    /*
      Chrome kan spraakherkenning zelf stoppen, bijvoorbeeld na stilte.
      Zolang de gebruiker de microfoon niet handmatig heeft uitgezet,
      starten we hem automatisch opnieuw.
    */
    if (microfoonActief) {
      setTimeout(() => {
        startLuisteren();
      }, 300);
    }
  };
}

async function zetMicrofoonAan() {
  microfoonActief = true;

  micButton.textContent = "Microfoon uitschakelen";
  micButton.classList.add("mic-actief");

  systeemStatus.className = "status-chip status-aan";
  systeemStatus.innerHTML =
    '<span class="status-dot"></span> Microfoon luistert';

  spraakStatus.textContent = "Microfoon is aan. Handmodel wordt voorbereid.";

  // Laadt het handmodel alvast, zonder de camera te starten.
  laadHandModel();

  await startLuisteren();
}

function zetMicrofoonUit() {
  microfoonActief = false;
  wachtendeOpdracht = null;
  bevestigingGereed = false;

  if (spraakBezig) {
    recognition.stop();
  }

  stopCamera();

  micButton.textContent = "Microfoon inschakelen";
  micButton.classList.remove("mic-actief");

  systeemStatus.className = "status-chip status-uit";
  systeemStatus.innerHTML =
    '<span class="status-dot"></span> Microfoon uit';

  spraakStatus.textContent = "Microfoon staat uit.";

  toonActie(
    "Microfoon staat uit. Er wordt niet geluisterd.",
    "#eaf1ff",
    "#1e3a8a",
  );
}

async function startLuisteren() {
  // Niet opnieuw starten als hij al luistert of bewust uit staat.
  if (!microfoonActief || spraakBezig) {
    return;
  }

  try {
    recognition.start();

    spraakStatus.textContent = "Ik luister naar Bubbels-opdrachten.";
  } catch (error) {
    /*
      Soms ontvangt de browser twee start-opdrachten vlak na elkaar.
      Dan doet de automatische herstart in onend later een nieuwe poging.
    */
  }
}

async function laadHandModel() {
  if (!modelBelofte) {
    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    modelBelofte = tmImage.load(modelURL, metadataURL);
  }

  model = await modelBelofte;
  maxPredictions = model.getTotalClasses();

  return model;
}

async function startCamera() {
  if (cameraActief) {
    return;
  }

  await laadHandModel();

  webcam = new tmImage.Webcam(320, 320, true);

  await webcam.setup();
  await webcam.play();

  webcamContainer.innerHTML = "";
  webcamContainer.appendChild(webcam.canvas);

  webcamPlaceholder.classList.add("verborgen");

  cameraActief = true;

  maakVoorspellingsBalken();

  window.requestAnimationFrame(loop);
}

function stopCamera() {
  if (!cameraActief) {
    return;
  }

  webcam.stop();

  webcamContainer.innerHTML = "";
  webcamPlaceholder.classList.remove("verborgen");

  cameraActief = false;
}

function maakVoorspellingsBalken() {
  if (labelContainer) {
    return;
  }

  labelContainer = document.getElementById("label-container");

  for (let i = 0; i < maxPredictions; i++) {
    const row = document.createElement("div");

    row.className = "prediction-row";

    row.innerHTML = `
      <div class="label"></div>
      <div class="bar-background">
        <div class="bar-fill"></div>
      </div>
      <div class="percentage">0%</div>
    `;

    labelContainer.appendChild(row);
  }
}

async function loop() {
  if (!cameraActief) {
    return;
  }

  webcam.update();

  await predict();

  if (cameraActief) {
    window.requestAnimationFrame(loop);
  }
}

async function predict() {
  const prediction = await model.predict(webcam.canvas);

  let besteLabel = "";
  let hoogsteKans = 0;

  for (let i = 0; i < maxPredictions; i++) {
    const label = prediction[i].className;
    const kans = prediction[i].probability;
    const percentage = Math.round(kans * 100);

    const row = labelContainer.children[i];

    row.querySelector(".label").textContent = label;
    row.querySelector(".percentage").textContent = percentage + "%";
    row.querySelector(".bar-fill").style.width = percentage + "%";

    if (kans > hoogsteKans) {
      hoogsteKans = kans;
      besteLabel = label;
    }
  }

  if (wachtendeOpdracht === null) {
    return;
  }

  // Eerst moet het model een neutrale positie herkennen.
  if (!bevestigingGereed) {
    if (besteLabel === "Niks" && hoogsteKans >= 0.85) {
      bevestigingGereed = true;

      toonActie(
        `Wil je ${wachtendeOpdracht.tekst}? ` +
          "Open hand = bevestigen. Vuist = annuleren.",
        "#fff7e6",
        "#9a5b00",
      );
    }

    return;
  }

  if (hoogsteKans < 0.85) {
    return;
  }

  if (besteLabel === "Palm") {
    const afgerondeTekst = wachtendeOpdracht.tekst;

    wachtendeOpdracht = null;
    bevestigingGereed = false;

    toonActie(
      `Bevestigd: ${afgerondeTekst}.`,
      "#e7f8ed",
      "#166534",
    );

    spraakStatus.textContent =
      "Opdracht bevestigd. Ik blijf luisteren naar Bubbels-opdrachten.";

    rondOpdrachtAf();
  }

  if (besteLabel === "Vuist") {
    const afgerondeTekst = wachtendeOpdracht.tekst;

    wachtendeOpdracht = null;
    bevestigingGereed = false;

    toonActie(
      `Geannuleerd: ${afgerondeTekst} wordt niet uitgevoerd.`,
      "#ffe9e9",
      "#b42318",
    );

    spraakStatus.textContent =
      "Opdracht geannuleerd. Ik blijf luisteren naar Bubbels-opdrachten.";

    rondOpdrachtAf();
  }
}

function rondOpdrachtAf() {
  setTimeout(() => {
    stopCamera();

    if (microfoonActief) {
      spraakStatus.textContent =
        "Camera staat weer uit. Ik luister naar Bubbels-opdrachten.";
    }
  }, 2500);
}

function herkenOpdracht(tekst) {
  const zin = tekst.toLowerCase().trim();

  if (!zin.includes("bubbels")) {
    return null;
  }

  const isLamp = zin.includes("lamp");
  const isTelevisie = zin.includes("televis") || /\btv\b/.test(zin);

  const isAan = /\baan\b/.test(zin);
  const isUit = /\buit\b/.test(zin);

  if (isLamp && isAan) {
    return {
      tekst: "de lamp aanzetten",
    };
  }

  if (isLamp && isUit) {
    return {
      tekst: "de lamp uitzetten",
    };
  }

  if (isTelevisie && isAan) {
    return {
      tekst: "de televisie aanzetten",
    };
  }

  if (isTelevisie && isUit) {
    return {
      tekst: "de televisie uitzetten",
    };
  }

  return null;
}

function toonActie(tekst, achtergrondKleur, tekstKleur) {
  actieVak.textContent = tekst;
  actieVak.style.backgroundColor = achtergrondKleur;
  actieVak.style.color = tekstKleur;
}