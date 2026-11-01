// Carrega o logo OFICIAL da Equatorial, se o arquivo existir em public/assets/brand/.
// Preferência: versão branca (para fundo escuro) → versão colorida (exibida sobre placa branca).
// Sem arquivo, mostra só o nome em texto — não recriamos nem recolorimos a marca.
export async function mountBrand(root = document) {
  let info = { arquivo: null };
  try { info = await (await fetch('/api/brand')).json(); } catch { /* servidor indisponível */ }
  for (const slot of root.querySelectorAll('[data-brand-logo]')) {
    const wordmark = slot.parentElement.querySelector('[data-brand-wordmark]');
    if (!info.arquivo) { if (wordmark) wordmark.hidden = false; continue; }
    const img = new Image();
    img.alt = 'Grupo Equatorial';
    img.decoding = 'async';
    if (info.placa) img.className = 'plate';
    img.onload = () => { slot.replaceChildren(img); if (wordmark) wordmark.hidden = true; };
    img.onerror = () => { if (wordmark) wordmark.hidden = false; };
    img.src = info.arquivo;
  }
}

mountBrand();
