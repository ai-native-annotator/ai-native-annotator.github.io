const { chromium } = require('playwright');

/**
 * Launch the project-local Playwright browser by default.
 *
 * `CHROME` remains an explicit escape hatch for testing a system browser, but
 * no verification script should contain a machine-specific executable path.
 */
function launchBrowser(options = {}) {
  const executablePath = process.env.CHROME?.trim();
  const args = [...new Set(['--no-sandbox', ...(options.args || [])])];
  return chromium.launch({
    ...options,
    ...(executablePath ? { executablePath } : {}),
    args,
  });
}

module.exports = { launchBrowser };
