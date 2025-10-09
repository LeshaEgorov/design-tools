(function () {
  const fileListEl = document.getElementById('fileList');
  const downloadAllContainer = document.getElementById('downloadAllContainer');
  const downloadAllBtn = document.getElementById('downloadAll');
  const alertElement = document.getElementById('uploadAlert');

  let sessionId = null;

  const uploader = window.initUploader('#dropzone', handleFiles, {
    alertSelector: '#uploadAlert',
    maxFiles: 10
  });

  async function handleFiles(files) {
    try {
      const imageCompression = await (window.imageCompressionReady || Promise.resolve(window.imageCompression));
      if (!imageCompression) {
        uploader.showAlert('Библиотека сжатия не загружена.');
        return;
      }

      setAlert('Обработка изображений...', false);
      fileListEl.innerHTML = '';
      downloadAllContainer.hidden = true;

      const compressed = await Promise.all(
        files.map(async (file) => {
          const options = {
            useWebWorker: true,
            maxIteration: 15,
            initialQuality: 0.9,
            fileType: 'image/png'
          };
          const output = await imageCompression(file, options);
          const name = file.name.replace(/\.png$/i, '') + '-compressed.png';
          const compressedFile = new File([output], name, { type: 'image/png' });
          return {
            original: file,
            compressed: compressedFile
          };
        })
      );

      const filesToUpload = compressed.map((item) => item.compressed);
      const response = await window.uploadFilesToServer(filesToUpload);
      sessionId = response.sessionId;

      renderResults(response.files, compressed);
      setDownloadAllUrl();
      setAlert('Файлы успешно сжаты и загружены.', true);
    } catch (error) {
      console.error(error);
      uploader.showAlert(error.message || 'Ошибка при обработке файлов');
    }
  }

  function renderResults(uploadedFiles, compressedPairs) {
    fileListEl.innerHTML = '';
    const pairsByName = new Map(
      compressedPairs.map((pair) => [pair.compressed.name, pair])
    );

    uploadedFiles.forEach((file) => {
      const pair = pairsByName.get(file.name);
      const card = document.createElement('div');
      card.className = 'file-card';

      const preview = document.createElement('img');
      preview.alt = file.name;
      preview.src = URL.createObjectURL(pair?.compressed || pair?.original);

      const name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = file.name;

      const meta = document.createElement('div');
      meta.className = 'file-meta';
      if (pair) {
        const savings = calculateSavings(pair.original.size, pair.compressed.size);
        meta.textContent = `Экономия ${savings}% · Было ${formatBytes(pair.original.size)} → Стало ${formatBytes(pair.compressed.size)}`;
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

  function calculateSavings(originalSize, compressedSize) {
    if (!originalSize) {
      return 0;
    }
    const diff = originalSize - compressedSize;
    const percent = (diff / originalSize) * 100;
    return Math.max(0, Math.round(percent));
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Б';
    const units = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  function setAlert(message, success) {
    if (!alertElement) return;
    if (!message) {
      alertElement.hidden = true;
      return;
    }
    alertElement.textContent = message;
    alertElement.hidden = false;
    alertElement.style.background = success
      ? 'rgba(16, 185, 129, 0.18)'
      : 'rgba(248, 113, 113, 0.15)';
    alertElement.style.color = success ? '#047857' : '#b91c1c';
  }
})();
