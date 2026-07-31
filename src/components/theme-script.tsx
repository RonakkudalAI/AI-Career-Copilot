export const ThemeScript = () => {
  const code = `
    (function() {
      try {
        var theme = localStorage.getItem('theme') || 'system';
        var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
        var isDark = theme === 'dark' || (theme === 'system' && darkQuery.matches);
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      } catch (e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: code }} suppressHydrationWarning />;
};
