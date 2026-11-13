// Conta do Radar: login por e-mail e senha (Firebase) e sincronização de favoritas e buscas salvas.
// Só é ativado se assets/js/config.js tiver os dados do projeto; sem isso, o site segue sem login.
const cfg = window.RADAR_FIREBASE;
const $ = (id) => document.getElementById(id);
const CHAVE_UID = "radar_conta_uid";          // qual conta já foi ligada a este navegador
const MIN_SENHA = 8;

let fb, auth, db, usuario = null;
let tGravar = null, pendente = false, ultimaLeitura = 0;

const ERROS = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/invalid-email": "Confira o e-mail digitado.",
  "auth/email-already-in-use": "Já existe uma conta com esse e-mail. Entre ou redefina a senha.",
  "auth/weak-password": `A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`,
  "auth/password-does-not-meet-requirements": "A senha não atende aos requisitos mínimos.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  "auth/network-request-failed": "Sem conexão com o serviço de login. Verifique a internet.",
  "auth/user-disabled": "Esta conta foi desativada.",
  "auth/requires-recent-login": "Por segurança, saia, entre de novo e repita a operação.",
  "auth/operation-not-allowed": "O login por e-mail e senha não está ativado no projeto.",
};
const mensagemDe = (e) => ERROS[e && e.code] || "Não foi possível concluir. Tente de novo em instantes.";

// ---------- interface ----------
function mostrar(tela) {
  document.querySelectorAll("#dlg-conta [data-tela]").forEach((el) => (el.hidden = el.dataset.tela !== tela));
  aviso("");
  const primeiro = document.querySelector(`#dlg-conta [data-tela="${tela}"] input`);
  if (primeiro) setTimeout(() => primeiro.focus(), 30);
}
function aviso(texto, tipo = "erro") {
  const el = $("conta-aviso");
  el.textContent = texto;
  el.dataset.tipo = tipo;
  el.hidden = !texto;
}
function ocupado(form, sim) {
  form.querySelectorAll("button, input").forEach((el) => (el.disabled = sim));
}
function situacao(texto) {
  $("conta-situacao").textContent = texto;
}
function atualizarBotao() {
  const b = $("btn-conta");
  b.hidden = false;
  b.textContent = usuario ? "Minha conta" : "Entrar";
  b.classList.toggle("logado", !!usuario);
  b.title = usuario ? usuario.email : "Entrar para guardar favoritas e buscas na sua conta";
}
function abrir() {
  if (usuario) { $("conta-email").textContent = usuario.email; mostrar("conta"); }
  else mostrar("entrar");
  $("dlg-conta").showModal();
}

// ---------- sincronização ----------
const docUsuario = () => fb.doc(db, "usuarios", usuario.uid);

function juntar(local, remoto) {
  if (!remoto) return local;
  const favs = [...new Set([...(remoto.favs || []), ...local.favs])];
  const nomes = new Set((remoto.buscas || []).map((b) => b.nome));
  const buscas = [...(remoto.buscas || []), ...local.buscas.filter((b) => !nomes.has(b.nome))];
  return { favs, buscas };
}

async function puxar() {
  const uid = usuario.uid;
  situacao("Sincronizando…");
  const snap = await fb.getDoc(docUsuario());
  if (!usuario || usuario.uid !== uid) return;            // saiu no meio do caminho
  const remoto = snap.exists() ? snap.data() : null;
  const local = window.RadarDados.ler();
  const primeiraVez = localStorage.getItem(CHAVE_UID) !== uid;
  // 1ª vez neste navegador: soma o que já estava aqui com o que está na conta.
  // Depois disso, a conta é a referência (senão algo removido em outro aparelho voltaria).
  const final = primeiraVez ? juntar(local, remoto) : (remoto ? { favs: remoto.favs || [], buscas: remoto.buscas || [] } : local);
  window.RadarDados.gravar(final);
  localStorage.setItem(CHAVE_UID, uid);
  ultimaLeitura = Date.now();
  if (primeiraVez || !remoto) await empurrar();
  else situacao("Favoritas e buscas sincronizadas.");
}

async function empurrar() {
  if (!usuario) return;
  clearTimeout(tGravar); tGravar = null;
  const d = window.RadarDados.ler();
  try {
    situacao("Salvando…");
    await fb.setDoc(docUsuario(), { favs: d.favs.slice(-2000), buscas: d.buscas.slice(-30), atualizado: fb.serverTimestamp() });
    pendente = false;
    situacao("Favoritas e buscas sincronizadas.");
  } catch (e) {
    pendente = true;
    situacao("Sem conexão com a conta. As mudanças ficam neste navegador e sobem quando a conexão voltar.");
  }
}

function agendarGravacao() {
  if (!usuario) return;
  pendente = true;
  clearTimeout(tGravar);
  tGravar = setTimeout(empurrar, 1500);
}

