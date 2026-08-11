import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import QRCode from 'https://esm.sh/qrcode@1.5.3';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let families = [];
let types = [];
let products = [];
let movements = [];
let editingId = null;
let scannedProduct = null;
let movKind = 'entrada';
let html5QrCode = null;

const catColors = [
    { bg: '#FDE6E7', ink: '#A80410', line: '#E30613' },
    { bg: '#E4EEF7', ink: '#155284', line: '#2E7CB8' },
    { bg: '#EDE7F6', ink: '#5B3A99', line: '#7E57C2' },
    { bg: '#E5F2E8', ink: '#286B44', line: '#3F9463' },
    { bg: '#FCEEDB', ink: '#8A5A10', line: '#C9852A' },
    { bg: '#F1E9E4', ink: '#6B4A32', line: '#9C6E4C' },
];
function colorForCat(cat) {
    let h = 0;
    for (const c of (cat || '')) h = (h * 31 + c.charCodeAt(0)) % 1000;
    return catColors[h % catColors.length];
}
function esc(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function pad(n, len) {
    return String(n).padStart(len, '0');
}

/* ---------------- DATA LOADING ---------------- */

async function loadAll() {
    await Promise.all([loadFamilies(), loadTypes()]);
    await loadProducts();
    await loadMovements();
}

async function loadFamilies() {
    const { data, error } = await supabase.from('families').select('*').order('code');
    if (error) { console.error(error); return; }
    families = data || [];
}

async function loadTypes() {
    const { data, error } = await supabase.from('types').select('*').order('code');
    if (error) { console.error(error); return; }
    types = data || [];
}

async function loadProducts() {
    const { data, error } = await supabase.from('products').select('*').order('name');
    if (error) {
        document.getElementById('content').innerHTML =
            `<div class="empty"><h3>Não foi possível carregar os itens</h3><p>${esc(error.message)}</p></div>`;
        return;
    }
    products = data || [];
    renderEstoque();
    renderAdmin();
    fillProductFormSelects();
}

async function loadMovements() {
    const { data, error } = await supabase.from('movements').select('*').order('created_at', { ascending: false }).limit(300);
    if (error) { console.error(error); return; }
    movements = data || [];
    renderHistorico();
}

/* ---------------- TABS ---------------- */

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab !== 'scanner') stopScanner();
    });
});

/* ---------------- ESTOQUE (grid) ---------------- */

function familyName(id) { return families.find(f => f.id === id)?.name || ''; }
function typeName(id) { return types.find(t => t.id === id)?.name || ''; }

