const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const app = express();
const port = process.env.LOCAL_API_PORT || 5001;
const mlApiBaseURL = process.env.ML_API_BASE_URL || "http://127.0.0.1:8000";

const dataDir = path.join(__dirname, "data");
const uploadsDir = path.join(__dirname, "uploads");
const photosDbPath = path.join(dataDir, "photos.json");
const albumsDbPath = path.join(dataDir, "albums.json");
const actionsDbPath = path.join(dataDir, "actions.json");

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use("/uploads", express.static(uploadsDir));

const ensureStorage = async () => {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });
  try {
    await fs.access(photosDbPath);
  } catch {
    await fs.writeFile(photosDbPath, "[]", "utf-8");
  }
  try {
    await fs.access(albumsDbPath);
  } catch {
    await fs.writeFile(albumsDbPath, "[]", "utf-8");
  }
  try {
    await fs.access(actionsDbPath);
  } catch {
    await fs.writeFile(actionsDbPath, "[]", "utf-8");
  }
};

const readPhotos = async () => {
  return readJsonSafe(photosDbPath, []);
};

const writePhotos = async (photos) => {
  await withWriteLock(photosDbPath, () => writeJsonAtomic(photosDbPath, photos));
};

const readAlbums = async () => {
  return readJsonSafe(albumsDbPath, []);
};

const writeAlbums = async (albums) => {
  await withWriteLock(albumsDbPath, () => writeJsonAtomic(albumsDbPath, albums));
};

const readActions = async () => {
  return readJsonSafe(actionsDbPath, []);
};

const writeActions = async (actions) => {
  await withWriteLock(actionsDbPath, () => writeJsonAtomic(actionsDbPath, actions));
};

const tryParseWithTrim = (raw, fallback) => {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const isArray = trimmed.startsWith("[");
  const isObject = trimmed.startsWith("{");
  if (!isArray && !isObject) return null;

  const lastClose = isArray ? trimmed.lastIndexOf("]") : trimmed.lastIndexOf("}");
  if (lastClose === -1) return null;
  const candidate = trimmed.slice(0, lastClose + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};

const readJsonSafe = async (filePath, fallback) => {
  const readWithRetry = async () => {
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (err) {
      if (err && err.code === "EBUSY") {
        return null;
      }
      throw err;
    }
  };

  let raw = await readWithRetry();
  if (raw === null) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      raw = await readWithRetry();
      if (raw !== null) break;
    }
  }

  if (raw === null) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch {
    const recovered = tryParseWithTrim(raw, fallback);
    if (recovered !== null) {
      await withWriteLock(filePath, () => writeJsonAtomic(filePath, recovered));
      return recovered;
    }
    // Backup corrupt file and reset.
    const backup = `${filePath}.corrupt.${Date.now()}.bak`;
    await fs.writeFile(backup, raw, "utf-8");
    await withWriteLock(filePath, () => writeJsonAtomic(filePath, fallback));
    return fallback;
  }
};

const writeJsonAtomic = async (filePath, data) => {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
  const payload = JSON.stringify(data, null, 2);
  await fs.writeFile(tempPath, payload, "utf-8");
  const attemptWrite = async () => {
    try {
      await fs.rename(tempPath, filePath);
      return true;
    } catch (err) {
      if (err && (err.code === "ENOENT" || err.code === "EPERM" || err.code === "EBUSY")) {
        try {
          await fs.copyFile(tempPath, filePath);
          await fs.unlink(tempPath).catch(() => {});
          return true;
        } catch (copyErr) {
          if (copyErr && copyErr.code !== "EBUSY") {
            throw copyErr;
          }
        }
        return false;
      }
      throw err;
    }
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const ok = await attemptWrite();
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
  }
  await fs.unlink(tempPath).catch(() => {});
};

const writeLocks = new Map();
const withWriteLock = async (filePath, fn) => {
  const prev = writeLocks.get(filePath) || Promise.resolve();
  let resolveNext;
  const next = new Promise((resolve) => (resolveNext = resolve));
  writeLocks.set(filePath, prev.then(() => next));
  try {
    await prev;
    return await fn();
  } finally {
    resolveNext();
    if (writeLocks.get(filePath) === next) {
      writeLocks.delete(filePath);
    }
  }
};

