const DEFAULT_SETTINGS = {
  baseUrl: "https://api.midapi.ai",
  imaginePath: "/midjourney/imagine",
  statusPath: "/midjourney/message/{id}",
};

const STORAGE_KEY = "midapi-settings";
const POLL_INTERVAL = 5000;

const elements = {
  baseUrl: document.getElementById("baseUrlInput"),
  apiKey: document.getElementById("apiKeyInput"),
  discordToken: document.getElementById("discordTokenInput"),
  webhook: document.getElementById("webhookInput"),
  imaginePath: document.getElementById("imaginePathInput"),
  statusPath: document.getElementById("statusPathInput"),
  promptForm: document.getElementById("promptForm"),
  prompt: document.getElementById("promptInput"),
  negativePrompt: document.getElementById("negativePromptInput"),
  imageCount: document.getElementById("imageCountInput"),
  aspectRatio: document.getElementById("aspectRatioSelect"),
  quality: document.getElementById("qualitySelect"),
  stylize: document.getElementById("stylizeInput"),
  chaos: document.getElementById("chaosInput"),
  seed: document.getElementById("seedInput"),
  modelVersion: document.getElementById("modelVersionInput"),
  preset: document.getElementById("presetSelect"),
  referenceImages: document.getElementById("referenceImagesInput"),
  extraJson: document.getElementById("extraJsonInput"),
  liveJsonToggle: document.getElementById("liveJsonToggle"),
  jsonPreview: document.getElementById("jsonPreview"),
  jsonPreviewContent: document.getElementById("jsonPreviewContent"),
  copyJsonBtn: document.getElementById("copyJsonBtn"),
  resetFormBtn: document.getElementById("resetFormBtn"),
  clearSettingsBtn: document.getElementById("clearSettingsBtn"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  tasksContainer: document.getElementById("tasksContainer"),
  emptyState: document.getElementById("emptyState"),
  toast: document.getElementById("toast"),
  connectionStatus: document.getElementById("connectionStatus"),
};

const state = {
  tasks: new Map(),
  pollers: new Map(),
  showJsonPreview: false,
};

document.addEventListener("DOMContentLoaded", () => {
  hydrateSettings();
  bindEvents();
  updateConnectionIndicator();
  updateJsonPreview();
});

function hydrateSettings() {
  const stored = safeParse(localStorage.getItem(STORAGE_KEY)) || {};
  elements.baseUrl.value = stored.baseUrl || DEFAULT_SETTINGS.baseUrl;
  elements.apiKey.value = stored.apiKey || "";
  elements.discordToken.value = stored.discordToken || "";
  elements.webhook.value = stored.webhook || "";
  elements.imaginePath.value = stored.imaginePath || DEFAULT_SETTINGS.imaginePath;
  elements.statusPath.value = stored.statusPath || DEFAULT_SETTINGS.statusPath;
  state.showJsonPreview = Boolean(stored.showJsonPreview);
  elements.liveJsonToggle.checked = state.showJsonPreview;
  toggleJsonPreview(state.showJsonPreview);
}

function bindEvents() {
  elements.promptForm.addEventListener("submit", handleSubmit);
  elements.resetFormBtn.addEventListener("click", resetPromptForm);
  elements.copyJsonBtn.addEventListener("click", () => copyToClipboard(elements.jsonPreviewContent.textContent));
  elements.clearHistoryBtn.addEventListener("click", clearHistory);
  elements.clearSettingsBtn.addEventListener("click", clearSettings);

  elements.liveJsonToggle.addEventListener("change", (event) => {
    state.showJsonPreview = event.target.checked;
    toggleJsonPreview(state.showJsonPreview);
    persistSettings();
    updateJsonPreview();
  });

  const inputsAffectingPreview = [
    elements.prompt,
    elements.negativePrompt,
    elements.imageCount,
    elements.aspectRatio,
    elements.quality,
    elements.stylize,
    elements.chaos,
    elements.seed,
    elements.modelVersion,
    elements.preset,
    elements.referenceImages,
    elements.extraJson,
    elements.webhook,
  ];

  inputsAffectingPreview.forEach((input) => {
    input.addEventListener("input", debounce(updateJsonPreview, 200));
  });

  const settingsInputs = [
    elements.baseUrl,
    elements.apiKey,
    elements.discordToken,
    elements.webhook,
    elements.imaginePath,
    elements.statusPath,
  ];

  settingsInputs.forEach((input) => {
    input.addEventListener("input", debounce(() => {
      persistSettings();
      updateConnectionIndicator();
    }, 300));
  });

  elements.tasksContainer.addEventListener("click", handleTaskActions);
}

async function handleSubmit(event) {
  event.preventDefault();

  const prompt = elements.prompt.value.trim();
  if (!prompt) {
    showToast("Введите промпт перед отправкой");
    elements.prompt.focus();
    return;
  }

  const payload = buildRequestPayload({ silent: false });
  if (!payload) {
    return;
  }

  const imagineUrl = buildApiUrl(elements.imaginePath.value || DEFAULT_SETTINGS.imaginePath);
  const headers = buildHeaders();

  setConnectionPending();

  try {
    const response = await fetch(imagineUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Ошибка ${response.status}`);
    }

    const data = await response.json();
    const taskId = extractTaskId(data);

    if (!taskId) {
      console.warn("Не удалось определить идентификатор задачи", data);
      throw new Error("API не вернул идентификатор задачи");
    }

    const task = createTaskRecord(taskId, payload, data);
    state.tasks.set(taskId, task);
    renderTask(task);
    startPolling(taskId);
    showToast("Запрос успешно отправлен в MidAPI");
    elements.promptForm.reset();
    elements.imageCount.value = "1";
    elements.quality.value = "standard";
    elements.stylize.value = "100";
    elements.chaos.value = "0";
    toggleJsonPreview(state.showJsonPreview);
    updateJsonPreview();
    persistSettings();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Не удалось отправить запрос", true);
  } finally {
    updateConnectionIndicator();
  }
}

function buildHeaders() {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const apiKey = elements.apiKey.value.trim();
  const discordToken = elements.discordToken.value.trim();

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }

  if (discordToken) {
    headers["X-Discord-Token"] = discordToken;
  }

  return headers;
}

function buildRequestPayload({ silent = false } = {}) {
  const prompt = elements.prompt.value.trim();
  if (!prompt) {
    return null;
  }

  let extras = {};
  const extraText = elements.extraJson.value.trim();
  if (extraText) {
    try {
      extras = JSON.parse(extraText);
    } catch (error) {
      console.error("Invalid extra JSON", error);
      if (!silent) {
        showToast("Дополнительные параметры JSON заданы некорректно", true);
      }
      return null;
    }
  }

  const refs = (elements.referenceImages.value || "")
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);

  const imageCount = Number.parseInt(elements.imageCount.value, 10);
  const stylize = Number.parseFloat(elements.stylize.value);
  const chaos = Number.parseFloat(elements.chaos.value);
  const seed = elements.seed.value.trim();

  const payload = {
    prompt,
    negative_prompt: optionalString(elements.negativePrompt.value),
    num_images: Number.isFinite(imageCount) && imageCount > 0 ? imageCount : undefined,
    n: Number.isFinite(imageCount) && imageCount > 0 ? imageCount : undefined,
    aspect_ratio: optionalString(elements.aspectRatio.value),
    ar: optionalString(elements.aspectRatio.value),
    quality: optionalString(elements.quality.value),
    stylize: Number.isFinite(stylize) ? stylize : undefined,
    chaos: Number.isFinite(chaos) ? chaos : undefined,
    seed: seed ? Number(seed) : undefined,
    version: optionalString(elements.modelVersion.value),
    model: optionalString(elements.modelVersion.value),
    mode: optionalString(elements.preset.value),
    preset: optionalString(elements.preset.value),
    webhook_url: optionalString(elements.webhook.value),
    reference_images: refs.length ? refs : undefined,
  };

  const merged = mergeDeep(payload, extras);
  return sanitizePayload(merged);
}

function sanitizePayload(input) {
  if (Array.isArray(input)) {
    return input.map((item) => sanitizePayload(item)).filter((value) => value !== undefined && value !== null && value !== "");
  }

  if (input && typeof input === "object") {
    return Object.entries(input).reduce((acc, [key, value]) => {
      const sanitized = sanitizePayload(value);
      if (sanitized !== undefined && sanitized !== null && !(typeof sanitized === "string" && sanitized.trim() === "")) {
        acc[key] = sanitized;
      }
      return acc;
    }, {});
  }

  return input;
}

function mergeDeep(target, source) {
  if (!source || typeof source !== "object") {
    return target;
  }

  const output = { ...target };
  Object.entries(source).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      output[key] = value.slice();
    } else if (value && typeof value === "object") {
      output[key] = mergeDeep(output[key] || {}, value);
    } else {
      output[key] = value;
    }
  });
  return output;
}

function optionalString(value) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : undefined;
}

function buildApiUrl(pathTemplate, id) {
  const base = (elements.baseUrl.value.trim() || DEFAULT_SETTINGS.baseUrl).replace(/\/+$/, "");
  const path = (pathTemplate || "").trim() || DEFAULT_SETTINGS.imaginePath;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const resolvedPath = typeof id !== "undefined" ? normalizedPath.replace("{id}", encodeURIComponent(id)) : normalizedPath;
  return `${base}${resolvedPath}`;
}

function createTaskRecord(id, requestPayload, responsePayload) {
  return {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "queued",
    progress: 0,
    prompt: requestPayload.prompt,
    requestPayload,
    responsePayload,
    resultPayload: null,
    images: [],
    originalUrl: null,
  };
}

function renderTask(task) {
  elements.emptyState.hidden = true;
  let article = task.element;

  if (!article) {
    const template = document.getElementById("taskTemplate");
    const fragment = template.content.cloneNode(true);
    article = fragment.querySelector(".task-card");
    task.element = article;
    elements.tasksContainer.prepend(article);
  }

  const title = article.querySelector(".task-title");
  const meta = article.querySelector(".task-meta");
  const statusChip = article.querySelector(".status-chip");
  const progressBar = article.querySelector(".progress-bar span");
  const progressText = article.querySelector(".progress-text");
  const jsonDetails = article.querySelector(".task-json");
  const requestJson = article.querySelector(".request-json");
  const responseJson = article.querySelector(".response-json");
  const imagesContainer = article.querySelector(".task-images");
  const openOriginalButton = article.querySelector('[data-action="open-original"]');

  title.textContent = truncate(task.prompt, 100);
  meta.textContent = `ID: ${task.id} • ${formatRelativeTime(task.createdAt)}`;

  statusChip.textContent = task.status.toUpperCase();
  statusChip.dataset.status = task.status;

  progressBar.style.width = `${Math.max(0, Math.min(100, task.progress))}%`;
  progressText.textContent = `Прогресс: ${Math.round(task.progress)}% • обновлено ${formatRelativeTime(task.updatedAt)}`;

  requestJson.textContent = JSON.stringify(task.requestPayload, null, 2);

  if (task.resultPayload) {
    responseJson.textContent = JSON.stringify(task.resultPayload, null, 2);
  } else {
    responseJson.textContent = task.responsePayload ? JSON.stringify(task.responsePayload, null, 2) : "Ожидание ответа";
  }

  imagesContainer.innerHTML = "";
  if (task.images.length) {
    task.images.forEach((image, index) => {
      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = image.url;
      img.alt = image.description || `Изображение ${index + 1}`;
      img.loading = "lazy";
      const caption = document.createElement("figcaption");
      caption.textContent = image.description || `Вариация ${index + 1}`;
      figure.append(img, caption);
      imagesContainer.appendChild(figure);
    });
  }

  openOriginalButton.disabled = !task.originalUrl;
  openOriginalButton.dataset.url = task.originalUrl || "";

  jsonDetails.hidden = false;
}

function startPolling(taskId) {
  stopPolling(taskId);
  pollTask(taskId);
  const interval = setInterval(() => pollTask(taskId), POLL_INTERVAL);
  state.pollers.set(taskId, interval);
}

function stopPolling(taskId) {
  const interval = state.pollers.get(taskId);
  if (interval) {
    clearInterval(interval);
    state.pollers.delete(taskId);
  }
}

async function pollTask(taskId) {
  const task = state.tasks.get(taskId);
  if (!task) {
    stopPolling(taskId);
    return;
  }

  const statusUrl = buildApiUrl(elements.statusPath.value || DEFAULT_SETTINGS.statusPath, taskId);
  const headers = buildHeaders();

  try {
    const response = await fetch(statusUrl, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`Ошибка статуса ${response.status}`);
    }

    const data = await response.json();
    const normalized = normalizeStatusPayload(data);

    task.status = normalized.status;
    task.progress = normalized.progress;
    task.updatedAt = new Date().toISOString();
    task.resultPayload = data;
    task.images = normalized.images;
    task.originalUrl = normalized.originalUrl || task.originalUrl;

    renderTask(task);

    if (normalized.isFinal) {
      stopPolling(taskId);
    }
  } catch (error) {
    console.error(`Ошибка при обновлении задачи ${taskId}`, error);
    if (task.status !== "failed") {
      task.status = "failed";
      task.updatedAt = new Date().toISOString();
      renderTask(task);
    }
    stopPolling(taskId);
  }
}

function normalizeStatusPayload(data) {
  if (!data || typeof data !== "object") {
    return {
      status: "failed",
      progress: 100,
      images: [],
      originalUrl: null,
      isFinal: true,
    };
  }

  const status =
    (data.status || data.state || data.stage || data.taskStatus || "").toString().toLowerCase() || "unknown";
  const progressValue =
    Number.parseFloat(data.progress) ||
    Number.parseFloat(data.percentage) ||
    Number.parseFloat(data.percent) ||
    Number.parseFloat(data.completion) ||
    (status === "completed" ? 100 : status === "failed" ? 100 : 0);

  const result = data.result || data.response || data.data || data.output || {};
  const images = extractImages(data, result);
  const originalUrl = extractOriginalUrl(result) || data.original_url || data.originUrl;

  const normalizedStatus = normalizeStatus(status, images, progressValue);

  return {
    status: normalizedStatus.status,
    progress: normalizedStatus.progress,
    images,
    originalUrl,
    isFinal: normalizedStatus.isFinal,
  };
}

function normalizeStatus(status, images, progress) {
  const known = ["queued", "pending", "submitted", "running", "in_progress", "processing", "completed", "finished", "done", "failed", "error"];
  let normalized = status;

  if (!known.includes(status)) {
    if (status.includes("fail") || status.includes("error")) {
      normalized = "failed";
    } else if (status.includes("progress") || status.includes("process")) {
      normalized = "running";
    } else if (status.includes("queue") || status.includes("pend")) {
      normalized = "queued";
    } else if (status.includes("complete") || status.includes("finish") || status.includes("done")) {
      normalized = "completed";
    } else {
      normalized = images.length ? "completed" : "running";
    }
  }

  let normalizedProgress = Number.isFinite(progress) ? progress : 0;
  if (normalized === "completed" || normalized === "failed") {
    normalizedProgress = Math.max(progress || 0, images.length ? 100 : progress || 100);
  }

  return {
    status: normalized,
    progress: Math.max(0, Math.min(100, normalizedProgress)),
    isFinal: normalized === "completed" || normalized === "failed",
  };
}

function extractImages(data, result) {
  const urls = new Set();

  const possibleArrays = [
    data.image_urls,
    data.imageUrls,
    data.images,
    data.results,
    data.output,
    data.attachments,
    result?.image_urls,
    result?.imageUrls,
    result?.images,
    result?.results,
    result?.output,
  ];

  possibleArrays.forEach((collection) => {
    if (Array.isArray(collection)) {
      collection.forEach((item) => {
        if (typeof item === "string") {
          urls.add(item);
        } else if (item && typeof item === "object") {
          if (item.url) urls.add(item.url);
          if (item.uri) urls.add(item.uri);
          if (item.image) urls.add(item.image);
        }
      });
    } else if (collection && typeof collection === "object") {
      if (collection.url) urls.add(collection.url);
      if (collection.uri) urls.add(collection.uri);
    }
  });

  const singleCandidates = [
    data.image_url,
    data.uri,
    data.image,
    result?.image_url,
    result?.uri,
    result?.image,
  ];

  singleCandidates.forEach((candidate) => {
    if (typeof candidate === "string") {
      urls.add(candidate);
    }
  });

  return Array.from(urls).map((url, index) => ({
    url,
    description: `Изображение ${index + 1}`,
  }));
}

function extractOriginalUrl(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  return (
    result.original ||
    result.origin_url ||
    result.originUrl ||
    result.originalUrl ||
    (Array.isArray(result.attachments) && result.attachments[0] && result.attachments[0].url) ||
    null
  );
}

function extractTaskId(data) {
  if (!data || typeof data !== "object") {
    return null;
  }
  return (
    data.id ||
    data.message_id ||
    data.messageId ||
    data.task_id ||
    data.taskId ||
    data.job_id ||
    data.jobId ||
    data.data?.id ||
    data.response?.id ||
    null
  );
}

function handleTaskActions(event) {
  const button = event.target.closest("button");
  if (!button) return;

  const card = event.target.closest(".task-card");
  if (!card) return;

  const taskId = getTaskIdFromCard(card);
  if (!taskId) return;

  const action = button.dataset.action;
  switch (action) {
    case "toggle-json": {
      const details = card.querySelector(".task-json");
      details.open = !details.open;
      break;
    }
    case "refresh":
      startPolling(taskId);
      showToast("Статус обновляется");
      break;
    case "copy-result": {
      const task = state.tasks.get(taskId);
      if (task) {
        const payload = task.resultPayload || task.responsePayload;
        copyToClipboard(JSON.stringify(payload, null, 2));
      }
      break;
    }
    case "open-original": {
      const url = button.dataset.url;
      if (url) {
        window.open(url, "_blank");
      }
      break;
    }
    default:
      break;
  }
}

function getTaskIdFromCard(card) {
  const meta = card.querySelector(".task-meta");
  if (!meta) return null;
  const match = meta.textContent.match(/ID:\s([^•]+)/);
  return match ? match[1].trim() : null;
}

function resetPromptForm() {
  elements.promptForm.reset();
  elements.imageCount.value = "1";
  elements.quality.value = "standard";
  elements.stylize.value = "100";
  elements.chaos.value = "0";
  updateJsonPreview();
}

function clearHistory() {
  state.tasks.forEach((task, id) => stopPolling(id));
  state.tasks.clear();
  elements.tasksContainer.innerHTML = "";
  elements.emptyState.hidden = false;
  showToast("История очищена");
}

function clearSettings() {
  localStorage.removeItem(STORAGE_KEY);
  elements.baseUrl.value = DEFAULT_SETTINGS.baseUrl;
  elements.apiKey.value = "";
  elements.discordToken.value = "";
  elements.webhook.value = "";
  elements.imaginePath.value = DEFAULT_SETTINGS.imaginePath;
  elements.statusPath.value = DEFAULT_SETTINGS.statusPath;
  persistSettings();
  updateConnectionIndicator();
  showToast("Настройки сброшены");
}

function persistSettings() {
  const payload = {
    baseUrl: elements.baseUrl.value.trim() || DEFAULT_SETTINGS.baseUrl,
    apiKey: elements.apiKey.value.trim(),
    discordToken: elements.discordToken.value.trim(),
    webhook: elements.webhook.value.trim(),
    imaginePath: elements.imaginePath.value.trim() || DEFAULT_SETTINGS.imaginePath,
    statusPath: elements.statusPath.value.trim() || DEFAULT_SETTINGS.statusPath,
    showJsonPreview: state.showJsonPreview,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function updateConnectionIndicator() {
  const indicator = elements.connectionStatus.querySelector(".status-indicator");
  const text = elements.connectionStatus.querySelector(".status-text");

  const hasBaseUrl = Boolean(elements.baseUrl.value.trim());
  const hasKey = Boolean(elements.apiKey.value.trim());

  if (hasBaseUrl && hasKey) {
    elements.connectionStatus.classList.add("connected");
    text.textContent = "Готово к отправке";
    indicator.style.animation = "pulse 2s infinite";
  } else {
    elements.connectionStatus.classList.remove("connected");
    text.textContent = hasBaseUrl ? "Введите API ключ" : "Ожидание настроек";
    indicator.style.animation = "none";
  }
}

function setConnectionPending() {
  const text = elements.connectionStatus.querySelector(".status-text");
  text.textContent = "Отправка запроса...";
}

function toggleJsonPreview(visible) {
  elements.jsonPreview.hidden = !visible;
}

function updateJsonPreview() {
  if (!state.showJsonPreview) {
    return;
  }
  const payload = buildRequestPayload({ silent: true });
  if (!payload) {
    elements.jsonPreviewContent.textContent = "";
    return;
  }
  elements.jsonPreviewContent.textContent = JSON.stringify(payload, null, 2);
}

function formatRelativeTime(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  const diff = Date.now() - value.getTime();
  if (diff < 60000) {
    return "только что";
  }
  if (diff < 3600000) {
    const mins = Math.round(diff / 60000);
    return `${mins} мин назад`;
  }
  const hours = Math.round(diff / 3600000);
  return `${hours} ч назад`;
}

function truncate(text, limit) {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function showToast(message, isError = false) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", Boolean(isError));
  if (typeof elements.toast.showPopover === "function") {
    elements.toast.showPopover();
  } else {
    elements.toast.showModal();
  }
  setTimeout(() => {
    if (typeof elements.toast.hidePopover === "function") {
      elements.toast.hidePopover();
    } else if (typeof elements.toast.close === "function") {
      elements.toast.close();
    }
  }, 4000);
}

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard
    .writeText(text)
    .then(() => showToast("Скопировано в буфер"))
    .catch(() => showToast("Не удалось скопировать", true));
}

function debounce(fn, delay = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(null, args), delay);
  };
}

function safeParse(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.warn("Не удалось распарсить сохранённые настройки", error);
    return null;
  }
}
