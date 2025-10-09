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
      setAlert('Удаляем фон...', false);
      fileListEl.innerHTML = '';
      downloadAllContainer.hidden = true;

      const processed = await Promise.all(files.map(removeBackground));
      const response = await window.uploadFilesToServer(processed.map((item) => item.file));
      sessionId = response.sessionId;

      renderResults(response.files, processed);
      setDownloadAllUrl();
      setAlert('Фон успешно удалён.', true);
    } catch (error) {
      console.error(error);
      setAlert(error.message || 'Ошибка при обработке изображений', false);
    }
  }

  async function removeBackground(file) {
    const image = await loadImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const backgroundColor = sampleCorners(imageData);
    const threshold = 50;

    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const distance = Math.sqrt(
        Math.pow(r - backgroundColor.r, 2) +
          Math.pow(g - backgroundColor.g, 2) +
          Math.pow(b - backgroundColor.b, 2)
      );
      if (distance < threshold) {
        imageData.data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const blob = await canvasToBlob(canvas, 'image/png');
    const name = file.name.replace(/\.[^.]+$/, '') + '-no-bg.png';
    const outputFile = new File([blob], name, { type: 'image/png' });
    return {
      original: file,
      file: outputFile,
      preview: canvas.toDataURL('image/png')
    };
  }

  function sampleCorners(imageData) {
    const { width, height, data } = imageData;
    const points = [
      0,
      (width - 1) * 4,
      (width * (height - 1)) * 4,
      (width * height - 1) * 4
    ];
    const color = points.reduce(
      (acc, index) => {
        acc.r += data[index];
        acc.g += data[index + 1];
        acc.b += data[index + 2];
        return acc;
      },
      { r: 0, g: 0, b: 0 }
    );
    return {
      r: Math.round(color.r / points.length),
      g: Math.round(color.g / points.length),
      b: Math.round(color.b / points.length)
    };
  }

  function renderResults(uploadedFiles, processed) {
    const map = new Map(processed.map((item) => [item.file.name, item]));
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
      meta.textContent = 'Простой алгоритм удаления фона';

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
            reject(new Error('Ошибка при создании файла'));
          }
        },
        type,
        1
      );
    });
  }
})();
