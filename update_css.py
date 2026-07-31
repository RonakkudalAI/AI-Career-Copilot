import re
import os

path = 'src/app/globals.css'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# The new root and dark theme blocks
new_vars = """:root {
  /* Colors */
  --background: #f4f8fa;
  --background-subtle: #edf4f6;
  --surface: #ffffff;
  --surface-blue: #e8f4f8;
  --primary: #93c5fd;
  --primary-strong: #2563eb;
  --primary-dark: #1e3a8a;
  --ink: #0f172a;
  --muted: #475569;
  --border: #cbd5e1;
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
  --info: #3b82f6;
  --ai: #8b5cf6;
  --shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.08);
  --shadow-md: 0 6px 18px rgba(15, 23, 42, 0.1);
  --shadow-lg: 0 14px 34px rgba(15, 23, 42, 0.13);
  --text-on-primary: #ffffff;
  --text-on-dark: #f8fafc;
  --border-on-dark: rgba(255, 255, 255, 0.18);
  --error-bg: #fef2f2;
  --error-text: #b91c1c;
  --error-border: #f87171;
  --diff-added: #dcfce7;
  --diff-removed: #fee2e2;
  --diff-modified: #fef9c3;
  --diff-unchanged: #f4f8fa;
  --skeleton-bg: #e2e8f0;
  --skeleton-highlight: #ffffff;
  --pdf-frame-bg: #f8fafc;
  --keyword-hit-bg: #fef08a;
  --resume-context-bg: #1e3a8a;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;

  /* Typography */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
  --text-display: clamp(2rem, 4vw, 3.5rem);
  --text-page: clamp(1.75rem, 2.6vw, 2.25rem);
  --text-section: clamp(1.25rem, 1.8vw, 1.5rem);
  --text-metric: clamp(1.5rem, 2.4vw, 2rem);
}

[data-theme="dark"] {
  --background: #0b1120;
  --background-subtle: #0f172a;
  --surface: #1e293b;
  --surface-blue: #0f172a;
  --primary: #1e3a8a;
  --primary-strong: #3b82f6;
  --primary-dark: #0b1120;
  --ink: #f8fafc;
  --muted: #94a3b8;
  --border: #334155;
  --success: #059669;
  --warning: #d97706;
  --danger: #dc2626;
  --info: #2563eb;
  --ai: #7c3aed;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 6px 18px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 14px 34px rgba(0, 0, 0, 0.5);
  --text-on-primary: #ffffff;
  --text-on-dark: #f8fafc;
  --border-on-dark: rgba(255, 255, 255, 0.12);
  --error-bg: #450a0a;
  --error-text: #fca5a5;
  --error-border: #991b1b;
  --diff-added: #064e3b;
  --diff-removed: #450a0a;
  --diff-modified: #422006;
  --diff-unchanged: #0f172a;
  --skeleton-bg: #1e293b;
  --skeleton-highlight: #334155;
  --pdf-frame-bg: #0f172a;
  --keyword-hit-bg: #854d0e;
  --resume-context-bg: #0b1120;
}
"""

# Replace the :root block
root_pattern = re.compile(r':root\s*\{.*?(?=\n\s*\})\}', re.DOTALL)
content = root_pattern.sub(new_vars, content, count=1)

# List of replacements for hardcoded colors
replacements = [
    # Text colors
    (r'color: #fff;', 'color: var(--text-on-primary);'),
    (r'color: #dff3ff;', 'color: var(--text-on-dark);'),
    
    # Backgrounds
    (r'background: #fff;', 'background: var(--surface);'),
    (r'background: #fff\b', 'background: var(--surface)'),
    (r'background: #fff6f5;', 'background: var(--error-bg);'),
    (r'background: #fff6cf;', 'background: var(--diff-modified);'),
    (r'background: #dff8eb;', 'background: var(--diff-added);'),
    (r'background: #ffe2e2;', 'background: var(--diff-removed);'),
    (r'background: #f4f8fa;', 'background: var(--diff-unchanged);'),
    (r'background: #f4f6f8;', 'background: var(--pdf-frame-bg);'),
    (r'background: #fff3a6;', 'background: var(--keyword-hit-bg);'),
    (r'background: #0b3048;', 'background: var(--resume-context-bg);'),
    (r'background: #102532;', 'background: var(--surface-blue);'), # Camera fallback
    
    # Border / Text in error states
    (r'border-color: #b42318;', 'border-color: var(--error-border);'),
    (r'color: #a2170b;', 'color: var(--error-text);'),
    (r'color: #c62828;', 'color: var(--error-text);'),
    
    # Skeleton gradient
    (r'linear-gradient\(90deg, #e7f0f5 25%, #fff 50%, #e7f0f5 75%\)', 'linear-gradient(90deg, var(--skeleton-bg) 25%, var(--skeleton-highlight) 50%, var(--skeleton-bg) 75%)'),
    
    # color-mix with #fff
    (r'color-mix\(in srgb, #fff (\d+%), transparent\)', r'color-mix(in srgb, var(--surface) \1, transparent)'),
    (r'color-mix\(in srgb, #fff (\d+%), var\(--primary-dark\)\)', r'color-mix(in srgb, var(--surface) \1, var(--primary-dark))'),
    (r'color-mix\(in srgb, #fff (\d+%), #102532\)', r'color-mix(in srgb, var(--surface) \1, var(--surface-blue))'),
    (r'color-mix\(in srgb, var\(--primary-dark\) 80%, #fff\)', r'color-mix(in srgb, var(--primary-dark) 80%, var(--surface))'),
    
    # Any stray hardcoded black/dark values
    (r'color: #123;', 'color: var(--primary-dark);'),
]

for old, new in replacements:
    content = re.sub(old, new, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
