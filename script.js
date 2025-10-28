const form = document.getElementById("generationForm");
const promptInput = document.getElementById("prompt");
const qualityInput = document.getElementById("quality");
const qualityValue = document.getElementById("qualityValue");
const formStatus = document.getElementById("formStatus");
const submitButton = document.getElementById("submitButton");
const refreshButton = document.getElementById("refreshButton");
const jobsList = document.getElementById("jobsList");
const jobsEmptyState = document.getElementById("jobsEmptyState");
const jobTemplate = document.getElementById("jobTemplate");

const jobsState = new Map();
const pollingTimers = new Map();

const QUALITY_LABELS = {
  1: "Draft ×1.0",
  2: "HQ ×1.5",
  3: "Ultra ×2.0",
  4: "Max ×2.5",
};

updateQualityLabel();

qualityInput.addEventListener("input", updateQualityLabel);

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const prompt = formData.get("prompt").trim();
  const negativePrompt = formData.get("negativePrompt").trim();

  if (!prompt) {
    formStatus.textContent = "Введите подсказку для генерации";
    promptInput.focus();
    return;
  }

  const payload = {
    prompt,
    negativePrompt: negativePrompt || undefined,
    type: formData.get("type"),
    style: formData.get("style"),
    aspectRatio: formData.get("aspectRatio"),
    quality: Number(formData.get("quality")),
    remix: formData.get("remix") === "on",
  };

  try {
    toggleForm(false);
    formStatus.textContent = "Отправляем запрос в Midjourney…";

    const response = await fetch("generate.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Не удалось создать генерацию");
    }

    const jobId = data.jobId || data.id;
    if (!jobId) {
      throw new Error("API не вернул идентификатор задания");
    }

    const job = {
      id: jobId,
      prompt,
      type: payload.type,
      style: payload.style,
      aspectRatio: payload.aspectRatio,
      status: data.status || "queued",
      message: data.message || "Отправлено в очередь",
      createdAt: new Date(),
    };

    registerJob(job);
    formStatus.textContent = "Задача создана. Следим за прогрессом…";
    form.reset();
    updateQualityLabel();
    pollJob(job.id, true);
  } catch (error) {
    console.error(error);
    formStatus.textContent = error.message || "Не удалось выполнить запрос";
  } finally {
    toggleForm(true);
  }
});

refreshButton.addEventListener("click", () => {
  jobsState.forEach((job) => {
    pollJob(job.id, true);
  });
});

function updateQualityLabel() {
  const value = Number(qualityInput.value || 2);
  qualityValue.textContent = QUALITY_LABELS[value] || "Custom";
}

function toggleForm(enabled) {
  submitButton.disabled = !enabled;
  form.classList.toggle("is-loading", !enabled);
}

function registerJob(job) {
  const existing = jobsState.get(job.id);
  if (existing) {
    existing.data = { ...existing.data, ...job };
    updateJobCard(existing.element, existing.data);
    return;
  }

  const card = createJobCard(job);
  jobsState.set(job.id, { data: job, element: card });
  jobsEmptyState.hidden = true;
}

function createJobCard(job) {
  const fragment = jobTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".job-card");
  const title = card.querySelector(".job-card__title");
  const meta = card.querySelector(".job-card__meta");
  title.textContent = job.prompt.length > 120 ? `${job.prompt.slice(0, 117)}…` : job.prompt;
  meta.textContent = formatMeta(job);
  updateJobCard(card, job);
  jobsList.prepend(card);
  return card;
}

function updateJobCard(card, job) {
  card.dataset.status = job.status;
  card.querySelector(".job-card__status").textContent = statusLabel(job.status);
  card.querySelector(".job-card__message").textContent = job.message || "";

  const progressBar = card.querySelector(".job-card__progress-bar span");
  const progress = job.progress != null ? job.progress : inferProgress(job.status);
  progressBar.style.transform = `scaleX(${Math.max(0.1, progress / 100)})`;

  const meta = card.querySelector(".job-card__meta");
  meta.textContent = formatMeta(job);

  const link = card.querySelector("a");
  const cancelButton = card.querySelector("[data-cancel]");
  const mediaBlock = card.querySelector(".job-card__media");
  const img = mediaBlock.querySelector("img");
  const video = mediaBlock.querySelector("video");
  const caption = mediaBlock.querySelector("figcaption");

  if (job.status === "completed" && job.result) {
    const { imageUrl, videoUrl, text } = job.result;
    mediaBlock.hidden = false;
    caption.textContent = text || "Готово";

    if (imageUrl) {
      img.src = imageUrl;
      img.hidden = false;
    } else {
      img.hidden = true;
    }

    if (videoUrl) {
      video.src = videoUrl;
      video.hidden = false;
    } else {
      video.hidden = true;
    }

    if (!imageUrl && !videoUrl) {
      mediaBlock.hidden = true;
    }

    if (imageUrl || videoUrl) {
      link.hidden = false;
      link.href = imageUrl || videoUrl;
      link.textContent = "Открыть результат";
    } else if (job.resultUrl) {
      link.hidden = false;
      link.href = job.resultUrl;
      link.textContent = "Открыть результат";
    }
  } else {
    mediaBlock.hidden = true;
    img.hidden = true;
    video.hidden = true;
    caption.textContent = "";
    link.hidden = true;
  }

  cancelButton.hidden = job.status !== "queued" && job.status !== "processing";
  cancelButton.onclick = () => cancelJob(job.id);
}

