// SPA with Firebase Auth + Firestore + Admin Panel
const app = document.getElementById('app');

let CURRENT_USER = null;
let IS_ADMIN = false;

// ---- AUTH ----
auth.onAuthStateChanged(async (user) => {
  CURRENT_USER = user || null;
  await checkAdmin();
  paintAuthUI();
  router();
});

function paintAuthUI(){
  const userBox = document.getElementById('userBox');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const adminLink = document.getElementById('adminLink');
  if (CURRENT_USER){
    userBox.textContent = `Hello, ${CURRENT_USER.displayName || CURRENT_USER.email}`;
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-block';
  } else {
    userBox.textContent = '';
    loginBtn.style.display = 'inline-block';
    logoutBtn.style.display = 'none';
  }
  adminLink.style.display = IS_ADMIN ? 'inline-block' : 'none';
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginBtn').onclick = async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    } catch (e) { alert(e.message); }
  };
  document.getElementById('logoutBtn').onclick = async () => { await auth.signOut(); };
});

async function checkAdmin(){
  if (!CURRENT_USER){ IS_ADMIN = false; return; }
  try{
    const doc = await db.collection('admins').doc(CURRENT_USER.uid).get();
    IS_ADMIN = doc.exists;
  }catch{ IS_ADMIN = false; }
}

