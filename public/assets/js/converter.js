(function () {
  const fileListEl = document.getElementById('fileList');
  const downloadAllContainer = document.getElementById('downloadAllContainer');
  const downloadAllBtn = document.getElementById('downloadAll');
  const alertElement = document.getElementById('uploadAlert');
  let sessionId = null;

  window.initUploader('#dropzone', handleFiles, {
    alertSelector: '#uploadAlert',
    maxFiles: 10
  });

  async function handleFiles(files) {
    try {
      setAlert('Конвертация изображений...', false);
      fileListEl.innerHTML = '';
      downloadAllContainer.hidden = true;

      const converted = await Promise.all(files.map(convertFileToWebp));
      const response = await window.uploadFilesToServer(converted.map((item) => item.file));
      sessionId = response.sessionId;

      renderResults(response.files, converted);
      setDownloadAllUrl();
      setAlert('Изображения успешно конвертированы.', true);
    } catch (error) {
      console.error(error);
      setAlert(error.message || 'Не удалось конвертировать изображения', false);
    }
  }

  async function convertFileToWebp(file) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error('Не удалось создать WebP'));
          } else {
            resolve(result);
          }
        },
        'image/webp',
        0.92
      );
    });

    const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
    const webpFile = new File([blob], name, { type: 'image/webp' });
    return {
      original: file,
      file: webpFile,
      preview: URL.createObjectURL(blob)
    };
  }

  function renderResults(uploadedFiles, converted) {
    const map = new Map(converted.map((item) => [item.file.name, item]));
    fileListEl.innerHTML = '';

    uploadedFiles.forEach((file) => {
      const info = map.get(file.name);
      const card = document.createElement('div');
      card.className = 'file-card';

      const preview = document.createElement('img');
      preview.alt = file.name;
      preview.src = info?.preview || file.url;

      const name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = file.name;

      const meta = document.createElement('div');
      meta.className = 'file-meta';
      if (info) {
        const saving = calculateSavings(info.original.size, info.file.size);
        meta.textContent = `Размер: ${formatBytes(info.file.size)} · Экономия ${saving}%`;
      }

      const actions = document.createElement('div');
      actions.className = 'actions';

      const downloadLink = document.createElement('a');
      downloadLink.className = 'btn';
      downloadLink.href = file.url;
      downloadLink.download = file.name;
      downloadLink.textContent = 'Скачать';

      actions.appendChild(downloadLink);

      card.appendChild(preview);
      card.appendChild(name);
      card.appendChild(meta);
      card.appendChild(actions);
      fileListEl.appendChild(card);
    });
  }

  function setDownloadAllUrl() {
    if (!sessionId) {
      downloadAllContainer.hidden = true;
      return;
    }
    downloadAllBtn.href = `/api/download-zip/${sessionId}`;
    downloadAllContainer.hidden = false;
  }

  function calculateSavings(originalSize, newSize) {
    if (!originalSize) return 0;
    const diff = originalSize - newSize;
    return Math.max(0, Math.round((diff / originalSize) * 100));
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Б';
    const units = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
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
})();