const logAction = async ({ userID, type, title, description, responseTime = 0, meta = {} }) => {
  const actions = await readActions();
  actions.push({
    id: crypto.randomUUID(),
    userID: userID || "local-user",
    type,
    title,
    description,
    responseTime,
    date: new Date().toISOString(),
    meta,
  });
  await writeActions(actions);
};

const proxyJson = async (method, endpoint, body) => {
  const url = `${mlApiBaseURL}${endpoint}`;
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { detail: text || "Non-JSON response from ML backend" };
    }
    return { ok: response.ok, status: response.status, data: json };
  } catch (err) {
    return {
      ok: false,
      status: 503,
      data: {
        detail: `ML backend unreachable at ${mlApiBaseURL}`,
        error: err && err.message ? err.message : String(err),
      },
    };
  }
};

const getExtFromDataUrl = (dataUrl) => {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  if (!match) {
    return "jpg";
  }
  const mime = match[1].toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
};

const saveBase64Image = async (base64DataUrl, id) => {
  const marker = ";base64,";
  const idx = base64DataUrl.indexOf(marker);
  if (idx === -1) {
    throw new Error("Invalid base64 image payload");
  }
  const ext = getExtFromDataUrl(base64DataUrl);
  const base64 = base64DataUrl.slice(idx + marker.length);
  const filename = `${id}.${ext}`;
  const filepath = path.join(uploadsDir, filename);
  await fs.writeFile(filepath, Buffer.from(base64, "base64"));
  return filename;
};

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/status", (_req, res) => {
  res.json({ status: true });
});

app.get("/ml/status", async (_req, res) => {
  const result = await proxyJson("GET", "/status");
  if (!result.ok) {
    return res.status(result.status).json({
      status: false,
      detail: result.data?.detail || "ML backend unavailable",
    });
  }
  res.json(result.data || { status: true });
});

app.get("/photos", async (req, res) => {
  const userID = req.query.userID;
  const photos = await readPhotos();
  const filtered = userID
    ? photos.filter((photo) => photo.userID === userID)
    : photos;
  res.json(filtered);
});

app.post("/photos", async (req, res) => {
  const { photos } = req.body || {};
  if (!Array.isArray(photos) || photos.length === 0) {
    return res.status(400).json({ error: "Expected non-empty photos array" });
  }

  const existing = await readPhotos();
  const now = new Date().toISOString();
  const created = [];
  const userID = req.body.userID || "local-user";

  for (const photo of photos) {
    const id = crypto.randomUUID();
    const filename = await saveBase64Image(photo.base64, id);
    const stored = {
      id,
      userID,
      name: photo.name,
      width: photo.width,
      height: photo.height,
      tags: Array.isArray(photo.tags) ? photo.tags : [],
      description: typeof photo.description === "string" ? photo.description : "",
      createdAt: now,
      src: `http://127.0.0.1:${port}/uploads/${filename}`,
    };
    existing.push(stored);
    created.push(stored);
  }

  await writePhotos(existing);
  await logAction({
    userID,
    type: "photo_upload",
    title: `Uploaded ${created.length} photo${created.length === 1 ? "" : "s"}`,
    description: created.map((p) => p.name).join(", "),
    responseTime: 120 + created.length * 10,
    meta: {
      photoIDs: created.map((p) => p.id),
      tagsAssigned: created.reduce((sum, p) => sum + p.tags.length, 0),
    },
  });
  res.status(201).json(created);
});

