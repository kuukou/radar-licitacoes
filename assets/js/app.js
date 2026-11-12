// Radar de Licitações
// Lê data/indice.json (resumo) e data/uf/<UF>.json (licitações de cada estado) e filtra tudo no navegador.
const POR_LOTE = 30;
const DIA = 86400000;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const MODALIDADES = ["Concorrência - Eletrônica", "Concorrência - Presencial", "Concurso", "Credenciamento", "Diálogo Competitivo",
  "Dispensa", "Inexigibilidade", "Leilão - Eletrônico", "Leilão - Presencial", "Manifestação de Interesse",
  "Pregão - Eletrônico", "Pregão - Presencial", "Pré-qualificação"];
const PNCP_ITENS = "https://pncp.gov.br/api/pncp/v1/orgaos";

const $ = (id) => document.getElementById(id);
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const nfmt = (n) => n.toLocaleString("pt-BR");
const reduzMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- estado ----------
let indice = null;
let dados = [];             // licitações dos estados já carregados
let filtrados = [];
let mostrando = 0;
let porId = new Map();
let favs = new Set();
let ufsSel = new Set();
let abertos = new Set();    // cartões expandidos
let soNovas = false;
let novaRef = null;         // "novas" = vistas pela coleta depois deste instante
let buscas = [];            // buscas salvas
let cargas = 0;             // carregamentos de estados em andamento
let radarPts = [];
let radarFixo = false;
const carregadas = new Map();   // uf -> licitações
const pendentes = new Map();    // uf -> promise
const falhou = new Set();       // estados que não carregaram
const itensCache = new Map();   // id -> html dos itens

// ---------- utilidades ----------
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem("radar_" + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("radar_" + k, JSON.stringify(v)); } catch {} },
};
const norm = (s) => (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esc = (s) => (s ?? "").toString().replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const termos = (str) => (str || "").split(",").map((t) => norm(t.trim())).filter(Boolean);

// Links vêm de cadastros de terceiros: só aceita http/https (bloqueia "javascript:" e afins)
// e completa endereços digitados sem o "https://".
function urlSegura(u) {
  u = (u || "").toString().trim();
  if (!u) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u) && /^[a-z0-9-]+(\.[a-z0-9-]+)+([/:?#]|$)/i.test(u)) u = "https://" + u;
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:" ? x.href : "";
  } catch { return ""; }
}

function partesId(id) {
  const m = /^(\d{14})-\d+-0*(\d+)\/(\d{4})$/.exec(id || "");
  return m ? { cnpj: m[1], seq: m[2], ano: m[3] } : null;
}
function linkDe(r) {
  const proprio = urlSegura(r.link || r.l);
  if (proprio) return proprio;
  const p = partesId(r.id);
  return p ? `https://pncp.gov.br/app/editais/${p.cnpj}/${p.ano}/${p.seq}` : (urlSegura(r.origem) || "https://pncp.gov.br/app/editais");
}

// Nomes de órgãos vêm em MAIÚSCULAS; deixa em caixa normal preservando siglas.
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "a", "o", "as", "os", "para", "por", "com", "ao", "aos", "à", "às"]);
const SIGLAS = new Set(["SAAE", "SAE", "DAE", "SESC", "SENAI", "SENAC", "SESI", "SEBRAE", "SEST", "SENAT", "SENAR", "INSS", "IBGE", "IBAMA", "DNIT",
  "FUNASA", "FNDE", "EBSERH", "CODEVASF", "DNOCS", "INCRA", "ICMBIO", "ANVISA", "EMBRAPA", "FIOCRUZ", "CEFET", "UNESP", "USP", "UNICAMP",
  "DER", "DETRAN", "ME", "EPP", "SA", "SUS", "UPA", "CAU", "OAB", "CREA", "CRO", "CREF", "COREN", "CRECI", "CRA", "CRM",
  "TCE", "TCM", "TCU", "TRE", "AGU", "MPU", "DPU", "PRF", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII"]);
function nomeProprio(s) {
  if (!s) return "";
  const letras = s.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (!letras || letras !== letras.toUpperCase()) return s;   // já está em caixa mista
  const partes = s.split(/(\s+|[-/().,])/);
  let primeira = true;
  return partes.map((w, i) => {
    if (!w || /^(\s+|[-/().,])$/.test(w)) return w;
    const anterior = (partes[i - 1] || "").trim();
    const ehUF = UFS.includes(w) && (anterior === "-" || anterior === "/" || i === partes.length - 1);
    const semVogal = w.length >= 2 && w.length <= 5 && !/[AEIOUÁÉÍÓÚÂÊÔÃÕ]/.test(w);
    const universidade = /^(UF|IF|UE)[A-Z]{2,4}$/.test(w) || /^(TJ|MP|TR[EFT])[A-Z0-9]{0,3}$/.test(w);
    const eraPrimeira = primeira;
    primeira = false;
    if (ehUF || semVogal || universidade || SIGLAS.has(w)) return w;
    const min = w.toLowerCase();
    if (!eraPrimeira && MINUSCULAS.has(min)) return min;
    return min.charAt(0).toUpperCase() + min.slice(1);
  }).join("");
}

function preparar(x) {
  for (const k of ["objeto", "info", "orgao", "unidade", "municipio", "modalidade", "disputa", "origem", "numero"]) x[k] = x[k] || "";
  x.valor = Number(x.valor) || 0;
  x.origem = urlSegura(x.origem);
  x._busca = norm([x.objeto, x.info, x.orgao, x.unidade, x.municipio].join(" "));
  x._enc = x.encerra ? Date.parse(x.encerra) : Infinity;
  x._pub = x.publicada ? Date.parse(x.publicada) : 0;
  x._visto = Date.parse(x.visto || x.publicada || "") || 0;
  x._val = x.valor >= 10 ? x.valor : 0;      // valores simbólicos (R$ 1, R$ 0,01) não contam
  return x;
}
const ehNova = (r) => novaRef !== null && r._visto > novaRef;

// ---------- carregamento dos estados ----------
function ufsNecessarias() {
  const comDados = Object.keys(indice.ufs || {});
  return ufsSel.size ? comDados.filter((u) => ufsSel.has(u)) : comDados;
}

function carregarUF(uf) {
  if (carregadas.has(uf)) return Promise.resolve();
  if (!pendentes.has(uf)) {
    pendentes.set(uf, fetch(`data/uf/${uf}.json?v=${indice.ufs[uf].v || ""}`)
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((d) => { carregadas.set(uf, (d.itens || []).map(preparar)); falhou.delete(uf); })
      .catch(() => falhou.add(uf))
      .finally(() => pendentes.delete(uf)));
  }
  return pendentes.get(uf);
}

function reconstruir() {
  dados = [].concat(...carregadas.values());
  porId = new Map(dados.map((r) => [r.id, r]));
}

let tRender = null;
function agendarRender() {
  if (tRender) return;
  tRender = setTimeout(() => { tRender = null; aplicar({ manter: true }); }, 400);
}

async function garantirDados() {
  if (!indice) return;
  const faltam = ufsNecessarias().filter((u) => !carregadas.has(u)).sort((a, b) => indice.ufs[a].n - indice.ufs[b].n);
  if (!faltam.length) return;
  cargas++;
  let i = 0;
  const trabalhador = async () => {
    while (i < faltam.length) {
      await carregarUF(faltam[i++]);
      reconstruir();
      agendarRender();
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, faltam.length) }, trabalhador));
  cargas--;
  clearTimeout(tRender); tRender = null;
  atualizarMunicipios();
  aplicar({ manter: true });
}