// ---------- ações ----------
async function entrar(ev) {
  ev.preventDefault();
  const f = ev.currentTarget;
  ocupado(f, true);
  try {
    await fb.signInWithEmailAndPassword(auth, f.email.value.trim(), f.senha.value);
    f.reset();
    $("dlg-conta").close();
  } catch (e) { aviso(mensagemDe(e)); }
  ocupado(f, false);
}

async function criar(ev) {
  ev.preventDefault();
  const f = ev.currentTarget;
  if (f.senha.value.length < MIN_SENHA) return aviso(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`);
  if (f.senha.value !== f.senha2.value) return aviso("As duas senhas não são iguais.");
  if (!f.aceito.checked) return aviso("Para criar a conta, é preciso aceitar a Política de Privacidade.");
  ocupado(f, true);
  try {
    await fb.createUserWithEmailAndPassword(auth, f.email.value.trim(), f.senha.value);
    f.reset();
    $("dlg-conta").close();
  } catch (e) { aviso(mensagemDe(e)); }
  ocupado(f, false);
}

async function redefinir(ev) {
  ev.preventDefault();
  const f = ev.currentTarget;
  ocupado(f, true);
  try { await fb.sendPasswordResetEmail(auth, f.email.value.trim()); } catch (e) {
    if (e.code === "auth/invalid-email" || e.code === "auth/network-request-failed" || e.code === "auth/too-many-requests") {
      ocupado(f, false);
      return aviso(mensagemDe(e));
    }
  }
  // mesma resposta exista ou não a conta, para não revelar quem está cadastrado
  aviso("Se existir uma conta com esse e-mail, enviamos um link para criar uma nova senha. Confira também a caixa de spam.", "ok");
  ocupado(f, false);
}

async function sair() {
  if (pendente) await empurrar();
  await fb.signOut(auth);
  localStorage.removeItem(CHAVE_UID);
  window.RadarDados.gravar({ favs: [], buscas: [] });     // não deixa os dados da conta em um computador compartilhado
  $("dlg-conta").close();
}

async function excluir(ev) {
  ev.preventDefault();
  const f = ev.currentTarget;
  ocupado(f, true);
  try {
    const cred = fb.EmailAuthProvider.credential(usuario.email, f.senha.value);
    await fb.reauthenticateWithCredential(usuario, cred);
    await fb.deleteDoc(docUsuario());
    await fb.deleteUser(usuario);
    localStorage.removeItem(CHAVE_UID);
    f.reset();
    mostrar("entrar");
    aviso("Conta excluída. O e-mail e os dados guardados na conta foram apagados. As favoritas continuam só neste navegador.", "ok");
  } catch (e) { aviso(mensagemDe(e)); }
  ocupado(f, false);
}

// ---------- início ----------
async function iniciar() {
  try {
    fb = await import("../vendor/firebase.js");
    const app = fb.initializeApp(cfg);
    auth = fb.initializeAuth(app, { persistence: [fb.indexedDBLocalPersistence, fb.browserLocalPersistence] });
    db = fb.getFirestore(app);
    if (cfg.emuladores) {        // usado apenas nos testes locais
      fb.connectAuthEmulator(auth, cfg.emuladores.auth, { disableWarnings: true });
      fb.connectFirestoreEmulator(db, cfg.emuladores.firestore[0], cfg.emuladores.firestore[1]);
    }
  } catch (e) {
    console.error("Login indisponível:", e);
    return;
  }

  $("btn-conta").onclick = abrir;
  $("form-entrar").addEventListener("submit", entrar);
  $("form-criar").addEventListener("submit", criar);
  $("form-senha").addEventListener("submit", redefinir);
  $("form-excluir").addEventListener("submit", excluir);
  $("btn-sair").onclick = sair;
  document.querySelectorAll("#dlg-conta [data-ir]").forEach((b) => (b.onclick = () => mostrar(b.dataset.ir)));
  document.querySelectorAll("#dlg-conta [data-fechar]").forEach((b) => (b.onclick = () => $("dlg-conta").close()));
  $("dlg-conta").addEventListener("click", (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });

  window.RadarDados.aoMudar(agendarGravacao);
  addEventListener("online", () => { if (pendente) empurrar(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && pendente) empurrar();
    if (document.visibilityState === "visible" && usuario && !pendente && Date.now() - ultimaLeitura > 60000) puxar().catch(() => {});
  });

  fb.onAuthStateChanged(auth, (u) => {
    usuario = u;
    atualizarBotao();
    if (u) puxar().catch(() => situacao("Não foi possível falar com a conta agora. O site segue funcionando com o que está neste navegador."));
  });
}

if (cfg && cfg.apiKey && window.RadarDados) iniciar();