function formatMeta(job) {
  const typeLabel = job.type === "video" ? "Видео" : "Изображение";
  const time = job.createdAt ? formatTime(job.createdAt) : "";
  const ratio = job.aspectRatio || "";
  const details = [typeLabel, ratio, job.style ? `стиль ${job.style}` : null, time].filter(Boolean);
  return details.join(" • ");
}

function formatTime(date) {
  try {
    const intl = new Intl.DateTimeFormat("ru", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    return intl.format(date instanceof Date ? date : new Date(date));
  } catch (error) {
    return "";
  }
}

function statusLabel(status) {
  switch (status) {
    case "queued":
      return "В очереди";
    case "processing":
      return "Обработка";
    case "completed":
      return "Готово";
    case "failed":
      return "Ошибка";
    case "canceled":
      return "Отменено";
    default:
      return status || "Неизвестно";
  }
}

function inferProgress(status) {
  switch (status) {
    case "queued":
      return 15;
    case "processing":
      return 55;
    case "completed":
      return 100;
    case "failed":
    case "canceled":
      return 0;
    default:
      return 25;
  }
}

async function pollJob(jobId, resetTimer = false) {
  if (resetTimer) {
    clearPolling(jobId);
  }

  const entry = jobsState.get(jobId);
  if (!entry) return;
  const { data, element } = entry;

  if (data.status === "completed" || data.status === "failed" || data.status === "canceled") {
    clearPolling(jobId);
    return;
  }

  try {
    const response = await fetch(`generate.php?jobId=${encodeURIComponent(jobId)}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Не удалось получить статус");
    }

    const updated = normalizeJobPayload(payload, data);
    jobsState.set(jobId, { data: updated, element });
    updateJobCard(element, updated);

    if (updated.status === "completed" || updated.status === "failed" || updated.status === "canceled") {
      clearPolling(jobId);
      return;
    }

    schedulePolling(jobId);
  } catch (error) {
    console.error(error);
    data.message = error.message;
    data.status = data.status || "failed";
    updateJobCard(element, data);
    clearPolling(jobId);
  }
}

function normalizeJobPayload(payload, prev) {
  const result = { ...prev };
  result.status = payload.status || prev.status || "queued";
  result.message = payload.message || prev.message;
  result.progress = payload.progress ?? payload.percentage ?? prev.progress;
  result.resultUrl = payload.result_url || payload.resultUrl || prev.resultUrl;

  if (payload.result) {
    const images = payload.result.images || payload.result.image_urls || payload.result.urls;
    const videos = payload.result.videos || payload.result.video_urls;
    const imageUrl = Array.isArray(images) ? images[0] : payload.result.image_url || null;
    const videoUrl = Array.isArray(videos) ? videos[0] : payload.result.video_url || null;
    const text = payload.result.text || payload.result.description || null;
    result.result = { imageUrl, videoUrl, text };
  } else if (payload.imageUrl || payload.videoUrl) {
    result.result = {
      imageUrl: payload.imageUrl || null,
      videoUrl: payload.videoUrl || null,
      text: payload.text || null,
    };
  }

  return result;
}

function schedulePolling(jobId) {
  clearPolling(jobId);
  const timer = setTimeout(() => pollJob(jobId), 3500);
  pollingTimers.set(jobId, timer);
}

function clearPolling(jobId) {
  const timer = pollingTimers.get(jobId);
  if (timer) {
    clearTimeout(timer);
    pollingTimers.delete(jobId);
  }
}

async function cancelJob(jobId) {
  try {
    const response = await fetch("generate.php", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Не удалось отменить задачу");
    }
    pollJob(jobId, true);
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

window.addEventListener("beforeunload", () => {
  pollingTimers.forEach((timer) => clearTimeout(timer));
  pollingTimers.clear();
});