app.delete("/photos/:id", async (req, res) => {
  const { id } = req.params;
  const userID = req.query.userID;
  const photos = await readPhotos();
  const index = photos.findIndex((photo) => {
    const idMatch = photo.id === id;
    if (!userID) return idMatch;
    return idMatch && photo.userID === userID;
  });

  if (index === -1) {
    return res.status(404).json({ error: "Photo not found" });
  }

  const [deleted] = photos.splice(index, 1);
  await writePhotos(photos);

  const albums = await readAlbums();
  const updatedAlbums = albums.map((album) => {
    return {
      ...album,
      photoIDs: Array.isArray(album.photoIDs)
        ? album.photoIDs.filter((photoID) => photoID !== id)
        : [],
    };
  });
  await writeAlbums(updatedAlbums);

  try {
    const filePath = path.join(uploadsDir, path.basename(deleted.src));
    await fs.unlink(filePath);
  } catch {
    // Ignore missing file errors and keep metadata deletion successful.
  }

  await logAction({
    userID,
    type: "photo_delete",
    title: `Deleted photo '${deleted.name}'`,
    description: deleted.id,
    responseTime: 80,
    meta: { photoID: deleted.id },
  });

  res.status(204).send();
});

app.patch("/photos/:id/tags", async (req, res) => {
  const { id } = req.params;
  const { userID, tag, action } = req.body || {};
  if (typeof tag !== "string" || tag.trim().length === 0) {
    return res.status(400).json({ error: "Tag is required" });
  }
  const normalizedTag = tag.trim().toLowerCase();
  const mode = action === "remove" ? "remove" : "add";

  const photos = await readPhotos();
  const index = photos.findIndex((photo) => {
    const idMatch = photo.id === id;
    if (!userID) return idMatch;
    return idMatch && photo.userID === userID;
  });
  if (index === -1) {
    return res.status(404).json({ error: "Photo not found" });
  }

  const photo = photos[index];
  const currentTags = Array.isArray(photo.tags) ? photo.tags : [];
  if (mode === "add") {
    if (!currentTags.includes(normalizedTag)) {
      currentTags.push(normalizedTag);
    }
    photo.tags = currentTags;
  } else {
    photo.tags = currentTags.filter((t) => t !== normalizedTag);
  }
  photos[index] = photo;
  await writePhotos(photos);

  await logAction({
    userID: userID || photo.userID,
    type: "photo_tag_update",
    title: `${mode === "add" ? "Added" : "Removed"} tag '${normalizedTag}'`,
    description: `Photo '${photo.name}'`,
    responseTime: 40,
    meta: { photoID: id, tag: normalizedTag, action: mode },
  });

  res.json({ id, tags: photo.tags });
});

app.get("/albums", async (req, res) => {
  const userID = req.query.userID;
  const albums = await readAlbums();
  const filtered = userID
    ? albums.filter((album) => album.userID === userID)
    : albums;
  res.json(filtered);
});

app.post("/albums", async (req, res) => {
  const { name, photoIDs, userID } = req.body || {};
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Album name is required" });
  }
  const id = crypto.randomUUID();
  const album = {
    id,
    name: name.trim(),
    userID: userID || "local-user",
    photoIDs: Array.isArray(photoIDs) ? [...new Set(photoIDs)] : [],
  };
  const albums = await readAlbums();
  albums.push(album);
  await writeAlbums(albums);
  await logAction({
    userID: album.userID,
    type: "album_create",
    title: `Created album '${album.name}'`,
    description: `${album.photoIDs.length} photo(s)`,
    responseTime: 60,
    meta: { albumID: album.id, photoCount: album.photoIDs.length },
  });
  res.status(201).json(album);
});

app.delete("/albums/:id", async (req, res) => {
  const { id } = req.params;
  const userID = req.query.userID;
  const albums = await readAlbums();
  const index = albums.findIndex((album) => {
    const idMatch = album.id === id;
    if (!userID) return idMatch;
    return idMatch && album.userID === userID;
  });
  if (index === -1) {
    return res.status(404).json({ error: "Album not found" });
  }
  const [deleted] = albums.splice(index, 1);
  await writeAlbums(albums);
  await logAction({
    userID: deleted.userID,
    type: "album_delete",
    title: `Deleted album '${deleted.name}'`,
    description: `${deleted.photoIDs.length} photo(s)`,
    responseTime: 40,
    meta: { albumID: deleted.id, photoCount: deleted.photoIDs.length },
  });
  res.status(204).send();
});

