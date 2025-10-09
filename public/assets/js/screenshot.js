(function () {
  if (!window.html2canvas) {
    console.warn('html2canvas is not loaded. Screenshot tool disabled.');
    return;
  }

  const fileListEl = document.getElementById('fileList');
  const downloadAllContainer = document.getElementById('downloadAllContainer');
  const downloadAllBtn = document.getElementById('downloadAll');
  const alertElement = document.getElementById('uploadAlert');
  const capturePageBtn = document.getElementById('capturePage');
  const captureSelectionBtn = document.getElementById('captureSelection');

  const captured = [];
  let sessionId = null;
  let selectionActive = false;
  let highlightEl = null;

  capturePageBtn?.addEventListener('click', async () => {
    await captureAndStore(document.documentElement, 'page');
  });

  captureSelectionBtn?.addEventListener('click', () => {
    if (selectionActive) {
      stopSelection();
    } else {
      startSelection();
    }
  });

  async function captureAndStore(element, label) {
    try {
      setAlert('Создаём скриншот...', false);
      const file = await captureElement(element, label);
      captured.push({ file, preview: URL.createObjectURL(file), label });
      await uploadCaptured();
      setAlert('Скриншот готов!', true);
    } catch (error) {
      console.error(error);
      setAlert(error.message || 'Не удалось создать скриншот', false);
    }
  }

  async function uploadCaptured() {
    const files = captured.map((item) => item.file);
    const response = await window.uploadFilesToServer(files);
    sessionId = response.sessionId;
    renderResults(response.files);
  }

  function renderResults(uploadedFiles) {
    downloadAllContainer.hidden = uploadedFiles.length === 0;
    if (!uploadedFiles.length) {
      fileListEl.innerHTML = '';
      return;
    }

    fileListEl.innerHTML = '';
    uploadedFiles.forEach((file, index) => {
      const card = document.createElement('div');
      card.className = 'file-card';

      const preview = document.createElement('img');
      preview.alt = file.name;
      preview.src = captured[index]?.preview || file.url;

      const name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = file.name;

      const meta = document.createElement('div');
      meta.className = 'file-meta';
      meta.textContent = captured[index]?.label === 'page' ? 'Скриншот всей страницы' : 'Выделенная область';

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

    downloadAllBtn.href = `/api/download-zip/${sessionId}`;
    downloadAllContainer.hidden = false;
  }

  async function captureElement(element, label) {
    const canvas = await window.html2canvas(element, {
      useCORS: true,
      backgroundColor: '#ffffff',
      scale: 2
    });
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((blobResult) => {
        if (blobResult) {
          resolve(blobResult);
        } else {
          reject(new Error('Не удалось сформировать изображение'));
        }
      }, 'image/png');
    });

    const name = `screenshot-${label}-${Date.now()}.png`;
    return new File([blob], name, { type: 'image/png' });
  }

  function startSelection() {
    if (selectionActive) return;
    selectionActive = true;
    captureSelectionBtn.textContent = 'Выберите элемент…';
    highlightEl = document.createElement('div');
    highlightEl.style.position = 'absolute';
    highlightEl.style.pointerEvents = 'none';
    highlightEl.style.border = '2px dashed #3b82f6';
    highlightEl.style.borderRadius = '8px';
    highlightEl.style.zIndex = '9999';
    document.body.appendChild(highlightEl);

    document.addEventListener('mousemove', highlightHandler);
    document.addEventListener('click', clickHandler, true);
    setAlert('Наведите курсор и кликните на элемент для скриншота.', false);
  }

  function stopSelection() {
    selectionActive = false;
    captureSelectionBtn.textContent = 'Скриншот выбранного блока';
    if (highlightEl?.parentNode) {
      highlightEl.parentNode.removeChild(highlightEl);
    }
    highlightEl = null;
    document.removeEventListener('mousemove', highlightHandler);
    document.removeEventListener('click', clickHandler, true);
    setAlert('', true);
  }

  function highlightHandler(event) {
    if (!selectionActive || !highlightEl) return;
    const target = event.target;
    if (!target || target === highlightEl || target === document.body) {
      return;
    }
    const rect = target.getBoundingClientRect();
    highlightEl.style.left = `${rect.left + window.scrollX}px`;
    highlightEl.style.top = `${rect.top + window.scrollY}px`;
    highlightEl.style.width = `${rect.width}px`;
    highlightEl.style.height = `${rect.height}px`;
  }

  async function clickHandler(event) {
    if (!selectionActive) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.target;
    if (!target || target === highlightEl) {
      return;
    }
    stopSelection();
    await captureAndStore(target, 'selection');
  }

  function setAlert(message, success) {
    if (!alertElement) return;
    if (!message) {
      alertElement.hidden = true;
      return;
    }
    alertElement.hidden = false;
    alertElement.textContent = message;
    alertElement.style.background = success
      ? 'rgba(16, 185, 129, 0.18)'
      : 'rgba(37, 99, 235, 0.15)';
    alertElement.style.color = success ? '#047857' : '#1e40af';
  }
})();
