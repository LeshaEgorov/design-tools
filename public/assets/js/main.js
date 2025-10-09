document.addEventListener('DOMContentLoaded', () => {
  const yearSpan = document.querySelector('[data-current-year]');
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }

  const smoothLinks = document.querySelectorAll('a[href^="#"]');
  smoothLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
});