function renderStats() {
    const totalItems = products.length;
    const totalQty = products.reduce((s, i) => s + Number(i.qty || 0), 0);
    const lowCount = products.filter(p => Number(p.qty) <= Number(p.min_qty || 0)).length;
    document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="n">${totalItems}</div><div class="l">Itens</div></div>
    <div class="stat"><div class="n">${totalQty}</div><div class="l">Unidades</div></div>
    <div class="stat"><div class="n">${lowCount}</div><div class="l">Estoque baixo</div></div>
  `;
}

function renderFamFilterOptions() {
    const sel = document.getElementById('famFilter');
    const current = sel.value;
    sel.innerHTML = '<option value="">Todas as famílias</option>' +
        families.map(f => `<option value="${f.id}">${esc(f.name)} (${f.code})</option>`).join('');
    sel.value = current;
}

function getFiltered() {
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    const fam = document.getElementById('famFilter').value;
    const lowOnly = document.getElementById('lowFilter').value === 'low';
    return products.filter(it => {
        const matchesQ = !q || [it.sku, it.name, familyName(it.family_id), typeName(it.type_id), it.location, it.description]
            .some(f => (f || '').toLowerCase().includes(q));
        const matchesFam = !fam || it.family_id === fam;
        const matchesLow = !lowOnly || Number(it.qty) <= Number(it.min_qty || 0);
        return matchesQ && matchesFam && matchesLow;
    });
}

function renderEstoque() {
    renderStats();
    renderFamFilterOptions();
    const list = getFiltered().sort((a, b) => a.name.localeCompare(b.name));
    const content = document.getElementById('content');
    if (products.length === 0) {
        content.innerHTML = `<div class="empty"><h3>Nenhum item cadastrado</h3><p>Cadastre famílias e tipos, depois adicione o primeiro produto.</p></div>`;
        return;
    }
    if (list.length === 0) {
        content.innerHTML = `<div class="empty"><h3>Nada encontrado</h3><p>Ajuste a busca ou os filtros.</p></div>`;
        return;
    }
    content.innerHTML = `<div class="grid">${list.map(cardHtml).join('')}</div>`;
}

function cardHtml(it) {
    const low = Number(it.qty) <= Number(it.min_qty || 0);
    const c = colorForCat(familyName(it.family_id));
    return `
  <div class="card" style="--catcolor:${c.line};--catcolor-bg:${c.bg};--catcolor-ink:${c.ink}">
    ${low ? '<div class="tag-low">Estoque baixo</div>' : ''}
    <div class="card-top">
      <div>
        <div class="card-code">${esc(it.sku)}</div>
        <h3>${esc(it.name)}</h3>
      </div>
    </div>
    <span class="card-cat">${esc(familyName(it.family_id))} · ${esc(typeName(it.type_id))}</span>
    ${it.description ? `<p class="card-desc">${esc(it.description)}</p>` : ''}
    ${it.location ? `<div class="card-loc">📍 ${esc(it.location)}</div>` : ''}
    <div class="card-bottom">
      <div class="qty-box">
        <span class="qty-num ${low ? 'qty-low' : ''}">${it.qty}</span>
        <span style="font-size:11px;color:var(--muted)">/ mín ${it.min_qty || 0}</span>
      </div>
      <div class="card-actions">
        <button class="icon-btn" data-action="qr" data-id="${it.id}" title="Ver QR / imprimir etiqueta">▦</button>
        <button class="icon-btn" data-action="edit" data-id="${it.id}" title="Editar">✎</button>
        <button class="icon-btn del" data-action="delete" data-id="${it.id}" title="Excluir">🗑</button>
      </div>
    </div>
  </div>`;
}

document.getElementById('searchInput').addEventListener('input', renderEstoque);
document.getElementById('famFilter').addEventListener('change', renderEstoque);
document.getElementById('lowFilter').addEventListener('change', renderEstoque);

document.getElementById('content').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'edit') openEdit(id);
    else if (action === 'delete') deleteProduct(id);
    else if (action === 'qr') openQr(id);
});

/* ---------------- PRODUTO: modal criar/editar ---------------- */

function fillProductFormSelects() {
    const famSel = document.getElementById('fFamily');
    famSel.innerHTML = families.map(f => `<option value="${f.id}">${esc(f.name)} (${f.code})</option>`).join('');
    updateTypeSelectForFamily();
    famSel.onchange = () => { updateTypeSelectForFamily(); updateSkuPreview(); };
    document.getElementById('fType').onchange = updateSkuPreview;
}

function updateTypeSelectForFamily() {
    const famId = document.getElementById('fFamily').value;
    const typeSel = document.getElementById('fType');
    const relevant = types.filter(t => t.family_id === famId);
    typeSel.innerHTML = relevant.map(t => `<option value="${t.id}">${esc(t.name)} (${t.code})</option>`).join('');
}

function nextProductCode(familyId, typeId) {
    const existing = products.filter(p => p.family_id === familyId && p.type_id === typeId);
    let max = 0;
    existing.forEach(p => { const n = parseInt(p.product_code, 10); if (n > max) max = n; });
    return pad(max + 1, 4);
}

function updateSkuPreview() {
    const famId = document.getElementById('fFamily').value;
    const typeId = document.getElementById('fType').value;
    const fam = families.find(f => f.id === famId);
    const type = types.find(t => t.id === typeId);
    if (!fam || !type) { document.getElementById('fSkuPreview').value = ''; return; }
    let productCode;
    if (editingId) {
        const p = products.find(x => x.id === editingId);
        productCode = p ? p.product_code : nextProductCode(famId, typeId);
    } else {
        productCode = nextProductCode(famId, typeId);
    }
    document.getElementById('fSkuPreview').value = `${fam.code}.${type.code}.${productCode}`;
}

function openNew() {
    if (families.length === 0 || types.length === 0) {
        alert('Cadastre ao menos uma Família e um Tipo antes de criar produtos (aba "Famílias / Tipos").');
        return;
    }
    editingId = null;
    document.getElementById('modalTitle').textContent = 'Novo produto';
    document.getElementById('itemId').value = '';
    fillProductFormSelects();
    document.getElementById('fName').value = '';
    document.getElementById('fQty').value = 1;
    document.getElementById('fMinQty').value = 3;
    document.getElementById('fLocation').value = '';
    document.getElementById('fDesc').value = '';
    document.getElementById('errorMsg').style.display = 'none';
    updateSkuPreview();
    document.getElementById('modalOverlay').classList.add('open');
    document.getElementById('fName').focus();
}

function openEdit(id) {
    const it = products.find(i => i.id === id);
    if (!it) return;
    editingId = id;
    document.getElementById('modalTitle').textContent = 'Editar produto';
    document.getElementById('itemId').value = it.id;
    fillProductFormSelects();
    document.getElementById('fFamily').value = it.family_id;
    updateTypeSelectForFamily();
    document.getElementById('fType').value = it.type_id;
    document.getElementById('fName').value = it.name;
    document.getElementById('fQty').value = it.qty;
    document.getElementById('fMinQty').value = it.min_qty || 0;
    document.getElementById('fLocation').value = it.location || '';
    document.getElementById('fDesc').value = it.description || '';
    document.getElementById('errorMsg').style.display = 'none';
    updateSkuPreview();
    document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
}

async function saveProduct() {
    const name = document.getElementById('fName').value.trim();
    const famId = document.getElementById('fFamily').value;
    const typeId = document.getElementById('fType').value;
    const qty = Number(document.getElementById('fQty').value);
    const minQty = Number(document.getElementById('fMinQty').value);
    const location = document.getElementById('fLocation').value.trim();
    const description = document.getElementById('fDesc').value.trim();

    const err = document.getElementById('errorMsg');
    if (!name) { err.textContent = 'Informe o nome do item.'; err.style.display = 'block'; return; }
    if (!famId || !typeId) { err.textContent = 'Selecione a família e o tipo.'; err.style.display = 'block'; return; }

    const fam = families.find(f => f.id === famId);
    const type = types.find(t => t.id === typeId);

    if (editingId) {
        const payload = { name, family_id: famId, type_id: typeId, qty: isNaN(qty) ? 0 : qty, min_qty: isNaN(minQty) ? 0 : minQty, location, description, updated_at: new Date().toISOString() };
        const { data, error } = await supabase.from('products').update(payload).eq('id', editingId).select().single();
        if (error) { err.textContent = 'Não foi possível salvar: ' + error.message; err.style.display = 'block'; return; }
        const idx = products.findIndex(i => i.id === editingId);
        products[idx] = data;
    } else {
        const productCode = nextProductCode(famId, typeId);
        const sku = `${fam.code}.${type.code}.${productCode}`;
        const payload = {
            name, family_id: famId, type_id: typeId,
            family_code: fam.code, type_code: type.code, product_code: productCode, sku,
            qty: isNaN(qty) ? 0 : qty, min_qty: isNaN(minQty) ? 0 : minQty, location, description
        };
        const { data, error } = await supabase.from('products').insert(payload).select().single();
        if (error) { err.textContent = 'Não foi possível salvar: ' + error.message; err.style.display = 'block'; return; }
        products.push(data);
    }
    closeModal();
    renderEstoque();
}

async function deleteProduct(id) {
    const it = products.find(i => i.id === id);
    if (!it) return;
    if (!confirm(`Excluir "${it.name}" (${it.sku}) do almoxarifado?`)) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) { alert('Não foi possível excluir: ' + error.message); return; }
    products = products.filter(i => i.id !== id);
    renderEstoque();
}

document.getElementById('btnNew').addEventListener('click', openNew);
document.getElementById('btnCancel').addEventListener('click', closeModal);
document.getElementById('btnSave').addEventListener('click', saveProduct);
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target.id === 'modalOverlay') closeModal(); });

/* ---------------- QR CODE: gerar / imprimir etiqueta ---------------- */

async function openQr(id) {
    const it = products.find(i => i.id === id);
    if (!it) return;
    document.getElementById('qrSkuText').textContent = it.sku;
    document.getElementById('qrNameText').textContent = it.name;
    const holder = document.getElementById('qrCanvasHolder');
    holder.innerHTML = '';
    const canvas = document.createElement('canvas');
    holder.appendChild(canvas);
    await QRCode.toCanvas(canvas, it.sku, { width: 220, margin: 1, color: { dark: '#1A1A1A', light: '#FFFFFF' } });
    document.getElementById('qrOverlay').classList.add('open');
}

document.getElementById('btnCloseQr').addEventListener('click', () => document.getElementById('qrOverlay').classList.remove('open'));
document.getElementById('qrOverlay').addEventListener('click', e => { if (e.target.id === 'qrOverlay') document.getElementById('qrOverlay').classList.remove('open'); });
document.getElementById('btnPrintQr').addEventListener('click', () => window.print());

/* ---------------- SCANNER (entrada / saída) ---------------- */

async function startScanner() {
    const el = document.getElementById('qr-reader');
    el.style.minHeight = '260px';
    if (!window.Html5Qrcode) { alert('Biblioteca de leitura de QR Code não carregou. Verifique sua conexão.'); return; }

    if (!window.isSecureContext) {
        alert('A câmera só funciona em conexão segura (HTTPS) ou em "localhost". Abra o site pelo link https://... ou use a busca manual pelo SKU abaixo.');
        return;
    }

    html5QrCode = new Html5Qrcode('qr-reader');
    const scanConfig = { fps: 10, qrbox: { width: 240, height: 240 } };

    // 1ª tentativa: pedir a câmera traseira diretamente
    try {
        await html5QrCode.start(
            { facingMode: 'environment' },
            scanConfig,
            decodedText => handleScanResult(decodedText.trim()),
            () => {}
        );
        onScannerStarted();
        return;
    } catch (e) {
        console.warn('facingMode environment falhou, tentando listar câmeras...', e);
    }

    // 2ª tentativa: listar câmeras do dispositivo e usar a última (geralmente a traseira em celulares)
    try {
        const cams = await Html5Qrcode.getCameras();
        if (!cams || cams.length === 0) {
            alert('Nenhuma câmera foi encontrada neste dispositivo/navegador. Verifique se seu celular tem câmera disponível e se você permitiu o acesso a ela, ou use a busca manual pelo SKU abaixo.');
            return;
        }
        const chosen = cams.length > 1 ? cams[cams.length - 1] : cams[0];
        await html5QrCode.start(
            chosen.id,
            scanConfig,
            decodedText => handleScanResult(decodedText.trim()),
            () => {}
        );
        onScannerStarted();
    } catch (e2) {
        alert('Não foi possível acessar a câmera: ' + e2 + '\n\nDicas: use HTTPS, permita o acesso à câmera nas configurações do navegador, e teste em um celular (a maioria dos computadores não tem câmera "traseira"). Você também pode digitar o SKU manualmente abaixo.');
    }
}

function onScannerStarted() {
    document.getElementById('btnStartScan').style.display = 'none';
    document.getElementById('btnStopScan').style.display = 'inline-block';
}

async function stopScanner() {
    if (html5QrCode) {
        try { await html5QrCode.stop(); html5QrCode.clear(); } catch (e) {}
        html5QrCode = null;
    }
    document.getElementById('btnStartScan').style.display = 'inline-block';
    document.getElementById('btnStopScan').style.display = 'none';
}

document.getElementById('btnStartScan').addEventListener('click', startScanner);
document.getElementById('btnStopScan').addEventListener('click', stopScanner);

document.getElementById('btnManualLookup').addEventListener('click', () => {
    const sku = document.getElementById('manualSku').value.trim();
    if (sku) handleScanResult(sku);
});

function handleScanResult(sku) {
    const it = products.find(p => p.sku === sku);
    if (!it) {
        alert(`Nenhum produto encontrado com o código ${sku}`);
        return;
    }
    scannedProduct = it;
    stopScanner();
    document.getElementById('scanResult').style.display = 'block';
    document.getElementById('srSku').textContent = it.sku;
    document.getElementById('srName').textContent = it.name;
    document.getElementById('srLoc').textContent = it.location ? `📍 ${it.location}` : '';
    document.getElementById('srQty').textContent = it.qty;
    document.getElementById('movQty').value = 1;
    document.getElementById('movReason').value = '';
    document.getElementById('movResp').value = '';
    document.getElementById('scanErrorMsg').style.display = 'none';
    setMovKind('entrada');
    document.getElementById('scanResult').scrollIntoView({ behavior: 'smooth' });
}

function setMovKind(kind) {
    movKind = kind;
    document.querySelectorAll('.sr-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.kind === kind));
    document.getElementById('qtyLabel').textContent = kind === 'entrada' ? 'Quantidade adicionada' : 'Quantidade retirada';
    document.getElementById('reasonField').style.display = kind === 'saida' ? 'block' : 'none';
}
document.querySelectorAll('.sr-tab-btn').forEach(b => b.addEventListener('click', () => setMovKind(b.dataset.kind)));

document.getElementById('btnCancelScan').addEventListener('click', () => {
    document.getElementById('scanResult').style.display = 'none';
    scannedProduct = null;
});

document.getElementById('btnConfirmMov').addEventListener('click', async () => {
    if (!scannedProduct) return;
    const errEl = document.getElementById('scanErrorMsg');
    errEl.style.display = 'none';
    const qty = Number(document.getElementById('movQty').value);
    const responsible = document.getElementById('movResp').value.trim();
    const reason = document.getElementById('movReason').value.trim();

    if (!qty || qty <= 0) { errEl.textContent = 'Informe uma quantidade válida.'; errEl.style.display = 'block'; return; }
    if (!responsible) { errEl.textContent = 'Informe o nome do responsável.'; errEl.style.display = 'block'; return; }
    if (movKind === 'saida' && qty > Number(scannedProduct.qty)) {
        errEl.textContent = `Saldo insuficiente. Saldo atual: ${scannedProduct.qty}.`;
        errEl.style.display = 'block';
        return;
    }

    const newQty = movKind === 'entrada' ? Number(scannedProduct.qty) + qty : Number(scannedProduct.qty) - qty;

    const { data: updated, error: updErr } = await supabase.from('products')
        .update({ qty: newQty, updated_at: new Date().toISOString() })
        .eq('id', scannedProduct.id).select().single();
    if (updErr) { errEl.textContent = 'Erro ao atualizar estoque: ' + updErr.message; errEl.style.display = 'block'; return; }

    const { error: movErr } = await supabase.from('movements').insert({
        product_id: scannedProduct.id,
        sku: scannedProduct.sku,
        kind: movKind,
        quantity: qty,
        responsible,
        reason: reason || null,
        balance_after: newQty
    });
    if (movErr) { errEl.textContent = 'Estoque atualizado, mas houve erro ao registrar o histórico: ' + movErr.message; errEl.style.display = 'block'; }

    const idx = products.findIndex(p => p.id === scannedProduct.id);
    if (idx >= 0) products[idx] = updated;
    renderEstoque();
    await loadMovements();

    document.getElementById('scanResult').style.display = 'none';
    scannedProduct = null;
    alert(movKind === 'entrada' ? 'Entrada registrada com sucesso!' : 'Saída registrada com sucesso!');
});

/* ---------------- HISTÓRICO ---------------- */

function renderHistorico() {
    const q = document.getElementById('histSearch').value.trim().toLowerCase();
    const kindFilter = document.getElementById('histKindFilter').value;
    const list = movements.filter(m => {
        const matchesQ = !q || [m.sku, m.responsible, m.reason].some(f => (f || '').toLowerCase().includes(q));
        const matchesKind = !kindFilter || m.kind === kindFilter;
        return matchesQ && matchesKind;
    });
    const content = document.getElementById('histContent');
    if (list.length === 0) {
        content.innerHTML = `<div class="empty"><h3>Nenhuma movimentação encontrada</h3><p>Registre entradas e saídas pela aba Scanner QR.</p></div>`;
        return;
    }
    content.innerHTML = `
    <table class="hist-table">
      <thead><tr>
        <th>Data/Hora</th><th>SKU</th><th>Tipo</th><th>Qtd</th><th>Responsável</th><th>Motivo</th><th>Saldo após</th>
      </tr></thead>
      <tbody>
        ${list.map(m => `
          <tr>
            <td>${new Date(m.created_at).toLocaleString('pt-BR')}</td>
            <td class="card-code">${esc(m.sku)}</td>
            <td><span class="pill ${m.kind === 'entrada' ? 'pill-in' : 'pill-out'}">${m.kind === 'entrada' ? 'Entrada' : 'Saída'}</span></td>
            <td>${m.quantity}</td>
            <td>${esc(m.responsible)}</td>
            <td>${esc(m.reason) || '—'}</td>
            <td>${m.balance_after}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}
document.getElementById('histSearch').addEventListener('input', renderHistorico);
document.getElementById('histKindFilter').addEventListener('change', renderHistorico);

/* ---------------- ADMIN: famílias e tipos ---------------- */

function renderAdmin() {
    document.getElementById('famList').innerHTML = families.map(f => `
    <div class="admin-row">
      <div><span class="code">${f.code}</span>${esc(f.name)}</div>
      <button class="icon-btn del" data-fam-del="${f.id}" title="Excluir">🗑</button>
    </div>`).join('') || '<p style="color:var(--muted);font-size:13px">Nenhuma família cadastrada.</p>';

    const typeFamSel = document.getElementById('typeFamSelect');
    const current = typeFamSel.value;
    typeFamSel.innerHTML = families.map(f => `<option value="${f.id}">${esc(f.name)} (${f.code})</option>`).join('');
    if (current) typeFamSel.value = current;

    renderTypeList();
}

function renderTypeList() {
    const famId = document.getElementById('typeFamSelect').value;
    const relevant = types.filter(t => t.family_id === famId);
    document.getElementById('typeList').innerHTML = relevant.map(t => `
    <div class="admin-row">
      <div><span class="code">${t.code}</span>${esc(t.name)}</div>
      <button class="icon-btn del" data-type-del="${t.id}" title="Excluir">🗑</button>
    </div>`).join('') || '<p style="color:var(--muted);font-size:13px">Nenhum tipo cadastrado para esta família.</p>';
}

document.getElementById('typeFamSelect').addEventListener('change', renderTypeList);

function nextFamilyCode() {
    let max = 0;
    families.forEach(f => { const n = parseInt(f.code, 10); if (n > max) max = n; });
    return pad(max + 1, 3);
}
function nextTypeCode(familyId) {
    let max = 0;
    types.filter(t => t.family_id === familyId).forEach(t => { const n = parseInt(t.code, 10); if (n > max) max = n; });
    return pad(max + 1, 3);
}

document.getElementById('btnAddFam').addEventListener('click', async () => {
    const name = document.getElementById('newFamName').value.trim();
    if (!name) return;
    const code = nextFamilyCode();
    const { data, error } = await supabase.from('families').insert({ name, code }).select().single();
    if (error) { alert('Erro ao adicionar família: ' + error.message); return; }
    families.push(data);
    document.getElementById('newFamName').value = '';
    renderAdmin();
    fillProductFormSelects();
    renderFamFilterOptions();
});

document.getElementById('btnAddType').addEventListener('click', async () => {
    const famId = document.getElementById('typeFamSelect').value;
    const name = document.getElementById('newTypeName').value.trim();
    if (!famId || !name) return;
    const code = nextTypeCode(famId);
    const { data, error } = await supabase.from('types').insert({ name, code, family_id: famId }).select().single();
    if (error) { alert('Erro ao adicionar tipo: ' + error.message); return; }
    types.push(data);
    document.getElementById('newTypeName').value = '';
    renderAdmin();
    fillProductFormSelects();
});

document.getElementById('famList').addEventListener('click', async e => {
    const btn = e.target.closest('[data-fam-del]');
    if (!btn) return;
    const id = btn.dataset.famDel;
    if (!confirm('Excluir esta família? Todos os tipos e produtos vinculados também serão removidos.')) return;
    const { error } = await supabase.from('families').delete().eq('id', id);
    if (error) { alert('Erro ao excluir: ' + error.message); return; }
    families = families.filter(f => f.id !== id);
    types = types.filter(t => t.family_id !== id);
    products = products.filter(p => p.family_id !== id);
    renderAdmin();
    renderEstoque();
    fillProductFormSelects();
});

document.getElementById('typeList').addEventListener('click', async e => {
    const btn = e.target.closest('[data-type-del]');
    if (!btn) return;
    const id = btn.dataset.typeDel;
    if (!confirm('Excluir este tipo? Produtos vinculados também serão removidos.')) return;
    const { error } = await supabase.from('types').delete().eq('id', id);
    if (error) { alert('Erro ao excluir: ' + error.message); return; }
    types = types.filter(t => t.id !== id);
    products = products.filter(p => p.type_id !== id);
    renderTypeList();
    renderEstoque();
    fillProductFormSelects();
});

/* ---------------- PWA ---------------- */

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}

/* ---------------- INIT ---------------- */

loadAll();
