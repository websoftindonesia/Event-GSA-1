const $ = (id) => document.getElementById(id);
const form = $('registration-form'), statusBox = $('form-status'), submitButton = $('submit-button');
const fields = ['fullName', 'email', 'university', 'major', 'semester', 'motivation', 'expectation'];
$('year').textContent = new Date().getFullYear();

const semesterSelect = $('semester');
for (let i = 1; i <= 14; i++) semesterSelect.add(new Option(`Semester ${i}`, String(i)));

/* Progres */
const stepTitles = { fullName: 'Kenalan dulu', email: 'Alamat Gmail kamu', university: 'Asal kampusmu', major: 'Jurusan yang kamu tekuni', semester: 'Sedang di semester berapa?', motivation: 'Alasanmu bergabung', expectation: 'Harapan satu tahun ke depan' };
function updateProgress() {
  const filled = fields.filter((n) => $(n).value.trim() !== '');
  const next = fields.find((n) => $(n).value.trim() === '');
  const done = filled.length;
  $('progress-count').textContent = done;
  $('progress-fill').style.width = `${(done / 7) * 100}%`;
  $('progress-step').textContent = String(Math.min(fields.indexOf(next) + 1 || 7, 7)).padStart(2, '0');
  $('progress-title').textContent = next ? stepTitles[next] : 'Siap dikirim';
  document.querySelector('.progress-track').setAttribute('aria-valuenow', done);
  const profileDone = fields.slice(0, 5).every((n) => $(n).value.trim() !== '');
  $('stage-profile').className = `stage ${profileDone ? 'complete' : 'active'}`;
  $('stage-story').className = `stage ${done === 7 ? 'complete' : profileDone ? 'active' : ''}`;
}

for (const name of ['motivation', 'expectation']) {
  const input = $(name), counter = $(`${name}-count`);
  const update = () => {
    counter.textContent = `${input.value.length} / ${input.maxLength}`;
    counter.className = `counter${input.value.length >= input.maxLength ? ' at-limit' : input.value.length >= input.maxLength * 0.9 ? ' near-limit' : ''}`;
  };
  input.addEventListener('input', update);
  update();
}

function validateField(input) {
  const wrapper = input.closest('.field'), error = $(`${input.name}-error`);
  const value = input.value.trim();
  let message = '';
  if (!value) message = 'Bagian ini wajib diisi.';
  else if (input.name === 'email') { if (!/^[^\s@]+@gmail\.com$/i.test(value)) message = 'Masukkan alamat email dengan domain @gmail.com.'; }
  else if (input.name === 'fullName' && value.length < 3) message = 'Nama lengkap minimal 3 karakter.';
  else if (['university', 'major'].includes(input.name) && value.length < 2) message = 'Isi minimal 2 karakter.';
  else if (['motivation', 'expectation'].includes(input.name) && value.length < 20) message = 'Ceritakan sedikit lebih banyak (minimal 20 karakter).';
  else if (input.name === 'semester' && !(Number(value) >= 1 && Number(value) <= 14)) message = 'Pilih semester yang tersedia.';
  wrapper.setAttribute('aria-invalid', String(Boolean(message)));
  input.setAttribute('aria-invalid', String(Boolean(message)));
  error.textContent = message;
  return !message;
}

for (const name of fields) {
  const input = $(name);
  input.addEventListener('blur', () => validateField(input));
  input.addEventListener('input', () => { updateProgress(); if (input.getAttribute('aria-invalid') === 'true') validateField(input); });
  input.addEventListener('change', () => { updateProgress(); validateField(input); });
}
updateProgress();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusBox.className = 'form-status';
  statusBox.textContent = '';
  const valid = fields.map((n) => validateField($(n))).every(Boolean);
  if (!valid) {
    form.querySelector('[aria-invalid="true"]')?.focus();
    statusBox.textContent = 'Periksa kembali bagian yang ditandai sebelum mengirim.';
    statusBox.className = 'form-status visible failure';
    return;
  }
  submitButton.disabled = true;
  submitButton.querySelector('span:first-child').textContent = 'Mengirim...';
  try {
    const response = await fetch('/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Pendaftaran belum dapat dikirim.');
    form.reset();
    for (const name of fields) {
      $(name).removeAttribute('aria-invalid');
      $(name).closest('.field').removeAttribute('aria-invalid');
      $(`${name}-error`).textContent = '';
    }
    for (const name of ['motivation', 'expectation']) { $(`${name}-count`).textContent = '0 / 500'; $(`${name}-count`).className = 'counter'; }
    updateProgress();
    statusBox.textContent = 'Pendaftaran berhasil dikirim. Terima kasih sudah berbagi cerita, sampai bertemu di Beyond Code!';
    statusBox.className = 'form-status visible success';
    const wa = document.querySelector('meta[name="wa-group"]')?.content;
    if (wa && !wa.includes('GANTI_DENGAN')) {
      const link = document.createElement('a');
      link.className = 'wa-btn'; link.href = wa; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z"/><path stroke-width="3.2" transform="translate(6.3 6.3) scale(.48)" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span>Gabung grup WhatsApp</span>';
      statusBox.append(link);
    }
    statusBox.focus();
  } catch (error) {
    statusBox.textContent = error.message || 'Terjadi kendala. Coba lagi sebentar lagi.';
    statusBox.className = 'form-status visible failure';
    statusBox.focus();
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector('span:first-child').textContent = 'Kirim pendaftaran';
  }
});

/* Chatbot Gemini */
const panel = $('chat-panel'), log = $('chat-log'), chatInput = $('chat-input'), chatForm = $('chat-form');
const history = [];
let busy = false;

function addMessage(text, kind) {
  const el = document.createElement('div');
  el.className = `msg ${kind}`;
  el.textContent = text;
  log.append(el);
  log.scrollTop = log.scrollHeight;
  return el;
}
function toggleChat(open) {
  panel.hidden = !open;
  $('chat-open').setAttribute('aria-expanded', String(open));
  if (open) {
    if (!log.children.length) addMessage('Halo! Saya asisten Gemini untuk pendaftaran Beyond Code. Ada yang bisa saya bantu?', 'bot');
    if (matchMedia('(pointer: fine)').matches) chatInput.focus();
  }
}
async function sendChat(text) {
  if (busy || !text.trim()) return;
  busy = true;
  $('chat-chips').hidden = true;
  addMessage(text, 'user');
  history.push({ role: 'user', text });
  const typing = addMessage('Gemini sedang mengetik...', 'bot typing');
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Chatbot sedang bermasalah.');
    typing.remove();
    addMessage(data.reply, 'bot');
    history.push({ role: 'assistant', text: data.reply });
  } catch (err) {
    typing.remove();
    history.pop();
    addMessage(err.message || 'Chatbot sedang bermasalah.', 'bot error');
  } finally { busy = false; if (matchMedia('(pointer: fine)').matches) chatInput.focus(); }
}
$('chat-open').addEventListener('click', () => toggleChat(panel.hidden));
$('chat-close').addEventListener('click', () => { toggleChat(false); $('chat-open').focus(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) toggleChat(false); });
chatForm.addEventListener('submit', (e) => { e.preventDefault(); const t = chatInput.value; chatInput.value = ''; sendChat(t); });
$('chat-chips').addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') sendChat(e.target.textContent); });