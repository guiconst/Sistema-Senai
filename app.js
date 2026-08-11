import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let items = [];
let editingId = null;

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

async function loadItems() {
    const { data, error } = await supabase.from('items').select('*').order('name');
    if (error) {
        document.getElementById('content').innerHTML =
            `<div class="empty"><h3>Não foi possível carregar os itens</h3><p>${esc(error.message)}</p></div>`;
        return;
    }
    items = data || [];
    render();
}

function esc(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function getFiltered() {
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    const cat = document.getElementById('catFilter').value;
    return items.filter(it => {
        const matchesQ = !q || [it.name, it.code, it.category, it.location, it.description]
            .some(f => (f || '').toLowerCase().includes(q));
        const matchesCat = !cat || it.category === cat;
        return matchesQ && matchesCat;
    });
}

function renderStats() {
    const totalItems = items.length;
    const totalQty = items.reduce((s, i) => s + Number(i.qty || 0), 0);
    const cats = new Set(items.map(i => i.category).filter(Boolean)).size;
    document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="n">${totalItems}</div><div class="l">Itens</div></div>
    <div class="stat"><div class="n">${totalQty}</div><div class="l">Unidades</div></div>
    <div class="stat"><div class="n">${cats}</div><div class="l">Categorias</div></div>
  `;
}

function renderCatOptions() {
    const cats = [...new Set(items.map(i => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const filterSel = document.getElementById('catFilter');
    const current = filterSel.value;
    filterSel.innerHTML = '<option value="">Todas as categorias</option>' +
        cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    filterSel.value = cats.includes(current) ? current : '';
    document.getElementById('catList').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
}

function render() {
    renderStats();
    renderCatOptions();
    const list = getFiltered().sort((a, b) => a.name.localeCompare(b.name));
    const content = document.getElementById('content');
    if (items.length === 0) {
        content.innerHTML = `<div class="empty"><h3>Nenhum item cadastrado</h3><p>Comece cadastrando o primeiro item do almoxarifado.</p></div>`;
        return;
    }
    if (list.length === 0) {
        content.innerHTML = `<div class="empty"><h3>Nada encontrado</h3><p>Ajuste a busca ou o filtro de categoria.</p></div>`;
        return;
    }
    content.innerHTML = `<div class="grid">${list.map(cardHtml).join('')}</div>`;
}

function cardHtml(it) {
    const low = Number(it.qty) <= 3;
    const c = colorForCat(it.category);
    return `
  <div class="card" style="--catcolor:${c.line};--catcolor-bg:${c.bg};--catcolor-ink:${c.ink}">
    ${low ? '<div class="tag-low">Estoque baixo</div>' : ''}
    <div class="card-top">
      <div>
        <div class="card-code">${esc(it.code) || '—'}</div>
        <h3>${esc(it.name)}</h3>
      </div>
    </div>
    ${it.category ? `<span class="card-cat">${esc(it.category)}</span>` : ''}
    ${it.description ? `<p class="card-desc">${esc(it.description)}</p>` : ''}
    ${it.location ? `<div class="card-loc">📍 ${esc(it.location)}</div>` : ''}
    <div class="card-bottom">
      <div class="qty-box">
        <button class="qty-btn" data-action="dec" data-id="${it.id}">−</button>
        <span class="qty-num ${low ? 'qty-low' : ''}">${it.qty}</span>
        <button class="qty-btn" data-action="inc" data-id="${it.id}">+</button>
      </div>
      <div class="card-actions">
        <button class="icon-btn" data-action="edit" data-id="${it.id}" title="Editar">✎</button>
        <button class="icon-btn del" data-action="delete" data-id="${it.id}" title="Excluir">🗑</button>
      </div>
    </div>
  </div>`;
}

async function adjustQty(id, delta) {
    const it = items.find(i => i.id === id);
    if (!it) return;
    const newQty = Math.max(0, Number(it.qty) + delta);
    it.qty = newQty;
    render();
    const { error } = await supabase.from('items').update({ qty: newQty, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) alert('Não foi possível atualizar a quantidade: ' + error.message);
}

async function deleteItem(id) {
    const it = items.find(i => i.id === id);
    if (!it) return;
    if (!confirm(`Excluir "${it.name}" do almoxarifado?`)) return;
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) { alert('Não foi possível excluir: ' + error.message); return; }
    items = items.filter(i => i.id !== id);
    render();
}

function openNew() {
    editingId = null;
    document.getElementById('modalTitle').textContent = 'Novo item';
    document.getElementById('itemId').value = '';
    document.getElementById('fName').value = '';
    document.getElementById('fCategory').value = '';
    document.getElementById('fQty').value = 1;
    document.getElementById('fCode').value = '';
    document.getElementById('fLocation').value = '';
    document.getElementById('fDesc').value = '';
    document.getElementById('errorMsg').style.display = 'none';
    document.getElementById('modalOverlay').classList.add('open');
    document.getElementById('fName').focus();
}

function openEdit(id) {
    const it = items.find(i => i.id === id);
    if (!it) return;
    editingId = id;
    document.getElementById('modalTitle').textContent = 'Editar item';
    document.getElementById('itemId').value = it.id;
    document.getElementById('fName').value = it.name;
    document.getElementById('fCategory').value = it.category || '';
    document.getElementById('fQty').value = it.qty;
    document.getElementById('fCode').value = it.code || '';
    document.getElementById('fLocation').value = it.location || '';
    document.getElementById('fDesc').value = it.description || '';
    document.getElementById('errorMsg').style.display = 'none';
    document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
}

async function saveItem() {
    const name = document.getElementById('fName').value.trim();
    const category = document.getElementById('fCategory').value.trim();
    const qty = Number(document.getElementById('fQty').value);
    const code = document.getElementById('fCode').value.trim();
    const location = document.getElementById('fLocation').value.trim();
    const description = document.getElementById('fDesc').value.trim();

    if (!name) {
        const err = document.getElementById('errorMsg');
        err.textContent = 'Informe o nome do item.';
        err.style.display = 'block';
        return;
    }

    const payload = { name, category, qty: isNaN(qty) ? 0 : qty, code, location, description };

    if (editingId) {
        const { data, error } = await supabase.from('items')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', editingId).select().single();
        if (error) { alert('Não foi possível salvar: ' + error.message); return; }
        const idx = items.findIndex(i => i.id === editingId);
        items[idx] = data;
    } else {
        const { data, error } = await supabase.from('items').insert(payload).select().single();
        if (error) { alert('Não foi possível salvar: ' + error.message); return; }
        items.push(data);
    }
    closeModal();
    render();
}

document.getElementById('btnNew').addEventListener('click', openNew);
document.getElementById('btnCancel').addEventListener('click', closeModal);
document.getElementById('btnSave').addEventListener('click', saveItem);
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target.id === 'modalOverlay') closeModal(); });
document.getElementById('searchInput').addEventListener('input', render);
document.getElementById('catFilter').addEventListener('change', render);

document.getElementById('content').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'inc') adjustQty(id, 1);
    else if (action === 'dec') adjustQty(id, -1);
    else if (action === 'edit') openEdit(id);
    else if (action === 'delete') deleteItem(id);
});

loadItems();