const fileInput = document.getElementById("fileInput");
const algorithmSelect = document.getElementById("algorithmSelect");
const statusEl = document.getElementById("status");
const originalPreview = document.getElementById("originalPreview");
const compressedPreview = document.getElementById("compressedPreview");
const originalMeta = document.getElementById("originalMeta");
const compressedMeta = document.getElementById("compressedMeta");
const downloadLink = document.getElementById("downloadLink");

let originalImageElement = null;
let originalDataUrl = null;
let currentBlobUrl = null;
let currentBlob = null;
let currentFile = null;

fileInput.addEventListener("change", handleFileSelect);
algorithmSelect.addEventListener("change", () => processCurrentImage());

downloadLink.addEventListener("click", (event) => {
  if (downloadLink.hasAttribute("disabled")) {
    event.preventDefault();
  }
});

function resetCompressedPreview() {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
  compressedPreview.removeAttribute("src");
  compressedMeta.textContent = "";
  downloadLink.setAttribute("disabled", "true");
  downloadLink.setAttribute("aria-disabled", "true");
  downloadLink.href = "#";
}

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.classList.remove("error", "success");
  if (type === "error") {
    statusEl.classList.add("error");
  } else if (type === "success") {
    statusEl.classList.add("success");
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes === 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value < 10 && exponent > 0 ? 2 : 1)} ${units[exponent]}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

async function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Файл не распознан как изображение"));
    img.src = dataUrl;
  });
}

function getCanvasFromImage(image) {
  const width = image.naturalWidth || image.videoWidth || image.width;
  const height = image.naturalHeight || image.videoHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);
  return { canvas, ctx, width, height };
}

async function handleFileSelect(event) {
  const file = event.target.files && event.target.files[0];
  resetCompressedPreview();
  algorithmSelect.disabled = true;
  originalImageElement = null;
  originalDataUrl = null;
  currentBlob = null;
  currentFile = null;

  if (!file) {
    originalPreview.removeAttribute("src");
    originalMeta.textContent = "";
    setStatus("Файл не выбран");
    return;
  }

  if (!file.type.startsWith("image/")) {
    originalPreview.removeAttribute("src");
    originalMeta.textContent = "";
    setStatus("Пожалуйста, выберите файл изображения", "error");
    return;
  }

  try {
    setStatus("Загрузка изображения...");
    const dataUrl = await readFileAsDataUrl(file);
    originalPreview.src = dataUrl;
    originalPreview.alt = file.name;
    originalDataUrl = dataUrl;
    originalImageElement = await loadImageElement(dataUrl);
    currentFile = file;

    const { width, height } = getCanvasFromImage(originalImageElement);
    originalMeta.textContent = `${file.name} • ${width}×${height}px • ${formatBytes(file.size)}`;

    algorithmSelect.disabled = false;
    setStatus("Выберите алгоритм сжатия");
    await processCurrentImage();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Произошла ошибка при обработке файла", "error");
  }
}

async function processCurrentImage() {
  if (!originalImageElement || !originalDataUrl) {
    return;
  }

  const algorithm = algorithmSelect.value;
  resetCompressedPreview();
  setStatus("Выполняется сжатие...");

  try {
    const { canvas, ctx, width, height } = getCanvasFromImage(originalImageElement);
    if (algorithm !== "lossless") {
      const imageData = ctx.getImageData(0, 0, width, height);
      const processed = await applyAlgorithm(imageData, algorithm);
      ctx.putImageData(processed, 0, 0);
    }

    const blob = await canvasToBlob(canvas, "image/png");
    currentBlob = blob;
    const fileName = buildFileName(currentFile ? currentFile.name : "image", algorithm);
    currentBlobUrl = URL.createObjectURL(blob);
    compressedPreview.src = currentBlobUrl;
    compressedPreview.alt = fileName;

    let ratioText = "";
    if (currentFile && currentFile.size) {
      const ratio = currentFile.size > 0 ? ((blob.size / currentFile.size) * 100).toFixed(1) : "-";
      ratioText = ` • ${formatBytes(blob.size)} (${ratio}% от оригинала)`;
    } else {
      ratioText = ` • ${formatBytes(blob.size)}`;
    }

    compressedMeta.textContent = `${fileName} • ${width}×${height}px${ratioText}`;
    downloadLink.removeAttribute("disabled");
    downloadLink.removeAttribute("aria-disabled");
    downloadLink.href = currentBlobUrl;
    downloadLink.download = fileName;

    const statusText =
      ratioText && currentFile && currentFile.size
        ? `Сжатие выполнено успешно • ${formatBytes(blob.size)} (${(
            (blob.size / currentFile.size) * 100
          ).toFixed(1)}% от оригинала)`
        : `Сжатие выполнено успешно • ${formatBytes(blob.size)}`;
    setStatus(statusText, "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Не удалось создать PNG", "error");
  }
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Не удалось получить данные изображения"));
      }
    }, type);
  });
}

async function applyAlgorithm(imageData, algorithm) {
  switch (algorithm) {
    case "quantize256":
      return applyQuantization(imageData, 256, false);
    case "quantize128":
      return applyQuantization(imageData, 128, true);
    case "posterize":
      return applyPosterize(imageData, 4);
    case "grayscale":
      return applyGrayscale(imageData);
    default:
      return imageData;
  }
}

async function applyQuantization(imageData, colorCount, useDithering) {
  if (!window.iq || !iq.utils || !iq.palette) {
    throw new Error("Библиотека квантования цветов еще не загрузилась");
  }

  const distance = new iq.distance.EuclideanBT709NoAlpha();
  const pointContainer = iq.utils.PointContainer.fromUint8Array(
    imageData.data,
    imageData.width,
    imageData.height
  );

  const paletteQuantizer = colorCount > 128
    ? new iq.palette.NeuQuant(distance, colorCount)
    : new iq.palette.WuQuant(distance, colorCount);

  const palette = paletteQuantizer.quantize(pointContainer);

  let imageQuantizer;
  if (useDithering) {
    imageQuantizer = new iq.image.ErrorDiffusionArray(
      distance,
      iq.image.ErrorDiffusionArrayKernel.FloydSteinberg,
      true
    );
  } else {
    imageQuantizer = new iq.image.NearestColor(distance);
  }

  const quantized = imageQuantizer.quantize(pointContainer, palette);
  const outArray = quantized.toUint8Array();
  return new ImageData(new Uint8ClampedArray(outArray), imageData.width, imageData.height);
}

function applyPosterize(imageData, bits) {
  const levels = Math.pow(2, bits);
  const step = 255 / (levels - 1);
  const data = new Uint8ClampedArray(imageData.data);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(data[i] / step) * step;
    data[i + 1] = Math.round(data[i + 1] / step) * step;
    data[i + 2] = Math.round(data[i + 2] / step) * step;
    // альфа-канал не меняем
  }
  return new ImageData(data, imageData.width, imageData.height);
}

function applyGrayscale(imageData) {
  const data = new Uint8ClampedArray(imageData.data);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  return new ImageData(data, imageData.width, imageData.height);
}

function buildFileName(originalName, algorithm) {
  const baseName = originalName.replace(/\.[^.]+$/, "");
  return `${baseName}-${algorithm}.png`;
}

window.addEventListener("beforeunload", () => {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
  }
});