// ---------- abertura: contador + radar ----------
function animarContador(alvo) {
  const el = $("contador");
  if (reduzMovimento || alvo < 10) { el.textContent = nfmt(alvo); return; }
  const dur = 1400, t0 = performance.now();
  const passo = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = nfmt(Math.round(alvo * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

function desenharRadar() {
  const agora = Date.now();
  radarPts = (indice.radar || []).map((p) => ({ ...p, _e: Date.parse(p.e) })).filter((p) => p._e > agora && p._e - agora < 7 * DIA);
  radarPts.forEach((p) => {
    // ângulo estável por licitação; distância ao centro = tempo até o prazo
    let h = 0;
    for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const ang = (h % 360) * Math.PI / 180;
    const frac = Math.max(0.08, Math.min(1, (p._e - agora) / (7 * DIA)));
    const raio = 10 + frac * 84;
    p.x = 100 + Math.sin(ang) * raio;
    p.y = 100 - Math.cos(ang) * raio;
    p.atraso = ((h % 360) / 360) * 4;       // acende quando a varredura passa
    p.urg = p._e - agora < 2 * DIA;
  });
  $("blips").innerHTML = radarPts.map((p) =>
    `<circle class="blip${p.urg ? " urg" : ""}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.urg ? 2.6 : 2}"/>`).join("");
  [...$("blips").children].forEach((c, i) => (c.style.animationDelay = radarPts[i].atraso.toFixed(2) + "s"));
  $("alvos").innerHTML = radarPts.map((p, i) =>
    `<circle class="alvo" data-i="${i}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7"/>`).join("");
}

function mostrarPop(i, fixo) {
  const p = radarPts[i];
  if (!p) return;
  radarFixo = fixo;
  const foco = $("radar-foco");
  foco.setAttribute("cx", p.x); foco.setAttribute("cy", p.y);
  const pr = prazo(p._e);
  const local = [p.m, p.uf].filter(Boolean).join("/");
  const pop = $("radar-pop");
  pop.innerHTML = `
    <p class="pop-prazo ${pr.cls}">Encerra ${pr.falta}</p>
    <p class="pop-obj">${esc(p.o)}</p>
    <p class="pop-org">${esc(nomeProprio(p.g))}${local ? " — " + esc(local) : ""}</p>
    <div class="pop-acoes">
      <a class="btn-edital" href="${esc(linkDe(p))}" target="_blank" rel="noopener">Abrir edital</a>
      <button class="btn-mini" data-ver="${i}">Ver na lista</button>
    </div>`;
  const svg = document.querySelector("#radar svg");
  pop.style.top = (p.y / 200 * svg.clientWidth + 14) + "px";
  pop.hidden = false;
}
function esconderPop() {
  radarFixo = false;
  $("radar-pop").hidden = true;
  $("radar-foco").setAttribute("cx", -20);
}

async function mostrarNaLista(p) {
  esconderPop();
  definirFiltros({ ufs: [p.uf], dias: "7", ord: "enc-asc" });
  atualizarMunicipios();
  aplicar();
  await garantirDados();
  aplicar();
  const idx = filtrados.findIndex((r) => r.id === p.id);
  if (idx < 0) { $("resultados").scrollIntoView(); return; }
  if (idx >= mostrando) renderMais(idx + 1 - mostrando);
  const li = document.querySelector(`.item[data-id="${CSS.escape(p.id)}"]`);
  if (!li) return;
  if (!li.classList.contains("aberto")) alternarItem(li);
  li.scrollIntoView({ block: "center", behavior: reduzMovimento ? "auto" : "smooth" });
  li.classList.add("foco");
  setTimeout(() => li.classList.remove("foco"), 2600);
}

// ---------- filtros ----------
function garantirOpcao(sel, valor, rotulo) {
  if (valor && ![...sel.options].some((o) => o.value === valor)) sel.add(new Option(rotulo ? rotulo(valor) : valor, valor));
}

function lerFiltros() {
  return {
    q: $("f-txt").value, nao: $("f-not").value, ufs: [...ufsSel].sort(), mun: $("f-mun").value, mod: $("f-mod").value,
    vmin: $("f-vmin").value, vmax: $("f-vmax").value, dias: $("f-dias").value, fav: $("f-fav").checked,
    novas: soNovas, ord: $("ord").value,
  };
}

function definirFiltros(f = {}) {
  $("f-txt").value = f.q || "";
  $("f-not").value = f.nao || "";
  $("f-mun").value = f.mun || "";
  garantirOpcao($("f-mod"), f.mod || "");
  $("f-mod").value = f.mod || "";
  $("f-vmin").value = f.vmin || "";
  $("f-vmax").value = f.vmax || "";
  garantirOpcao($("f-dias"), f.dias || "", (d) => `${d} dias`);
  $("f-dias").value = f.dias || "";
  $("f-fav").checked = !!f.fav;
  soNovas = !!f.novas;
  ufsSel = new Set((f.ufs || []).filter((u) => UFS.includes(u)));
  $("ord").value = f.ord || "enc-asc";
  if (!$("ord").value) $("ord").value = "enc-asc";
}

const temFiltro = (f) => !!(f.q.trim() || f.nao.trim() || f.ufs.length || f.mun.trim() || f.mod || f.vmin || f.vmax || f.dias || f.fav || f.novas);
const chaveBusca = (f) => JSON.stringify([termos(f.q), termos(f.nao), f.ufs || [], norm((f.mun || "").trim()), f.mod || "", f.vmin || "", f.vmax || "", f.dias || "", !!f.fav]);

// versões antigas do site guardavam os filtros com outros nomes
function migrar(f) {
  if (!f || !("f-txt" in f)) return f;
  return { q: f["f-txt"], nao: f["f-not"], ufs: f.ufs || [], mun: f["f-mun"], mod: f["f-mod"], vmin: f["f-vmin"], vmax: f["f-vmax"], dias: f["f-dias"], fav: !!f["f-fav"], ord: f.ord };
}

function filtrosDaURL() {
  const p = new URLSearchParams(location.search);
  if (!["q", "nao", "uf", "mun", "mod", "min", "max", "dias", "ord"].some((k) => p.has(k))) return null;
  return {
    q: p.get("q") || "", nao: p.get("nao") || "", ufs: (p.get("uf") || "").toUpperCase().split(",").filter(Boolean),
    mun: p.get("mun") || "", mod: p.get("mod") || "", vmin: p.get("min") || "", vmax: p.get("max") || "",
    dias: p.get("dias") || "", ord: p.get("ord") || "",
  };
}

function guardarFiltros(f) {
  const { novas, ...resto } = f;
  store.set("filtros", resto);
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.nao.trim()) p.set("nao", f.nao.trim());
  if (f.ufs.length) p.set("uf", f.ufs.join(","));
  if (f.mun.trim()) p.set("mun", f.mun.trim());
  if (f.mod) p.set("mod", f.mod);
  if (f.vmin) p.set("min", f.vmin);
  if (f.vmax) p.set("max", f.vmax);
  if (f.dias) p.set("dias", f.dias);
  if (f.ord && f.ord !== "enc-asc") p.set("ord", f.ord);
  const qs = p.toString();
  try { history.replaceState(null, "", qs ? "?" + qs : location.pathname); } catch {}
}

function aplicar(op = {}) {
  const f = lerFiltros();
  const inc = termos(f.q), exc = termos(f.nao);
  const mun = norm(f.mun.trim()), mod = norm(f.mod);
  const vmin = parseFloat(f.vmin), vmax = parseFloat(f.vmax), dias = parseFloat(f.dias);
  const agora = Date.now();
  const lim = isNaN(dias) ? null : agora + dias * DIA;

  filtrados = dados.filter((r) => {
    if (r._enc < agora) return false;
    if (ufsSel.size && !ufsSel.has(r.uf)) return false;
    if (f.fav && !favs.has(r.id)) return false;
    if (f.novas && !ehNova(r)) return false;
    if (mun && !norm(r.municipio).includes(mun)) return false;
    if (mod && norm(r.modalidade) !== mod) return false;
    if (!isNaN(vmin) && r._val < vmin) return false;
    if (!isNaN(vmax) && r._val > vmax) return false;
    if (lim !== null && r._enc > lim) return false;
    if (inc.length && !inc.some((t) => r._busca.includes(t))) return false;
    if (exc.length && exc.some((t) => r._busca.includes(t))) return false;
    return true;
  });

  const cmp = {
    "enc-asc": (a, b) => a._enc - b._enc,
    "val-desc": (a, b) => b._val - a._val,
    "val-asc": (a, b) => (a._val || Infinity) - (b._val || Infinity),   // sem valor vai para o fim
    "pub-desc": (a, b) => b._pub - a._pub,
  }[f.ord] || ((a, b) => a._enc - b._enc);
  filtrados.sort(cmp);

  guardarFiltros(f);
  sincronizar(f);
  const alvo = op.manter ? Math.max(mostrando, POR_LOTE) : POR_LOTE;
  mostrando = 0;
  $("lista").innerHTML = "";
  renderMais(alvo, !op.manter);
}

// aplica os filtros e busca os estados que ainda faltam
function atualizar() {
  aplicar();
  garantirDados();
}

// ---------- interface dos filtros ----------
const ATALHOS = {
  novas: { ativo: () => soNovas, liga: () => (soNovas = true), desliga: () => (soNovas = false) },
  semana: { ativo: () => $("f-dias").value === "7", liga: () => ($("f-dias").value = "7"), desliga: () => ($("f-dias").value = "") },
  pregao: modalidadeAtalho(/preg.*eletr/i),
  dispensa: modalidadeAtalho(/^dispensa/i),
  fav: { ativo: () => $("f-fav").checked, liga: () => ($("f-fav").checked = true), desliga: () => ($("f-fav").checked = false) },
};
function modalidadeAtalho(re) {
  const achar = () => [...$("f-mod").options].find((o) => re.test(o.value));
  return {
    ativo: () => { const o = achar(); return !!o && $("f-mod").value === o.value; },
    liga: () => { const o = achar(); if (o) $("f-mod").value = o.value; },
    desliga: () => ($("f-mod").value = ""),
  };
}

function montarEstados() {
  $("estados").innerHTML = UFS.filter((u) => indice.ufs[u]).map((u) =>
    `<button class="uf" data-uf="${u}" aria-pressed="${ufsSel.has(u)}">${u}<small>${nfmt(indice.ufs[u].n)}</small></button>`).join("");
}

function montarModalidades() {
  const atual = $("f-mod").value;
  const nomes = [...new Set([...MODALIDADES, ...dados.map((r) => r.modalidade).filter(Boolean), atual].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (nomes.length + 1 === $("f-mod").options.length) return;
  $("f-mod").innerHTML = `<option value="">Todas</option>` + nomes.map((m) => `<option>${esc(m)}</option>`).join("");
  $("f-mod").value = atual;
}

function atualizarMunicipios() {
  const base = ufsSel.size ? dados.filter((r) => ufsSel.has(r.uf)) : dados;
  const muns = [...new Set(base.map((r) => r.municipio).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  $("dl-mun").innerHTML = muns.map((m) => `<option value="${esc(m)}">`).join("");
  $("f-mun").placeholder = ufsSel.size ? `Qualquer em ${[...ufsSel].sort().join(", ")}` : "Qualquer";
  montarModalidades();
}

let ultimoAtivos = null;
function sincronizar(f) {
  // atalhos
  document.querySelectorAll("[data-atalho]").forEach((b) => b.setAttribute("aria-pressed", ATALHOS[b.dataset.atalho].ativo()));
  const nNovas = novaRef === null ? 0 : dados.reduce((n, r) => n + (ehNova(r) && r._enc >= Date.now() ? 1 : 0), 0);
  $("chip-novas").hidden = !(nNovas || soNovas);
  $("chip-novas").textContent = `Novas (${nfmt(nNovas)})`;

  // estados
  document.querySelectorAll(".uf").forEach((b) => b.setAttribute("aria-pressed", ufsSel.has(b.dataset.uf)));
  $("btn-ufs-limpar").hidden = !ufsSel.size;
  $("estados-legenda").textContent = ufsSel.size ? `Estados selecionados: ${ufsSel.size}` : "Estados (escolha um ou mais)";

  // contador do botão Filtros
  const n = [f.nao.trim(), f.mun.trim(), f.mod, f.vmin, f.vmax, f.dias].filter(Boolean).length + (f.fav ? 1 : 0) + (f.ufs.length ? 1 : 0);
  $("n-filtros").textContent = n;
  $("n-filtros").hidden = n === 0;

  // filtros ativos, removíveis
  const c = [];
  f.q.split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => c.push(["q", t, `“${t}”`]));
  if (f.nao.trim()) c.push(["nao", "", `Sem: ${f.nao.trim()}`]);
  f.ufs.forEach((u) => c.push(["uf", u, u]));
  if (f.mun.trim()) c.push(["mun", "", f.mun.trim()]);
  if (f.mod) c.push(["mod", "", f.mod]);
  if (f.vmin) c.push(["vmin", "", `A partir de ${brl.format(+f.vmin)}`]);
  if (f.vmax) c.push(["vmax", "", `Até ${brl.format(+f.vmax)}`]);
  if (f.dias) c.push(["dias", "", `Encerra em até ${f.dias} dias`]);
  if (f.fav) c.push(["fav", "", "Favoritas"]);
  if (f.novas) c.push(["novas", "", "Novas"]);
  const html = c.map(([t, v, rot]) =>
    `<button class="ativo" data-t="${t}" data-v="${esc(v)}" aria-label="Remover filtro ${esc(rot)}">${esc(rot)}<span aria-hidden="true">✕</span></button>`).join("")
    + (c.length > 1 ? `<button class="link" data-t="tudo">Limpar tudo</button>` : "");
  if (html !== ultimoAtivos) { $("ativos").innerHTML = html; ultimoAtivos = html; }

  // buscas salvas
  const chave = chaveBusca(f);
  const igual = buscas.findIndex((b) => chaveBusca(b.f) === chave);
  $("salvas").innerHTML = buscas.map((b, i) =>
    `<span class="chip salva" data-ativa="${i === igual}"><button class="salva-nome" data-busca="${i}" aria-pressed="${i === igual}">${esc(b.nome)}</button>` +
    `<button class="salva-rm" data-rm-busca="${i}" aria-label="Apagar a busca salva ${esc(b.nome)}">✕</button></span>`).join("");
  $("btn-salvar").hidden = !(temFiltro({ ...f, novas: false }) && igual < 0 && $("form-salvar").hidden);
}

function removerFiltro(t, v) {
  if (t === "q") $("f-txt").value = $("f-txt").value.split(",").map((x) => x.trim()).filter((x) => x && x !== v).join(", ");
  else if (t === "nao") $("f-not").value = "";
  else if (t === "uf") ufsSel.delete(v);
  else if (t === "mun") $("f-mun").value = "";
  else if (t === "mod") $("f-mod").value = "";
  else if (t === "vmin") $("f-vmin").value = "";
  else if (t === "vmax") $("f-vmax").value = "";
  else if (t === "dias") $("f-dias").value = "";
  else if (t === "fav") $("f-fav").checked = false;
  else if (t === "novas") soNovas = false;
  else if (t === "tudo") definirFiltros({ ord: $("ord").value });
  atualizarMunicipios();
  atualizar();
}

// ---------- buscas salvas ----------
function sugerirNome(f) {
  const partes = [f.q.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 2).join(", "), f.ufs.slice(0, 3).join(", "), f.mun.trim(), f.mod].filter(Boolean);
  return (partes.slice(0, 2).join(" · ") || "Minha busca").slice(0, 32);
}
function abrirFormSalvar(abrir) {
  $("form-salvar").hidden = !abrir;
  if (abrir) {
    $("btn-salvar").hidden = true;
    $("nome-busca").value = sugerirNome(lerFiltros());
    $("nome-busca").focus(); $("nome-busca").select();
  } else sincronizar(lerFiltros());
}
function salvarBusca(nome) {
  const { novas, ...f } = lerFiltros();
  buscas = buscas.filter((b) => b.nome !== nome).concat({ nome, f }).slice(-12);
  store.set("buscas", buscas);
  abrirFormSalvar(false);
}

// ---------- lista ----------
function destacar(texto, inc) {
  if (!inc.length || !texto) return esc(texto);
  const n = norm(texto);
  if (n.length !== texto.length) return esc(texto);    // normalização mudou o tamanho: não arrisca marcar errado
  const marcas = [];
  inc.forEach((t) => { let i = n.indexOf(t); while (i >= 0) { marcas.push([i, i + t.length]); i = n.indexOf(t, i + t.length); } });
  if (!marcas.length) return esc(texto);
  marcas.sort((a, b) => a[0] - b[0]);
  let out = "", pos = 0;
  for (const [a, b] of marcas) {
    if (a < pos) continue;
    out += esc(texto.slice(pos, a)) + "<mark>" + esc(texto.slice(a, b)) + "</mark>";
    pos = b;
  }
  return out + esc(texto.slice(pos));
}

function prazo(enc) {
  if (enc === Infinity || isNaN(enc)) return { dia: "—", mes: "sem data", falta: "", cls: "" };
  const d = new Date(enc);
  const falta = (enc - Date.now()) / DIA;
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(d); alvo.setHours(0, 0, 0, 0);
  const dias = Math.round((alvo - hoje) / DIA);          // diferença em dias de calendário
  let txt;
  if (falta < 0) txt = "encerrada";
  else if (dias === 0) txt = `hoje, ${hora}`;
  else if (dias === 1) txt = `amanhã, ${hora}`;
  else txt = `em ${dias} dias`;
  return { dia: d.getDate(), mes: MESES[d.getMonth()], falta: txt, cls: falta < 2 ? "urg" : falta < 7 ? "breve" : "" };
}

const fmtData = (iso) => iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "não informada";

function rotuloDisputa(d) {
  const min = d.toLowerCase();
  return min.includes("disputa") ? min.charAt(0).toUpperCase() + min.slice(1) : "Disputa " + min;
}

function valorHTML(r) {
  if (r._val) return `<div class="valor">${brl.format(r.valor)}</div>`;
  return `<div class="valor nd">${r.valor ? "Valor simbólico<br>(sem estimativa)" : "Valor não divulgado"}</div>`;
}

function itemHTML(r, inc) {
  const p = prazo(r._enc);
  const fav = favs.has(r.id);
  const aberto = abertos.has(r.id);
  const local = [r.municipio, r.uf].filter(Boolean).join("/");
  return `<li class="item ${p.cls}${aberto ? " aberto" : ""}" data-id="${esc(r.id)}">
    <div class="prazo" title="Encerramento das propostas">
      <span class="dia">${p.dia}</span><span class="mes">${p.mes}</span><span class="falta">${p.falta}</span>
    </div>
    <div class="corpo" role="button" tabindex="0" aria-expanded="${aberto}">
      <p class="objeto">${destacar(r.objeto || "Objeto não informado", inc)}</p>
      <p class="orgao">${destacar(nomeProprio(r.orgao), inc)}${local ? ` — ${destacar(local, inc)}` : ""}</p>
      <div class="tags">
        ${ehNova(r) ? `<span class="tag nova">Nova</span>` : ""}
        ${r.sit ? `<span class="tag alerta">${esc(r.sit)}</span>` : ""}
        ${r.modalidade ? `<span class="tag">${esc(r.modalidade)}</span>` : ""}
        ${r.srp ? `<span class="tag">Registro de preços</span>` : ""}
        ${r.disputa ? `<span class="tag">${esc(rotuloDisputa(r.disputa))}</span>` : ""}
      </div>
      <div class="detalhes"><div>
        <dl>
          <dt>Número</dt><dd>${esc(r.numero || "—")}</dd>
          ${r.unidade ? `<dt>Unidade</dt><dd>${esc(nomeProprio(r.unidade))}</dd>` : ""}
          <dt>Propostas de</dt><dd>${fmtData(r.abertura)} até ${fmtData(r.encerra)}</dd>
          <dt>Publicada em</dt><dd>${fmtData(r.publicada)}</dd>
        </dl>
        ${r.info ? `<p class="info">${destacar(r.info, inc)}</p>` : ""}
        <div class="itens"></div>
        ${r.encerra ? `<button class="btn-mini" data-agenda>Adicionar prazo à agenda</button>` : ""}
      </div></div>
    </div>
    <div class="lado">
      ${valorHTML(r)}
      <div class="acoes">
        <button class="estrela" data-fav aria-pressed="${fav}" aria-label="${fav ? "Remover das favoritas" : "Salvar nas favoritas"}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>
        </button>
        <a class="btn-edital" href="${esc(linkDe(r))}" target="_blank" rel="noopener">Abrir edital</a>
      </div>
      ${r.origem ? `<a class="origem" href="${esc(r.origem)}" target="_blank" rel="noopener">Onde enviar proposta</a>` : ""}
    </div>
  </li>`;
}

const ESQUELETOS = `<li class="esqueleto" aria-hidden="true"></li>`.repeat(4);

function renderMais(qtd = POR_LOTE, animar = true) {
  const inc = termos($("f-txt").value);
  const lista = $("lista");
  const lote = filtrados.slice(mostrando, mostrando + qtd);
  if (mostrando === 0 && !lote.length) {
    if (cargas > 0 || !indice) lista.innerHTML = ESQUELETOS;
    else if (indice && !indice.total) lista.innerHTML = `<li class="vazio"><strong>Os dados ainda estão sendo coletados.</strong>Volte em alguns minutos.</li>`;
    else lista.innerHTML = `<li class="vazio"><strong>Nada encontrado com esses filtros.</strong>Tente menos palavras, outro estado ou um prazo maior.</li>`;
  } else {
    const antes = lista.children.length;
    lista.insertAdjacentHTML("beforeend", lote.map((r) => itemHTML(r, inc)).join(""));
    const novos = [...lista.children].slice(antes);
    if (animar && !reduzMovimento) novos.forEach((li, i) => {
      li.style.animationDelay = `${Math.min(i, 12) * 25}ms`;
      li.classList.add("entra");
    });
    novos.forEach((li) => { if (li.classList.contains("aberto")) carregarItens(li); });
  }
  mostrando += lote.length;

  const total = filtrados.length;
  const soma = filtrados.reduce((s, r) => s + r._val, 0);
  let txt = "";
  if (indice) {
    txt = `<b>${nfmt(total)}</b> ${total === 1 ? "licitação" : "licitações"}${soma ? `, somando ${brl.format(soma)} estimados` : ""}`;
    if (cargas > 0) {
      const nec = ufsNecessarias();
      txt += ` <span class="carga">· carregando estados (${nec.filter((u) => carregadas.has(u)).length} de ${nec.length})</span>`;
    } else if (falhou.size) {
      txt += ` <span class="carga">· não foi possível carregar: ${[...falhou].sort().join(", ")}</span>`;
    }
  }
  $("resumo").innerHTML = txt;
  const restam = total - mostrando;
  $("btn-mais").hidden = restam <= 0;
  $("btn-mais").textContent = `Mostrar mais ${nfmt(Math.min(restam, POR_LOTE))} de ${nfmt(restam)}`;
}

function alternarItem(li) {
  const aberto = li.classList.toggle("aberto");
  li.querySelector(".corpo").setAttribute("aria-expanded", aberto);
  aberto ? abertos.add(li.dataset.id) : abertos.delete(li.dataset.id);
  if (aberto) carregarItens(li);
}

// ---------- itens da licitação (direto do PNCP, só quando o cartão é aberto) ----------
async function carregarItens(li) {
  const id = li.dataset.id;
  const caixa = li.querySelector(".itens");
  if (!caixa || caixa.dataset.ok) return;
  caixa.dataset.ok = "1";
  if (itensCache.has(id)) { caixa.innerHTML = itensCache.get(id); return; }
  const p = partesId(id);
  if (!p) return;
  caixa.innerHTML = `<p class="itens-msg">Carregando itens…</p>`;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 25000);
    const res = await fetch(`${PNCP_ITENS}/${p.cnpj}/compras/${p.ano}/${p.seq}/itens?pagina=1&tamanhoPagina=20`, { signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const itens = await res.json();
    let html = "";
    if (Array.isArray(itens) && itens.length) {
      const qtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
      html = `<p class="itens-titulo">O que está sendo comprado</p><ol class="itens-lista">` + itens.slice(0, 10).map((it) => {
        const un = (it.unidadeMedida || "").toLowerCase();
        const preco = !it.orcamentoSigiloso && it.valorUnitarioEstimado >= 0.01 ? ` · ${brl2.format(it.valorUnitarioEstimado)} cada` : "";
        return `<li><span>${esc((it.descricao || "").trim() || "Item sem descrição")}</span><small>${qtd.format(it.quantidade || 0)} ${esc(un)}${preco}</small></li>`;
      }).join("") + `</ol>` + (itens.length > 10 ? `<p class="itens-msg">Mostrando os 10 primeiros itens. A lista completa está no edital.</p>` : "");
    }
    itensCache.set(id, html);
    caixa.innerHTML = html;
  } catch {
    caixa.innerHTML = `<p class="itens-msg">Não foi possível carregar os itens agora. Eles estão no edital.</p>`;
    delete caixa.dataset.ok;
  }
}

// ---------- agenda (.ics) ----------
function baixarArquivo(nome, conteudo, tipo) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function baixarAgenda(r) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(r.encerra || "");
  if (!m) return;
  // contas feitas "em UTC" só para manipular os campos; o fuso real vai no TZID
  const fim = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
  const fmt = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").slice(0, 15);
  const txt = (s) => String(s).replace(/([\\;,])/g, "\\$1").replace(/\r?\n/g, "\\n");
  const local = [r.municipio, r.uf].filter(Boolean).join("/");
  const descricao = [nomeProprio(r.orgao) + (local ? " — " + local : ""), r._val ? "Valor estimado: " + brl.format(r.valor) : "",
    "Edital: " + linkDe(r), r.origem ? "Envio de proposta: " + r.origem : ""].filter(Boolean).join("\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Radar de Licitacoes//PT-BR", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${r.id.replace(/[^\w-]/g, "-")}@radar-licitacoes`,
    `DTSTAMP:${fmt(Date.now())}Z`,
    `DTSTART;TZID=America/Sao_Paulo:${fmt(fim - 30 * 60000)}`,
    `DTEND;TZID=America/Sao_Paulo:${fmt(fim)}`,
    `SUMMARY:${txt("Prazo de licitação: " + r.objeto.slice(0, 90))}`,
    `DESCRIPTION:${txt(descricao)}`,
    `URL:${linkDe(r)}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Prazo de licitação amanhã", "TRIGGER:-P1D", "END:VALARM",
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Prazo de licitação em 2 horas", "TRIGGER:-PT2H", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  baixarArquivo("prazo-licitacao.ics", ics, "text/calendar;charset=utf-8");
}

// ---------- planilha e link ----------
function baixarPlanilha() {
  const cols = [["Objeto", (r) => r.objeto], ["Órgão", (r) => r.orgao], ["Unidade", (r) => r.unidade], ["Município", (r) => r.municipio], ["UF", (r) => r.uf],
    ["Modalidade", (r) => r.modalidade], ["Valor estimado", null], ["Abertura das propostas", (r) => r.abertura],
    ["Encerramento das propostas", (r) => r.encerra], ["Número", (r) => r.numero], ["Edital no PNCP", linkDe], ["Onde enviar proposta", (r) => r.origem]];
  const q = (v) => {
    let t = (v ?? "").toString().replace(/\r?\n/g, " ");
    if (/^[=+\-@\t]/.test(t)) t = "'" + t;      // texto que começa com = + - @ viraria fórmula no Excel
    return `"${t.replace(/"/g, '""')}"`;
  };
  const linhas = [cols.map((c) => q(c[0])).join(";")]
    .concat(filtrados.map((r) => cols.map(([, fn]) => (fn ? q(fn(r)) : String(r.valor).replace(".", ","))).join(";")));
  baixarArquivo(`licitacoes_${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + linhas.join("\r\n"), "text/csv;charset=utf-8");
}

async function copiarLink(btn) {
  const url = location.href;
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch {
    const i = document.createElement("input");
    i.value = url; document.body.appendChild(i); i.select();
    try { ok = document.execCommand("copy"); } catch {}
    i.remove();
  }
  const antes = "Copiar link da busca";
  btn.textContent = ok ? "Link copiado" : "Copie o endereço da página";
  setTimeout(() => (btn.textContent = antes), 2200);
}

// ---------- tema ----------
function rotuloTema() {
  const escuro = document.documentElement.dataset.tema === "escuro";
  $("btn-tema").setAttribute("aria-label", escuro ? "Ativar modo claro" : "Ativar modo escuro");
}
function trocarTema(ev) {
  const novo = document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro";
  const aplicarTema = () => { document.documentElement.dataset.tema = novo; store.set("tema", novo); rotuloTema(); };
  if (!document.startViewTransition || reduzMovimento) return aplicarTema();
  const r = ev.currentTarget.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const raio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const st = document.documentElement.style;
  st.setProperty("--tx", x + "px"); st.setProperty("--ty", y + "px"); st.setProperty("--tr", raio + "px");
  document.startViewTransition(aplicarTema);
}

// ---------- visitas: o que é "novo" ----------
function iniciarVisita(gerado) {
  const v = store.get("visita");
  const agora = Date.now();
  let anterior = null;
  if (v) anterior = agora - v.quando > 45 * 60000 ? v.atual : v.anterior;   // recarregar a página não zera as novidades
  store.set("visita", { atual: gerado, anterior, quando: agora });
  novaRef = anterior ? Date.parse(anterior) : null;
}

// ---------- eventos ----------
function abrirPainel(abrir) {
  const p = $("painel");
  $("btn-filtros").setAttribute("aria-expanded", abrir);
  p.hidden = !abrir;
  if (abrir) { p.classList.remove("abrindo"); void p.offsetWidth; p.classList.add("abrindo"); }
}

function ligarEventos() {
  let t;
  const deb = () => { clearTimeout(t); t = setTimeout(aplicar, 200); };
  ["f-txt", "f-not", "f-mun", "f-vmin", "f-vmax"].forEach((id) => $(id).addEventListener("input", deb));
  ["f-mod", "f-dias", "ord", "f-fav"].forEach((id) => $(id).addEventListener("change", () => aplicar()));

  $("btn-filtros").onclick = () => abrirPainel($("painel").hidden);
  $("btn-limpar").onclick = () => { definirFiltros({ q: $("f-txt").value, ord: $("ord").value }); atualizarMunicipios(); atualizar(); };
  $("estados").addEventListener("click", (ev) => {
    const b = ev.target.closest(".uf");
    if (!b) return;
    const u = b.dataset.uf;
    ufsSel.has(u) ? ufsSel.delete(u) : ufsSel.add(u);
    $("f-mun").value = "";
    atualizarMunicipios();
    atualizar();
  });
  $("btn-ufs-limpar").onclick = () => { ufsSel.clear(); atualizarMunicipios(); atualizar(); };

  document.querySelectorAll("[data-atalho]").forEach((b) => (b.onclick = () => {
    const a = ATALHOS[b.dataset.atalho];
    a.ativo() ? a.desliga() : a.liga();
    aplicar();
  }));

  // buscas salvas
  $("btn-salvar").onclick = () => abrirFormSalvar(true);
  $("btn-cancelar-salvar").onclick = () => abrirFormSalvar(false);
  $("form-salvar").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const nome = $("nome-busca").value.trim();
    if (nome) salvarBusca(nome);
  });
  $("salvas").addEventListener("click", (ev) => {
    const rm = ev.target.closest("[data-rm-busca]");
    if (rm) {
      buscas.splice(+rm.dataset.rmBusca, 1);
      store.set("buscas", buscas);
      sincronizar(lerFiltros());
      return;
    }
    const b = ev.target.closest("[data-busca]");
    if (b) { definirFiltros(buscas[+b.dataset.busca].f); atualizarMunicipios(); atualizar(); }
  });

  $("ativos").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-t]");
    if (b) removerFiltro(b.dataset.t, b.dataset.v);
  });

  $("btn-mais").onclick = () => renderMais();
  $("btn-csv").onclick = baixarPlanilha;
  $("btn-link").onclick = (ev) => copiarLink(ev.currentTarget);
  $("btn-tema").onclick = trocarTema;
  $("btn-topo").onclick = () => window.scrollTo({ top: 0, behavior: reduzMovimento ? "auto" : "smooth" });
  addEventListener("scroll", () => $("btn-topo").classList.toggle("visivel", scrollY > 700), { passive: true });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((ents) => {
      if (ents.some((e) => e.isIntersecting) && mostrando < filtrados.length) renderMais();
    }, { rootMargin: "600px 0px" }).observe($("sentinela"));
    // barra de busca fica mais enxuta quando gruda no topo
    new IntersectionObserver(([e]) => {
      $("busca").classList.toggle("presa", !e.isIntersecting && e.boundingClientRect.top < 0);
    }).observe($("marca-busca"));
  }

  // lista
  $("lista").addEventListener("click", (ev) => {
    const li = ev.target.closest(".item");
    if (!li) return;
    const est = ev.target.closest("[data-fav]");
    if (est) {
      const id = li.dataset.id;
      const on = !favs.has(id);
      on ? favs.add(id) : favs.delete(id);
      store.set("favs", [...favs]);
      est.setAttribute("aria-pressed", on);
      est.setAttribute("aria-label", on ? "Remover das favoritas" : "Salvar nas favoritas");
      est.classList.remove("pop"); void est.offsetWidth; if (on) est.classList.add("pop");
      return;
    }
    if (ev.target.closest("[data-agenda]")) { const r = porId.get(li.dataset.id); if (r) baixarAgenda(r); return; }
    if (ev.target.closest("a") || ev.target.closest(".detalhes")) return;   // dentro dos detalhes dá para selecionar texto
    if (ev.target.closest(".corpo")) alternarItem(li);
  });
  $("lista").addEventListener("keydown", (ev) => {
    if (ev.target.classList.contains("corpo") && (ev.key === "Enter" || ev.key === " ")) {
      ev.preventDefault();
      alternarItem(ev.target.closest(".item"));
    }
  });

  // radar
  $("alvos").addEventListener("mouseover", (ev) => {
    const a = ev.target.closest(".alvo");
    if (a && !radarFixo) mostrarPop(+a.dataset.i, false);
  });
  $("radar").addEventListener("mouseleave", () => { if (!radarFixo) esconderPop(); });
  $("radar").addEventListener("click", (ev) => {
    const ver = ev.target.closest("[data-ver]");
    if (ver) { mostrarNaLista(radarPts[+ver.dataset.ver]); return; }
    const a = ev.target.closest(".alvo");
    if (a) mostrarPop(+a.dataset.i, true);
  });
  document.addEventListener("click", (ev) => { if (radarFixo && !ev.target.closest("#radar")) esconderPop(); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") esconderPop(); });
}

// ---------- início ----------
async function init() {
  favs = new Set(store.get("favs") || []);
  buscas = store.get("buscas") || [];
  rotuloTema();
  ligarEventos();
  const inicial = filtrosDaURL() || migrar(store.get("filtros")) || {};
  definirFiltros(inicial);
  montarModalidades();

  try {
    const res = await fetch("data/indice.json?v=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    indice = await res.json();
  } catch (e) {
    $("status").textContent = `Não foi possível carregar os dados (${e.message}). Recarregue a página em instantes.`;
    $("lista").innerHTML = `<li class="vazio"><strong>Os dados não carregaram.</strong>Verifique sua conexão e recarregue a página.</li>`;
    return;
  }
  indice.ufs = indice.ufs || {};
  iniciarVisita(indice.gerado);
  $("status").textContent = `Dados do PNCP atualizados em ${indice.atualizado}.`;
  animarContador(indice.total || 0);
  desenharRadar();
  montarEstados();
  const f = lerFiltros();
  if ([f.nao, f.mun, f.mod, f.vmin, f.vmax].some(Boolean) || f.ufs.length) abrirPainel(true);
  aplicar();
  await garantirDados();
}

init();
