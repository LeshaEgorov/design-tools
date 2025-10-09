(function () {
  if (window.cv) {
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
  script.async = true;
  script.onload = () => console.info('OpenCV.js loaded');
  script.onerror = () => console.error('Не удалось загрузить OpenCV.js');
  document.head.appendChild(script);
})();