// ---- FIRESTORE HELPERS ----
async function fetchCases(){
  const snap = await db.collection('cases').orderBy('updatedAt','desc').get();
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function fetchCasesByStage(stage){
  const snap = await db.collection('cases').where('stage','==',stage).orderBy('updatedAt','desc').get();
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function fetchCaseById(id){
  const snap = await db.collection('cases').doc(id).get();
  if (!snap.exists) return null;
  return { id:snap.id, ...snap.data() };
}
async function createCase(data){
  if (!CURRENT_USER) throw new Error('Please login first');
  const now = Date.now();
  const doc = {
    title: data.title, stage: data.stage,
    summary: data.summary || '', details: data.details || '',
    ownerUid: CURRENT_USER.uid, ownerName: CURRENT_USER.displayName || CURRENT_USER.email,
    createdAt: now, updatedAt: now
  };
  const ref = await db.collection('cases').add(doc);
  return ref.id;
}
async function updateCase(id, patch){
  if (!CURRENT_USER) throw new Error('Please login first');
  const ref = db.collection('cases').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Case not found');
  const data = snap.data();
  if (data.ownerUid !== CURRENT_USER.uid && !IS_ADMIN) throw new Error('You can only edit your own case');
  await ref.update({ ...patch, updatedAt: Date.now() });
}
async function deleteCase(id){
  if (!CURRENT_USER) throw new Error('Please login first');
  const ref = db.collection('cases').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data();
  if (data.ownerUid !== CURRENT_USER.uid && !IS_ADMIN) throw new Error('You can only delete your own case');
  await ref.delete();
}
async function fetchComments(caseId){
  const snap = await db.collection('cases').doc(caseId).collection('comments').orderBy('createdAt','asc').get();
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function addComment(caseId, text){
  if (!CURRENT_USER) throw new Error('Please login to comment');
  const now = Date.now();
  await db.collection('cases').doc(caseId).collection('comments').add({
    text: String(text||'').trim(),
    authorUid: CURRENT_USER.uid,
    authorName: CURRENT_USER.displayName || CURRENT_USER.email,
    createdAt: now, hidden: false
  });
}
async function deleteComment(caseId, commentId){
  if (!CURRENT_USER) throw new Error('Please login');
  await db.collection('cases').doc(caseId).collection('comments').doc(commentId).delete();
}
async function hideComment(caseId, commentId, hidden=true){
  if (!CURRENT_USER) throw new Error('Please login');
  await db.collection('cases').doc(caseId).collection('comments').doc(commentId).update({ hidden: !!hidden });
}

// Admin helpers
async function listAdmins(){
  const snap = await db.collection('admins').get();
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}
async function addAdmin(uid){
  if (!IS_ADMIN) throw new Error('Only admins can add admins');
  await db.collection('admins').doc(uid).set({ isAdmin: true });
}
async function removeAdmin(uid){
  if (!IS_ADMIN) throw new Error('Only admins can remove admins');
  await db.collection('admins').doc(uid).delete();
}

// ---- UTIL ----
function h2(s){ return `<h2>${s}</h2>`; }
function esc(s){ return (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function timeAgo(ms){
  const s = Math.floor((Date.now()-ms)/1000);
  if (s<60) return s+'s ago';
  const m=Math.floor(s/60); if(m<60) return m+'m ago';
  const h=Math.floor(m/60); if(h<24) return h+'h ago';
  const d=Math.floor(h/24); if(d<7) return d+'d ago';
  const w=Math.floor(d/7); if(w<4) return w+'w ago';
  const mo=Math.floor(d/30); if(mo<12) return mo+'mo ago';
  const y=Math.floor(d/365); return y+'y ago';
}

// ---- VIEWS ----
async function renderHome(){
  app.innerHTML = `
    <div class="grid grid-2">
      <section class="card">
        ${h2('Welcome')}
        <p class="muted">This webpage has been created for discussion on <b>Contract Management</b> issues. Explore cases by stage — Pre‑Tender, During Tender, and Post‑Tender — submit new cases, and collaborate.</p>
        <div style="margin-top:8px;">
          <a href="#/new" class="btn">Submit a Case</a>
          <a href="#/all" class="btn" style="background:#fff;color:var(--ink);border-color:var(--border);">View All Cases</a>
        </div>
      </section>
      <section class="card">
        ${h2('Categories')}
        <div class="grid grid-3">
          <a class="card" href="#/category/pretender"><b>Pre‑Tender</b><p class="muted">Eligibility/BEC, evaluation plan, specs.</p></a>
          <a class="card" href="#/category/during"><b>During Tender</b><p class="muted">Clarifications, deviations, corrigenda.</p></a>
          <a class="card" href="#/category/post"><b>Post‑Tender</b><p class="muted">LD vs EOT, claims, arbitration.</p></a>
        </div>
      </section>
      ${!IS_ADMIN ? '' : `
      <section class="card alert">
        <b>Admin tip:</b> Use the Admin page to add/remove moderators.
      </section>`}
    </div>
  `;
}

async function renderAll(){
  app.innerHTML = `<div class="card">${h2('All Cases')}<p class="muted">Loading…</p></div>`;
  const items = await fetchCases();
  app.innerHTML = `<div>${h2('All Cases')}</div>`;
  if (!items.length){
    app.innerHTML += `<div class="card"><p class="muted">No cases yet.</p><a href="#/new" class="btn">Submit a Case</a></div>`;
    return;
  }
  for (const c of items){
    const stageTitle = c.stage==='pretender' ? 'Pre‑Tender' : c.stage==='during' ? 'During Tender' : 'Post‑Tender';
    const sec = document.createElement('section');
    sec.className = 'card';
    sec.innerHTML = `
      <div class="kv">
        <div><b>Title</b></div><div><a href="#/case/${c.id}">${esc(c.title)}</a></div>
        <div><b>Stage</b></div><div><span class="badge">${stageTitle}</span></div>
        <div><b>Owner</b></div><div>${esc(c.ownerName||'')}</div>
        <div><b>Updated</b></div><div>${timeAgo(c.updatedAt||c.createdAt)}</div>
      </div>
      <div class="hr"></div>
      <p>${esc(c.summary||'')}</p>
      <div class="hr"></div>
      <h3>Comments</h3>
      <div id="cwrap-${c.id}" class="muted">Loading comments…</div>
    `;
    app.appendChild(sec);

    const wrapId = `cwrap-${c.id}`;
    const loadComments = async () => {
      const list = await fetchComments(c.id);
      const wrap = document.getElementById(wrapId);
      if (!wrap) return;
      if (!list.length){
        wrap.innerHTML = `<p class="muted">No comments yet.</p>`;
      } else {
        wrap.innerHTML = list.map(cm => `
          <div class="comment" ${cm.hidden ? 'style="opacity:.6;"' : ''}>
            <div><b>${esc(cm.authorName||'')}</b> • <span class="muted">${timeAgo(cm.createdAt)}</span>${cm.hidden ? ' • <i>(hidden)</i>' : ''}</div>
            <div>${esc(cm.text)}</div>
            <div class="text-right" style="margin-top:6px;">
              ${(CURRENT_USER && (CURRENT_USER.uid===cm.authorUid || IS_ADMIN)) ? `
                <button class="btn small" onclick="(async()=>{ try{ await hideComment('${c.id}','${cm.id}', ${'true' if False else ''}); }catch(e){ alert(e.message);} })()"></button>
              ` : ''}
            </div>
          </div>
        `).join('');
      }
      if (CURRENT_USER){
        const form = document.createElement('form');
        form.innerHTML = `
          <div style="margin-top:10px;">
            <textarea class="input" name="text" rows="3" placeholder="Write a comment…"></textarea>
            <div class="text-right" style="margin-top:8px;"><button class="btn small" type="submit">Add Comment</button></div>
          </div>`;
        form.onsubmit = async (e) => {
          e.preventDefault();
          const text = new FormData(form).get('text');
          try{ await addComment(c.id, text); await loadComments(); }
          catch(err){ alert('Could not add comment: ' + err.message); }
        };
        wrap.appendChild(form);
      } else {
        const tip = document.createElement('p');
        tip.className = 'muted';
        tip.textContent = 'Login to comment.';
        wrap.appendChild(tip);
      }
    };
    await loadComments();
  }
}

async function renderCategory(stage){
  const title = stage==='pretender' ? 'Pre‑Tender' : stage==='during' ? 'During Tender' : 'Post‑Tender';
  app.innerHTML = `<div class="card">${h2(title+' — Cases')}<p class="muted">Loading…</p></div>`;
  const items = await fetchCasesByStage(stage);
  if (!items.length){
    app.innerHTML = `<div class="card">${h2(title+' — Cases')}<p class="muted">No cases yet.</p><p><a class="btn" href="#/new">Submit a Case</a></p></div>`;
    return;
  }
  app.innerHTML = `<div>${h2(title+' — Cases')}</div>`;
  items.forEach(c => {
    const el = document.createElement('section');
    el.className = 'card';
    el.innerHTML = `
      <div class="kv">
        <div><b>Title</b></div><div><a href="#/case/${c.id}">${esc(c.title)}</a></div>
        <div><b>Stage</b></div><div><span class="badge">${title}</span></div>
        <div><b>Updated</b></div><div>${timeAgo(c.updatedAt||c.createdAt)}</div>
      </div>
      <div class="hr"></div>
      <p>${esc(c.summary||'')}</p>
      <div class="text-right"><a class="btn small" href="#/case/${c.id}">Open</a></div>
    `;
    app.appendChild(el);
  });
}

async function renderLibrary(){
  app.innerHTML = `<div class="card">${h2('Case Library')}<p class="muted">Loading…</p></div>`;
  const items = await fetchCases();
  app.innerHTML = `<div>${h2('Case Library')}</div>`;
  if (!items.length){
    app.innerHTML += `<div class="card"><p class="muted">No cases yet.</p><a href="#/new" class="btn">Submit a Case</a></div>`;
    return;
  }
  items.forEach(c => {
    const title = c.stage==='pretender' ? 'Pre‑Tender' : c.stage==='during' ? 'During Tender' : 'Post‑Tender';
    const el = document.createElement('section');
    el.className = 'card';
    el.innerHTML = `
      <div class="kv">
        <div><b>Title</b></div><div><a href="#/case/${c.id}">${esc(c.title)}</a></div>
        <div><b>Stage</b></div><div><span class="badge">${title}</span></div>
        <div><b>Updated</b></div><div>${timeAgo(c.updatedAt||c.createdAt)}</div>
      </div>
      <div class="hr"></div>
      <p>${esc(c.summary||'')}</p>
      <div class="text-right"><a class="btn small" href="#/case/${c.id}">Open</a></div>
    `;
    app.appendChild(el);
  });
}

async function renderNew(){
  if (!CURRENT_USER){
    app.innerHTML = `<div class="card">${h2('Submit a Case')}<p class="muted">Please <b>Login</b> first to submit a case.</p></div>`;
    return;
  }
  app.innerHTML = `
    <section class="card">
      ${h2('Submit a Case')}
      <form id="caseForm">
        <label>Title</label>
        <input class="input" name="title" required placeholder="e.g., Whether mutual value counts toward BEC turnover?">
        <label style="margin-top:8px;">Stage</label>
        <select class="input" name="stage" required>
          <option value="">Select stage</option>
          <option value="pretender">Pre‑Tender</option>
          <option value="during">During Tender</option>
          <option value="post">Post‑Tender</option>
        </select>
        <label style="margin-top:8px;">Short Summary</label>
        <textarea class="input" name="summary" rows="3" placeholder="1–3 lines context"></textarea>
        <label style="margin-top:8px;">Details</label>
        <textarea class="input" name="details" rows="6" placeholder="Facts, chronology, clauses, analysis, risks, options…"></textarea>
        <div class="text-right" style="margin-top:10px;">
          <button class="btn" type="submit">Save</button>
        </div>
      </form>
    </section>
  `;
  const form = document.getElementById('caseForm');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try{
      const id = await createCase(data);
      location.hash = `#/case/${id}`;
    }catch(err){
      alert('Could not save: ' + err.message);
    }
  };
}

async function renderCase(id){
  app.innerHTML = `<div class="card">${h2('Case')}<p class="muted">Loading…</p></div>`;
  const c = await fetchCaseById(id);
  if (!c){ app.innerHTML = `<div class="card"><p>Case not found.</p></div>`; return; }
  const titleStage = c.stage==='pretender' ? 'Pre‑Tender' : c.stage==='during' ? 'During Tender' : 'Post‑Tender';
  const canEdit = CURRENT_USER && (CURRENT_USER.uid === c.ownerUid || IS_ADMIN);

  const el = document.createElement('section');
  el.className = 'card';
  el.innerHTML = `
    ${h2(esc(c.title))}
    <div class="kv" style="margin-top:8px;">
      <div><b>Stage</b></div><div><span class="badge">${titleStage}</span></div>
      <div><b>Owner</b></div><div>${esc(c.ownerName || '')}</div>
      <div><b>Updated</b></div><div>${timeAgo(c.updatedAt || c.createdAt)}</div>
    </div>
    <div class="hr"></div>
    <h3>Summary</h3>
    <div id="summaryView"><p>${esc(c.summary || '')}</p></div>
    ${canEdit ? `<textarea id="summaryEdit" class="input" style="display:none;" rows="3">${esc(c.summary || '')}</textarea>` : ''}
    <h3 style="margin-top:10px;">Details</h3>
    <div id="detailsView"><p>${esc(c.details || '')}</p></div>
    ${canEdit ? `<textarea id="detailsEdit" class="input" style="display:none;" rows="8">${esc(c.details || '')}</textarea>` : ''}
    <div class="text-right" style="margin-top:10px;">
      ${canEdit ? `<button id="editBtn" class="btn small">Edit</button> <button id="saveBtn" class="btn small" style="display:none;">Save</button> <button id="delBtn" class="btn small danger">Delete</button>` : ''}
    </div>
  `;
  app.innerHTML = '';
  app.appendChild(el);

  const comCard = document.createElement('section');
  comCard.className = 'card';
  comCard.innerHTML = `${h2('Comments')}<div id="commentsWrap" class="muted">Loading comments…</div>`;
  app.appendChild(comCard);

  const renderComments = async () => {
    const list = await fetchComments(id);
    const wrap = document.getElementById('commentsWrap');
    if (!list.length){
      wrap.innerHTML = `<p class="muted">No comments yet.</p>`;
    } else {
      wrap.innerHTML = list.map(cm => `
        <div class="comment" ${cm.hidden ? 'style="opacity:.6;"' : ''}>
          <div><b>${esc(cm.authorName || '')}</b> • <span class="muted">${timeAgo(cm.createdAt)}</span>${cm.hidden ? ' • <i>(hidden)</i>' : ''}</div>
          <div>${esc(cm.text)}</div>
          <div class="text-right" style="margin-top:6px;">
            ${(CURRENT_USER && (CURRENT_USER.uid===cm.authorUid || IS_ADMIN)) ? `
              <button class="btn small" onclick="(async()=>{ try{ await hideComment('${id}','${cm.id}', ${'false' if False else ''}); }catch(e){ alert(e.message);} })()">${'Hide'}</button>
              <button class="btn small danger" onclick="(async()=>{ if(confirm('Delete this comment?')){ try{ await deleteComment('${id}','${cm.id}'); renderComments(); }catch(e){ alert(e.message);} } })()">Delete</button>
            ` : ''}
          </div>
        </div>
      `).join('');
    }
    if (CURRENT_USER){
      const form = document.createElement('form');
      form.innerHTML = `
        <div style="margin-top:10px;">
          <textarea class="input" name="text" rows="3" placeholder="Write a comment…"></textarea>
          <div class="text-right" style="margin-top:8px;">
            <button class="btn small" type="submit">Add Comment</button>
          </div>
        </div>`;
      form.onsubmit = async (e) => {
        e.preventDefault();
        const text = new FormData(form).get('text');
        try{ await addComment(id, text); await renderComments(); }
        catch(err){ alert('Could not add comment: ' + err.message); }
      };
      wrap.appendChild(form);
    } else {
      const tip = document.createElement('p');
      tip.className = 'muted';
      tip.textContent = 'Login to comment.';
      wrap.appendChild(tip);
    }
  };
  await renderComments();

  if (canEdit){
    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveBtn');
    const delBtn  = document.getElementById('delBtn');
    const sumV = document.getElementById('summaryView');
    const sumE = document.getElementById('summaryEdit');
    const detV = document.getElementById('detailsView');
    const detE = document.getElementById('detailsEdit');
    let editing = false;

    editBtn.onclick = () => {
      editing = !editing;
      sumV.style.display = editing ? 'none' : 'block';
      detV.style.display = editing ? 'none' : 'block';
      if (sumE) sumE.style.display = editing ? 'block' : 'none';
      if (detE) detE.style.display = editing ? 'block' : 'none';
      editBtn.style.display = editing ? 'none' : 'inline-block';
      saveBtn.style.display = editing ? 'inline-block' : 'none';
    };
    saveBtn.onclick = async () => {
      try{
        await updateCase(id, { summary: sumE.value, details: detE.value });
        location.reload();
      }catch(err){
        alert('Save failed: ' + err.message);
      }
    };
    delBtn.onclick = async () => {
      if (!confirm('Delete this case?')) return;
      try{
        await deleteCase(id);
        location.hash = '#/library';
      }catch(err){
        alert('Delete failed: ' + err.message);
      }
    };
  }
}

// Admin Panel
async function renderAdmin(){
  if (!IS_ADMIN){
    app.innerHTML = `<div class="card">${h2('Admin')}<p class="muted">You must be an admin to access this page.</p></div>`;
    return;
  }
  app.innerHTML = `<section class="card">${h2('Admin')}<p class="muted">Add or remove admins by UID.</p><div id="adminsBox">Loading…</div></section>`;
  const box = document.getElementById('adminsBox');

  const refresh = async () => {
    const admins = await listAdmins();
    box.innerHTML = `
      <div>
        <label>New Admin UID</label>
        <input class="input" id="newUID" placeholder="Paste Firebase UID here"/>
        <div class="text-right" style="margin-top:8px;">
          <button class="btn small" id="addBtn">Add Admin</button>
        </div>
      </div>
      <div class="hr"></div>
      <h3>Existing Admins</h3>
      ${admins.length ? admins.map(a => `
        <div class="kv" style="align-items:start;">
          <div><b>UID</b></div><div><code>${a.uid}</code></div>
          <div><b>isAdmin</b></div><div>${a.isAdmin ? 'true' : 'false'}</div>
          <div></div><div><button class="btn small danger" onclick="(async()=>{ if(confirm('Remove this admin?')){ try{ await removeAdmin('${a.uid}'); refresh(); }catch(e){ alert(e.message);} } })()">Remove</button></div>
        </div>
        <div class="hr"></div>
      `).join('') : '<p class="muted">No admins found.</p>'}
    `;
    document.getElementById('addBtn').onclick = async () => {
      const uid = document.getElementById('newUID').value.trim();
      if (!uid) return alert('Enter a UID');
      try { await addAdmin(uid); refresh(); } catch(e){ alert(e.message); }
    };
  };
  await refresh();
}

// ---- ROUTER ----
function router(){
  const hash = location.hash || '#/';
  if (hash === '#/' || hash === '') return renderHome();
  if (hash === '#/all') return renderAll();
  if (hash === '#/library') return renderLibrary();
  if (hash.startsWith('#/category/')){ const stage = hash.split('/')[2]; return renderCategory(stage); }
  if (hash === '#/new') return renderNew();
  if (hash.startsWith('#/case/')){ const id = hash.split('/')[2]; return renderCase(id); }
  if (hash === '#/admin') return renderAdmin();
  app.innerHTML = `<div class="card"><p>Page not found.</p></div>`;
}
window.addEventListener('hashchange', router);
router();