app.get("/actions", async (req, res) => {
  const userID = req.query.userID;
  const actions = await readActions();
  const filtered = userID ? actions.filter((a) => a.userID === userID) : actions;
  filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  res.json({ actions: filtered });
});

app.post("/ml/classify", async (req, res) => {
  const startedAt = Date.now();
  const result = await proxyJson("POST", "/classify", req.body);
  if (!result.ok) {
    return res.status(result.status).json(result.data);
  }

  const classifyData = Array.isArray(result.data) ? result.data : [];
  const tagsAssigned = classifyData.reduce((sum, item) => {
    return sum + (Array.isArray(item.tags) ? item.tags.length : 0);
  }, 0);

  await logAction({
    userID: req.query.userID || req.body?.userID || "local-user",
    type: "classify",
    title: `Classified ${classifyData.length} photo${classifyData.length === 1 ? "" : "s"}`,
    description: `Assigned ${tagsAssigned} tag${tagsAssigned === 1 ? "" : "s"}`,
    responseTime: Date.now() - startedAt,
    meta: { tagsAssigned, photos: classifyData.length },
  });

  res.json(result.data);
});

app.get("/ml/faces/:userID", async (req, res) => {
  const result = await proxyJson("GET", `/faces/${req.params.userID}/`);
  if (!result.ok) {
    return res.status(result.status).json(result.data);
  }
  res.json(result.data);
});

app.patch("/ml/faces/:userID/:personID/rename", async (req, res) => {
  const { userID, personID } = req.params;
  const result = await proxyJson("PATCH", `/faces/${userID}/${personID}/rename`, req.body || {});
  if (!result.ok) {
    return res.status(result.status).json(result.data);
  }
  res.json(result.data || { ok: true });
});

app.delete("/ml/faces/:userID/:photoID", async (req, res) => {
  const { userID, photoID } = req.params;
  const result = await proxyJson("DELETE", `/faces/${userID}/${photoID}/`);
  if (!result.ok) {
    return res.status(result.status).json(result.data);
  }
  res.json(result.data || []);
});

app.post("/ml/faces/:userID/process", async (req, res) => {
  const startedAt = Date.now();
  const { userID } = req.params;
  const result = await proxyJson("POST", `/faces/${userID}/process`, req.body);
  if (!result.ok) {
    return res.status(result.status).json(result.data);
  }

  const numFaces = typeof result.data === "number" ? result.data : 0;
  await logAction({
    userID,
    type: "face_process",
    title: `Processed faces for user '${userID}'`,
    description: `Detected ${numFaces} face${numFaces === 1 ? "" : "s"}`,
    responseTime: Date.now() - startedAt,
    meta: { numFaces },
  });
  res.json(result.data);
});

app.get("/stats", async (req, res) => {
  const userID = req.query.userID;
  const photos = await readPhotos();
  const albums = await readAlbums();
  const actions = await readActions();

  const filteredPhotos = userID ? photos.filter((p) => p.userID === userID) : photos;
  const filteredAlbums = userID ? albums.filter((a) => a.userID === userID) : albums;
  const filteredActions = userID ? actions.filter((a) => a.userID === userID) : actions;

  let storageBytes = 0;
  await Promise.all(
    filteredPhotos.map(async (photo) => {
      try {
        const filePath = path.join(uploadsDir, path.basename(photo.src));
        const stat = await fs.stat(filePath);
        storageBytes += stat.size;
      } catch {
        // Skip missing files.
      }
    })
  );

  const tagsAssigned = filteredPhotos.reduce((sum, p) => sum + (p.tags || []).length, 0);
  res.json({
    photosProcessed: filteredPhotos.length,
    tagsAssigned,
    storageBytes,
    albums: filteredAlbums.length,
    actions: filteredActions.length,
  });
});

const start = async () => {
  await ensureStorage();
  app.listen(port, () => {
    console.log(`Local API listening on http://127.0.0.1:${port}`);
  });
};

start().catch((err) => {
  console.error("Failed to start local API:", err);
  process.exit(1);
});
