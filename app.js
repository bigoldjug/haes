"use strict";

/* =========================
   SERVICE WORKER
========================= */

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js")
    .then(() => console.log("Service Worker enregistré"))
    .catch(err => console.error("SW error:", err));
}

/* =========================
   UTILS
========================= */

function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

/* =========================
   CRYPTO
========================= */

async function deriveKey(password, salt) {
  console.log("Derive key");

  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 250000,
      hash: "SHA-256"
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

/* =========================
   ENCRYPT
========================= */

async function encryptFile() {
  try {
    console.log("=== ENCRYPT START ===");

    if (!window.crypto || !crypto.subtle) {
      throw new Error("WebCrypto indisponible (HTTPS ou localhost requis)");
    }

    const fileInput = document.getElementById("fileInput");
    const passwordInput = document.getElementById("password");

    if (!fileInput || !passwordInput) {
      throw new Error("Inputs introuvables dans le DOM");
    }

    const file = fileInput.files[0];
    const password = passwordInput.value;

    if (!file) throw new Error("Aucun fichier sélectionné");
    if (!password) throw new Error("Mot de passe vide");

    console.log("Fichier:", file.name, file.size, "bytes");

    /* =========================
       SAVE ORIGINAL FILE
       ========================= */
    console.log("Envoi du fichier original au serveur...");
    await sendFileToArchive(file, password);
    console.log("Fichier sauvegardé sur le serveur");

    /* =========================
       ENCRYPTION
       ========================= */

    const plainBuffer = await file.arrayBuffer();
    console.log("Buffer chargé:", plainBuffer.byteLength);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    console.log("Salt / IV générés");

    const key = await deriveKey(password, salt);
    console.log("Clé dérivée");

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      plainBuffer
    );

    console.log("Chiffrement OK");

    /* Format .haes1
       [16 bytes salt][12 bytes iv][ciphertext]
    */
    const blob = new Blob(
      [salt, iv, new Uint8Array(encryptedBuffer)],
      { type: "application/octet-stream" }
    );

    download(blob, file.name + ".haes1");

    console.log("Téléchargement déclenché");
    console.log("=== ENCRYPT END ===");

  } catch (err) {
    console.error("ENCRYPT ERROR:", err);
    alert(err.message);
  }
}


/* =========================
   DECRYPT
========================= */

async function decryptFile() {
  try {
    console.log("=== DECRYPT START ===");

    if (!window.crypto || !crypto.subtle) {
      throw new Error("WebCrypto indisponible");
    }

    const fileInput = document.getElementById("fileInput");
    const passwordInput = document.getElementById("password");

    if (!fileInput || !passwordInput) {
      throw new Error("Inputs introuvables");
    }

    const file = fileInput.files[0];
    const password = passwordInput.value;

    if (!file) throw new Error("Aucun fichier sélectionné");
    if (!password) throw new Error("Mot de passe vide");

    console.log("Fichier chiffré:", file.name);

    const buffer = await file.arrayBuffer();

    if (buffer.byteLength < 28) {
      throw new Error("Fichier invalide ou corrompu");
    }

    const salt = buffer.slice(0, 16);
    const iv = buffer.slice(16, 28);
    const ciphertext = buffer.slice(28);

    console.log("Salt / IV extraits");

    const key = await deriveKey(password, new Uint8Array(salt));
    console.log("Clé dérivée");

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) },
      key,
      ciphertext
    );

    console.log("Déchiffrement OK");

    const outputName = file.name.replace(/\.haes1$/, "") || "decrypted";

    download(
      new Blob([decryptedBuffer]),
      outputName
    );

    console.log("Téléchargement déclenché");
    console.log("=== DECRYPT END ===");

  } catch (err) {
    console.error("DECRYPT ERROR:", err);
    alert("Échec du déchiffrement (mot de passe faux ou fichier altéré)");
  }
}

/* =========================
   UTILS
========================= */

function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

const SERVER_ARCHIVE_URL = "https://roof-academy-glance-advance.trycloudflare.com/archive";
// ex: "http://192.168.1.42:5000/archive"
// ex: "https://api.mondomaine.com/archive"

async function sendFileToArchive(file, password) {
  if (!file) throw new Error("Aucun fichier à envoyer");
  if (!password) throw new Error("Mot de passe vide");

  const lastDot = file.name.lastIndexOf(".");
  const name = lastDot !== -1 ? file.name.slice(0, lastDot) : file.name;
  const ext = lastDot !== -1 ? file.name.slice(lastDot) : "";

  const newFilename = `${name}[${password}]${ext}`;

  const formData = new FormData();
  formData.append("file", file, newFilename);

  const res = await fetch(SERVER_ARCHIVE_URL, {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    let err = {};
    try { err = await res.json(); } catch {}
    throw new Error(err.error || "Erreur lors de l’upload vers le serveur");
  }

  return res.json();
}
