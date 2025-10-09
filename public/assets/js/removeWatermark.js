(function () {
  const fileListEl = document.getElementById('fileList');
  const downloadAllContainer = document.getElementById('downloadAllContainer');
  const downloadAllBtn = document.getElementById('downloadAll');
  const alertElement = document.getElementById('uploadAlert');

  const editors = [];
  let sessionId = null;

  window.initUploader('#dropzone', handleFiles, {
    alertSelector: '#uploadAlert',
    maxFiles: 10
  });

  downloadAllBtn?.addEventListener('click', async (event) => {
    if (sessionId) {
      return;
    }
    event.preventDefault();
    await exportAll();
  });

  async function handleFiles(files) {
    editors.length = 0;
    sessionId = null;
    downloadAllContainer.hidden = false;
    downloadAllBtn.href = '#';
    downloadAllBtn.textContent = 'Сохранить всё (ZIP)';
    fileListEl.innerHTML = '';
    setAlert('Выделите области с водяными знаками и нажмите «Сохранить всё (ZIP)».', false);

    for (const file of files) {
      const editor = await createEditor(file);
      editors.push(editor);
      fileListEl.appendChild(editor.card);
    }
  }

  async function exportAll() {
    try {
      setAlert('Экспортируем изображения...', false);
      const processedFiles = await Promise.all(editors.map((editor) => editor.getOutputFile()));
      const response = await window.uploadFilesToServer(processedFiles);
      sessionId = response.sessionId;

      response.files.forEach((file) => {
        const editor = editors.find((item) => item.outputName === file.name);
        if (editor) {
          editor.setDownloadUrl(file.url);
        }
      });

      downloadAllBtn.href = `/api/download-zip/${sessionId}`;
      downloadAllBtn.textContent = 'Скачать всё (ZIP)';
      setAlert('Готово! Можно скачать отдельные файлы или архив.', true);
    } catch (error) {
      console.error(error);
      setAlert(error.message || 'Не удалось экспортировать изображения', false);
    }
  }

  async function createEditor(file) {
    const container = document.createElement('div');
    container.className = 'file-card watermark-editor';

    const title = document.createElement('div');
    title.className = 'file-name';
    title.textContent = file.name;

    const meta = document.createElement('div');
    meta.className = 'file-meta';
    meta.textContent = 'Нарисуйте кистью область с водяным знаком.';

    const actions = document.createElement('div');
    actions.className = 'actions';

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn';
    clearBtn.type = 'button';
    clearBtn.textContent = 'Очистить выделение';

    const downloadLink = document.createElement('a');
    downloadLink.className = 'btn';
    downloadLink.textContent = 'Скачать';
    downloadLink.hidden = true;

    actions.appendChild(clearBtn);
    actions.appendChild(downloadLink);

    const canvasWrapper = document.createElement('div');
    canvasWrapper.className = 'canvas-wrapper';

    const resultCanvas = document.createElement('canvas');
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.className = 'mask-overlay';

    canvasWrapper.appendChild(resultCanvas);
    canvasWrapper.appendChild(overlayCanvas);

    container.appendChild(canvasWrapper);
    container.appendChild(title);
    container.appendChild(meta);
    container.appendChild(actions);

    const image = await loadImage(file);
    const width = image.width;
    const height = image.height;

    resultCanvas.width = overlayCanvas.width = width;
    resultCanvas.height = overlayCanvas.height = height;

    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = width;
    baseCanvas.height = height;
    const baseCtx = baseCanvas.getContext('2d');
    baseCtx.drawImage(image, 0, 0);

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.clearRect(0, 0, width, height);

    const overlayCtx = overlayCanvas.getContext('2d');
    overlayCtx.clearRect(0, 0, width, height);

    const resultCtx = resultCanvas.getContext('2d');
    resultCtx.drawImage(baseCanvas, 0, 0);

    let drawing = false;
    const brushSize = Math.max(20, Math.round(Math.min(width, height) * 0.03));

    overlayCanvas.addEventListener('pointerdown', (event) => {
      drawing = true;
      overlayCanvas.setPointerCapture(event.pointerId);
      drawPoint(event);
    });

    overlayCanvas.addEventListener('pointermove', (event) => {
      if (!drawing) return;
      drawPoint(event);
    });

    overlayCanvas.addEventListener('pointerup', (event) => {
      drawing = false;
      overlayCanvas.releasePointerCapture(event.pointerId);
      applyMask();
    });

    overlayCanvas.addEventListener('pointerleave', () => {
      drawing = false;
    });

    function drawPoint(event) {
      const rect = overlayCanvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * width;
      const y = ((event.clientY - rect.top) / rect.height) * height;

      overlayCtx.fillStyle = 'rgba(37, 99, 235, 0.35)';
      overlayCtx.beginPath();
      overlayCtx.arc(x, y, brushSize, 0, Math.PI * 2);
      overlayCtx.fill();

      maskCtx.globalCompositeOperation = 'source-over';
      maskCtx.fillStyle = '#fff';
      maskCtx.beginPath();
      maskCtx.arc(x, y, brushSize, 0, Math.PI * 2);
      maskCtx.fill();
    }

    clearBtn.addEventListener('click', () => {
      overlayCtx.clearRect(0, 0, width, height);
      maskCtx.clearRect(0, 0, width, height);
      applyMask(true);
    });

    let outputBlob = await canvasToBlob(baseCanvas, 'image/png');
    let outputName = file.name.replace(/\.[^.]+$/, '') + '-clean.png';

    async function applyMask(reset = false) {
      if (reset) {
        resultCtx.clearRect(0, 0, width, height);
        resultCtx.drawImage(baseCanvas, 0, 0);
        overlayCtx.clearRect(0, 0, width, height);
        maskCtx.clearRect(0, 0, width, height);
        outputBlob = await canvasToBlob(baseCanvas, 'image/png');
        downloadLink.hidden = true;
        meta.textContent = 'Нарисуйте кистью область с водяным знаком.';
        return;
      }

      const workCanvas = document.createElement('canvas');
      workCanvas.width = width;
      workCanvas.height = height;
      const workCtx = workCanvas.getContext('2d');
      workCtx.drawImage(baseCanvas, 0, 0);
      workCtx.globalCompositeOperation = 'destination-out';
      workCtx.drawImage(maskCanvas, 0, 0);

      const blurredCanvas = document.createElement('canvas');
      blurredCanvas.width = width;
      blurredCanvas.height = height;
      const blurredCtx = blurredCanvas.getContext('2d');
      blurredCtx.filter = 'blur(12px)';
      blurredCtx.drawImage(baseCanvas, 0, 0);
      blurredCtx.globalCompositeOperation = 'destination-in';
      blurredCtx.drawImage(maskCanvas, 0, 0);

      workCtx.globalCompositeOperation = 'destination-over';
      workCtx.drawImage(blurredCanvas, 0, 0);

      resultCtx.clearRect(0, 0, width, height);
      resultCtx.drawImage(workCanvas, 0, 0);

      outputBlob = await canvasToBlob(resultCanvas, 'image/png');
      meta.textContent = 'Область обработана. Нажмите «Сохранить всё (ZIP)».';
    }

    function setDownloadUrl(url) {
      downloadLink.href = url;
      downloadLink.download = outputName;
      downloadLink.hidden = false;
    }

    return {
      card: container,
      getOutputFile: async () => new File([outputBlob], outputName, { type: 'image/png' }),
      setDownloadUrl,
      outputName
    };
  }

  function setAlert(message, success) {
    if (!alertElement) return;
    alertElement.textContent = message;
    alertElement.hidden = !message;
    alertElement.style.background = success
      ? 'rgba(16, 185, 129, 0.18)'
      : 'rgba(248, 113, 113, 0.15)';
    alertElement.style.color = success ? '#047857' : '#b91c1c';
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Не удалось загрузить изображение'));
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Ошибка при обработке canvas'));
          }
        },
        type,
        1
      );
    });
  }
})();
