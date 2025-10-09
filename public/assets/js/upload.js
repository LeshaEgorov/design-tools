(function () {
  const MAX_FILES = 10;

  window.initUploader = function initUploader(selector, onFilesReady, options = {}) {
    const dropzone = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!dropzone) {
      throw new Error('Dropzone element not found');
    }

    const fileInput = dropzone.querySelector('input[type="file"]') || document.querySelector(options.inputSelector || '#fileInput');
    const alertElement = document.querySelector(options.alertSelector || '#uploadAlert');
    const maxFiles = options.maxFiles || MAX_FILES;
    const acceptedTypes = parseAcceptString(fileInput?.accept || options.accept);

    const state = {
      files: []
    };

    if (!fileInput) {
      console.warn('initUploader: file input not found inside dropzone. Click to upload disabled.');
    }

    dropzone.addEventListener('click', () => {
      fileInput?.click();
    });

    dropzone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      dropzone.classList.remove('dragover');
      const files = Array.from(event.dataTransfer.files || []);
      processFiles(files);
    });

    fileInput?.addEventListener('change', (event) => {
      const files = Array.from(event.target.files || []);
      processFiles(files);
      fileInput.value = '';
    });

    window.addEventListener('paste', (event) => {
      const items = event.clipboardData?.files;
      if (items && items.length) {
        const files = Array.from(items);
        processFiles(files);
      }
    });

    function processFiles(files) {
      if (!files.length) {
        return;
      }

      const filtered = files.filter((file) => {
        if (!acceptedTypes.length) {
          return true;
        }
        return acceptedTypes.some((type) => matchFileType(file, type));
      });

      if (!filtered.length) {
        showAlert('Выбранные файлы не поддерживаются.');
        return;
      }

      if (filtered.length > maxFiles) {
        showAlert(`Можно загрузить не более ${maxFiles} файлов за раз.`);
        filtered.length = maxFiles;
      }

      state.files = filtered.slice(0, maxFiles);
      hideAlert();
      onFilesReady?.(state.files);
    }

    function showAlert(message) {
      if (alertElement) {
        alertElement.textContent = message;
        alertElement.hidden = false;
      } else {
        console.warn(message);
      }
    }

    function hideAlert() {
      if (alertElement) {
        alertElement.hidden = true;
      }
    }

    return {
      getFiles: () => state.files.slice(),
      reset: () => {
        state.files = [];
      },
      showAlert,
      hideAlert
    };
  };

  async function uploadFilesToServer(files, options = {}) {
    if (!files || !files.length) {
      throw new Error('Нет файлов для загрузки');
    }

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    const response = await fetch(options.endpoint || '/api/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await safeParseJSON(response) || { error: 'Не удалось загрузить файлы' };
      throw new Error(error.error || response.statusText);
    }

    return response.json();
  }

  function parseAcceptString(accept = '') {
    return accept
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function matchFileType(file, accept) {
    if (!accept || accept === '*/*') {
      return true;
    }

    if (accept.startsWith('.')) {
      return file.name.toLowerCase().endsWith(accept.toLowerCase());
    }

    const [type, subtype] = accept.split('/');
    if (!type || !subtype) {
      return false;
    }

    const [fileType, fileSubtype] = file.type.split('/');
    if (!fileType || !fileSubtype) {
      return false;
    }

    if (type === '*' || type === fileType) {
      return subtype === '*' || subtype === fileSubtype;
    }

    return false;
  }

  async function safeParseJSON(response) {
    try {
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  window.uploadFilesToServer = uploadFilesToServer;
})();
