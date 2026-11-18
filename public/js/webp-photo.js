(function attachWebpPhoto(global) {
  'use strict';

  const { apiFetch, escapeHtml, showToast } = global.CTI_STORE;
  const { openModal } = global.CTI_MODALS;

  /**
   * Comprime imagem client-side via HTML5 Canvas para WebP (max 800px, qualidade 0.75).
   */
  function compressFileToWebp(file, maxDim = 800, quality = 0.75) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('Nenhum arquivo selecionado.'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Imagem inválida ou corrompida.'));
        img.onload = () => {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;
          if (width > maxDim || height > maxDim) {
            if (width >= height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const dataUrl = canvas.toDataURL('image/webp', quality);
          if (!dataUrl.startsWith('data:image/webp')) {
            reject(new Error('Navegador não suportou exportação WebP.'));
            return;
          }
          resolve({ dataUrl, width: canvas.width, height: canvas.height });
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadOrderPhoto(osId, momento, file) {
    const compressed = await compressFileToWebp(file, 800, 0.75);
    return apiFetch(`/api/os/${osId}/fotos`, {
      method: 'POST',
      body: JSON.stringify({
        momento,
        dataUrl: compressed.dataUrl
      })
    });
  }

  function openLightbox(url, caption) {
    let zoom = 1;
    const html = `
      <div class="lightbox-stage">
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-sm" type="button" data-zoom="1">1x</button>
          <button class="btn btn-sm" type="button" data-zoom="2">2x</button>
          <button class="btn btn-sm" type="button" data-zoom="3">3x</button>
          <span class="eyebrow">${escapeHtml(caption || 'Inspeção Técnica')}</span>
        </div>
        <div class="lightbox-frame">
          <img id="lb-zoom-img" src="${escapeHtml(url)}" alt="${escapeHtml(caption || 'Foto OS')}">
        </div>
      </div>
    `;
    openModal('Inspeção Fotográfica WebP', html, true);
    const imgEl = document.getElementById('lb-zoom-img');
    document.querySelectorAll('[data-zoom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        zoom = Number(btn.getAttribute('data-zoom') || 1);
        imgEl.style.transform = `scale(${zoom})`;
      });
    });
  }

  function renderPhotoStrip(fotos, osId, allowUpload, onChanged) {
    const thumbs = (fotos || []).map((f) => `
      <div class="photo-thumb-card" data-open-lb="${escapeHtml(f.url)}" data-lb-cap="${escapeHtml(f.momento)} (${Math.round(f.tamanho_bytes / 1024)}KB)">
        <img src="${escapeHtml(f.url)}" alt="${escapeHtml(f.momento)}" loading="lazy">
        <div class="photo-thumb-label">${escapeHtml(f.momento)}</div>
      </div>
    `).join('');

    const uploadControls = allowUpload ? `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
        <label class="btn btn-sm" style="cursor:pointer;">
          <span>+ Foto Antes</span>
          <input type="file" accept="image/*" capture="environment" class="hidden" data-photo-up="ANTES" data-photo-os="${osId}">
        </label>
        <label class="btn btn-sm" style="cursor:pointer;">
          <span>+ Foto Depois</span>
          <input type="file" accept="image/*" capture="environment" class="hidden" data-photo-up="DEPOIS" data-photo-os="${osId}">
        </label>
      </div>
    ` : '';

    setTimeout(() => {
      document.querySelectorAll('[data-open-lb]').forEach((card) => {
        if (card.dataset.bound === '1') return;
        card.dataset.bound = '1';
        card.addEventListener('click', () => {
          openLightbox(card.getAttribute('data-open-lb'), card.getAttribute('data-lb-cap'));
        });
      });

      document.querySelectorAll('[data-photo-up]').forEach((inp) => {
        if (inp.dataset.bound === '1') return;
        inp.dataset.bound = '1';
        inp.addEventListener('change', async () => {
          const file = inp.files && inp.files[0];
          if (!file) return;
          try {
            const saved = await uploadOrderPhoto(
              Number(inp.getAttribute('data-photo-os')),
              inp.getAttribute('data-photo-up'),
              file
            );
            showToast(`Foto WebP salva (${Math.round(saved.tamanho_bytes / 1024)}KB).`, 'ok');
            if (onChanged) onChanged(saved);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    }, 0);

    return `
      <div>
        <div class="photo-strip">${thumbs || '<span class="eyebrow">Nenhuma foto anexada</span>'}</div>
        ${uploadControls}
      </div>
    `;
  }

  global.CTI_WEBP_PHOTO = {
    compressFileToWebp,
    uploadOrderPhoto,
    openLightbox,
    renderPhotoStrip
  };
})(window);
