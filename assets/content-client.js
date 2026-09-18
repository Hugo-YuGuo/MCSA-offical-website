/* Read the published snapshot on each visit. No bundled content or stale cache. */
(() => {
  'use strict';

  function endpoint() {
    const configured = String(window.MCSA_CONFIG?.apiBase || '').trim();
    if (!configured) throw new Error('API address is not configured.');
    const base = new URL(configured, location.href);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
      throw new Error('Invalid API address.');
    }
    if (location.protocol === 'https:' && base.protocol !== 'https:') {
      throw new Error('The API must use HTTPS.');
    }
    return base.href.replace(/\/$/, '');
  }

  function checkSnapshot(value) {
    if (!value || value.schemaVersion !== 4 || !value.pages?.home || !value.settings || !value.layout
      || !Array.isArray(value.departments) || !Array.isArray(value.posts)) {
      throw new Error('Invalid published content.');
    }
    return value;
  }

  async function load() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(endpoint() + '/site', {
        cache: 'no-store',
        credentials: 'omit',
        mode: 'cors',
        signal: controller.signal
      });
      if (!response.ok) throw new Error('The content service is unavailable.');
      const result = await response.json();
      return {data: checkSnapshot(result.data), revision: result.revision};
    } finally {
      clearTimeout(timeout);
    }
  }

  function previewRequested() {
    return new URLSearchParams(location.search).get('preview') === '1' && window.parent !== window;
  }

  function previewData() {
    const adminOrigin = new URL(endpoint()).origin;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', receive);
        reject(new Error('Preview did not receive content.'));
      }, 15000);
      function receive(event) {
        if (event.origin !== adminOrigin || event.source !== window.parent || event.data?.type !== 'mcsa-preview-content') return;
        clearTimeout(timeout);
        window.removeEventListener('message', receive);
        try {
          resolve({data: checkSnapshot(event.data.content), revision: 'preview'});
        } catch (error) {
          reject(error);
        }
      }
      window.addEventListener('message', receive);
      window.parent.postMessage({type: 'mcsa-preview-ready'}, adminOrigin);
    });
  }

  window.MCSAContent = {load, previewRequested, previewData};
})();
