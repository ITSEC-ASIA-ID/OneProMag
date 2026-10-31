import { onUnauthorized } from './api.js';
import { renderAuth } from './auth.js';
import { syncDeviceOverflow } from './devices.js';
import { syncSheetOverflow } from './info.js';
import { boot } from './shell.js';
import { state } from './state.js';

onUnauthorized(() => {
  state.user = null;
  renderAuth('login');
});

if (!window.__devResizeBound) {
  window.__devResizeBound = true;
  window.addEventListener('resize', () => {
    if (state.nav === 'devices') syncDeviceOverflow();
    if (state.nav === 'info') syncSheetOverflow();
  });
}

boot();