// Radar de Licitações — carrega data/licitacoes.json e filtra no navegador.
const POR_LOTE = 30;
const DIA = 86400000;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const $ = (id) => document.getElementById(id);
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const nfmt = (n) => n.toLocaleString("pt-BR");
const reduzMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;

let dados = [];
let filtrados = [];
let favs = new Set();
let mostrando = 0;

// ---------- utilidades ----------
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem("radar_" + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("radar_" + k, JSON.stringify(v)); } catch {} },
};
const norm = (s) => (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esc = (s) => (s ?? "").toString().replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const termos = (str) => str.split(",").map((t) => norm(t.trim())).filter(Boolean);

function preparar(x) {
  x._busca = norm([x.objeto, x.info, x.orgao, x.unidade, x.municipio].join(" "));
  x._enc = x.encerra ? Date.parse(x.encerra) : Infinity;
  x._pub = x.publicada ? Date.parse(x.publicada) : 0;
  return x;
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
  const proximas = dados.filter((r) => r._enc !== Infinity && r._enc - agora < 7 * DIA).slice(0, 160);
  const g = $("blips");
  g.innerHTML = proximas.map((r) => {
    // ângulo estável por licitação; distância ao centro = tempo até o prazo
    let h = 0;
    for (const ch of r.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const ang = (h % 360) * Math.PI / 180;
    const frac = Math.max(0.08, Math.min(1, (r._enc - agora) / (7 * DIA)));
    const raio = 10 + frac * 84;
    const x = 100 + Math.sin(ang) * raio, y = 100 - Math.cos(ang) * raio;
    const atraso = ((h % 360) / 360) * 4; // aparece quando a varredura passa
    const urg = r._enc - agora < 2 * DIA;
    return `<circle class="blip${urg ? " urg" : ""}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${urg ? 2.6 : 2}" style="animation-delay:${atraso.toFixed(2)}s"/>`;
  }).join("");
}

// ---------- filtros ----------
const CAMPOS = ["f-txt", "f-not", "f-uf", "f-mun", "f-mod", "f-vmin", "f-vmax", "f-dias", "ord"];

function aplicar() {
  const inc = termos($("f-txt").value);
  const exc = termos($("f-not").value);
  const uf = $("f-uf").value;
  const mun = norm($("f-mun").value.trim());
  const mod = $("f-mod").value;
  const vmin = parseFloat($("f-vmin").value);
  const vmax = parseFloat($("f-vmax").value);
  const dias = parseFloat($("f-dias").value);
  const soFav = $("f-fav").checked;
  const lim = isNaN(dias) ? null : Date.now() + dias * DIA;

  filtrados = dados.filter((r) => {
    if (soFav && !favs.has(r.id)) return false;
    if (uf && r.uf !== uf) return false;
    if (mun && !norm(r.municipio).includes(mun)) return false;
    if (mod && r.modalidade !== mod) return false;
    if (!isNaN(vmin) && r.valor < vmin) return false;
    if (!isNaN(vmax) && r.valor > vmax) return false;
    if (lim !== null && r._enc > lim) return false;
    if (inc.length && !inc.some((t) => r._busca.includes(t))) return false;
    if (exc.length && exc.some((t) => r._busca.includes(t))) return false;
    return true;
  });

  const cmp = {
    "enc-asc": (a, b) => a._enc - b._enc,
    "val-desc": (a, b) => b.valor - a.valor,
    "val-asc": (a, b) => a.valor - b.valor,
    "pub-desc": (a, b) => b._pub - a._pub,
  }[$("ord").value] || ((a, b) => a._enc - b._enc);
  filtrados.sort(cmp);

  salvarFiltros();
  sincronizarAtalhos();
  contarFiltros();
  mostrando = 0;
  $("lista").innerHTML = "";
  renderMais();
}

function salvarFiltros() {
  const f = {};
  CAMPOS.forEach((id) => (f[id] = $(id).value));
  f["f-fav"] = $("f-fav").checked;
  store.set("filtros", f);
}

function contarFiltros() {
  const n = ["f-not", "f-uf", "f-mun", "f-mod", "f-vmin", "f-vmax", "f-dias"].filter((id) => $(id).value).length + ($("f-fav").checked ? 1 : 0);
  $("n-filtros").textContent = n;
  $("n-filtros").hidden = n === 0;
}

function montarOpcoes() {
  const ufs = [...new Set(dados.map((r) => r.uf).filter(Boolean))].sort();
  $("f-uf").innerHTML = `<option value="">Todos</option>` + ufs.map((u) => `<option>${u}</option>`).join("");
  const mods = [...new Set(dados.map((r) => r.modalidade).filter(Boolean))].sort();
  $("f-mod").innerHTML = `<option value="">Todas</option>` + mods.map((m) => `<option>${esc(m)}</option>`).join("");
  const muns = [...new Set(dados.map((r) => r.municipio).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  $("dl-mun").innerHTML = muns.map((m) => `<option value="${esc(m)}">`).join("");
}

// ---------- atalhos ----------
const ATALHOS = {
  semana: { ativo: () => $("f-dias").value === "7", liga: () => ($("f-dias").value = "7"), desliga: () => ($("f-dias").value = "") },
  pregao: modalidadeAtalho(/preg.*eletr/i),
  dispensa: modalidadeAtalho(/dispensa/i),
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
function sincronizarAtalhos() {
  document.querySelectorAll("[data-atalho]").forEach((b) => b.setAttribute("aria-pressed", ATALHOS[b.dataset.atalho].ativo()));
}

// ---------- lista ----------
function destacar(texto, inc) {
  if (!inc.length || !texto) return esc(texto);
  const n = norm(texto);
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

function prazo(r) {
  if (r._enc === Infinity) return { dia: "—", mes: "sem data", falta: "", cls: "" };
  const d = new Date(r._enc);
  const falta = (r._enc - Date.now()) / DIA;
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(d); alvo.setHours(0, 0, 0, 0);
  const dias = Math.round((alvo - hoje) / DIA);   // diferença em dias de calendário
  let txt;
  if (falta < 0) txt = "encerrada";
  else if (dias === 0) txt = `hoje, ${hora}`;
  else if (dias === 1) txt = `amanhã, ${hora}`;
  else txt = `em ${dias} dias`;
  return { dia: d.getDate(), mes: MESES[d.getMonth()], falta: txt, cls: falta < 2 ? "urg" : falta < 7 ? "breve" : "" };
}

const fmtData = (iso) => iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "não informada";

function itemHTML(r, inc) {
  const p = prazo(r);
  const fav = favs.has(r.id);
  const local = [r.municipio, r.uf].filter(Boolean).join("/");
  return `<li class="item ${p.cls}" data-id="${esc(r.id)}">
    <div class="prazo" title="Encerramento das propostas">
      <span class="dia">${p.dia}</span><span class="mes">${p.mes}</span><span class="falta">${p.falta}</span>
    </div>
    <div class="corpo" role="button" tabindex="0" aria-expanded="false">
      <p class="objeto">${destacar(r.objeto || "Objeto não informado", inc)}</p>
      <p class="orgao">${destacar(r.orgao, inc)}${local ? ` — ${destacar(local, inc)}` : ""}</p>
      <div class="tags">
        ${r.modalidade ? `<span class="tag">${esc(r.modalidade)}</span>` : ""}
        ${r.srp ? `<span class="tag">Registro de preços</span>` : ""}
        ${r.disputa ? `<span class="tag">Disputa ${esc(r.disputa.toLowerCase())}</span>` : ""}
      </div>
      <div class="detalhes"><div>
        <dl>
          <dt>Número</dt><dd>${esc(r.numero || "—")}</dd>
          ${r.unidade ? `<dt>Unidade</dt><dd>${esc(r.unidade)}</dd>` : ""}
          <dt>Propostas de</dt><dd>${fmtData(r.abertura)} até ${fmtData(r.encerra)}</dd>
          <dt>Publicada em</dt><dd>${fmtData(r.publicada)}</dd>
        </dl>
        ${r.info ? `<p class="info">${destacar(r.info, inc)}</p>` : ""}
      </div></div>
    </div>
    <div class="lado">
      <div class="valor${r.valor ? "" : " nd"}">${r.valor ? brl.format(r.valor) : "Valor não divulgado"}</div>
      <div class="acoes">
        <button class="estrela" data-fav aria-pressed="${fav}" aria-label="${fav ? "Remover das favoritas" : "Salvar nas favoritas"}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>
        </button>
        <a class="btn-edital" href="${esc(r.link)}" target="_blank" rel="noopener">Abrir edital</a>
      </div>
      ${r.origem ? `<a class="origem" href="${esc(r.origem)}" target="_blank" rel="noopener">Onde enviar proposta</a>` : ""}
    </div>
  </li>`;
}

function renderMais() {
  const inc = termos($("f-txt").value);
  const lote = filtrados.slice(mostrando, mostrando + POR_LOTE);
  if (mostrando === 0 && !lote.length) {
    $("lista").innerHTML = dados.length
      ? `<li class="vazio"><strong>Nada encontrado com esses filtros.</strong>Tente menos palavras, outro estado ou um prazo maior.</li>`
      : `<li class="vazio"><strong>Os dados ainda estão sendo coletados.</strong>Volte em alguns minutos.</li>`;
  } else {
    $("lista").insertAdjacentHTML("beforeend", lote.map((r) => itemHTML(r, inc)).join(""));
  }
  mostrando += lote.length;
  const total = filtrados.length;
  const soma = filtrados.reduce((s, r) => s + r.valor, 0);
  $("resumo").innerHTML = dados.length
    ? `<b>${nfmt(total)}</b> ${total === 1 ? "licitação" : "licitações"}${soma ? `, somando ${brl.format(soma)} estimados` : ""}`
    : "";
  const restam = total - mostrando;
  $("btn-mais").hidden = restam <= 0;
  $("btn-mais").textContent = `Mostrar mais ${nfmt(Math.min(restam, POR_LOTE))} de ${nfmt(restam)}`;
}

// ---------- planilha ----------
function baixarPlanilha() {
  const cols = [["Objeto", "objeto"], ["Órgão", "orgao"], ["Unidade", "unidade"], ["Município", "municipio"], ["UF", "uf"],
    ["Modalidade", "modalidade"], ["Valor estimado", "valor"], ["Abertura das propostas", "abertura"],
    ["Encerramento das propostas", "encerra"], ["Número", "numero"], ["Edital no PNCP", "link"], ["Onde enviar proposta", "origem"]];
  const q = (v) => `"${(v ?? "").toString().replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const linhas = [cols.map((c) => q(c[0])).join(";")]
    .concat(filtrados.map((r) => cols.map(([, k]) => (k === "valor" ? String(r.valor).replace(".", ",") : q(r[k]))).join(";")));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  a.download = `licitacoes_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- eventos ----------
function abrirPainel(abrir) {
  const p = $("painel");
  $("btn-filtros").setAttribute("aria-expanded", abrir);
  p.hidden = !abrir;
  if (abrir) { p.classList.remove("abrindo"); void p.offsetWidth; p.classList.add("abrindo"); }
}

function alternarItem(li) {
  const aberto = li.classList.toggle("aberto");
  li.querySelector(".corpo").setAttribute("aria-expanded", aberto);
}

function ligarEventos() {
  let t;
  const deb = () => { clearTimeout(t); t = setTimeout(aplicar, 200); };
  ["f-txt", "f-not", "f-mun", "f-vmin", "f-vmax"].forEach((id) => $(id).addEventListener("input", deb));
  ["f-uf", "f-mod", "f-dias", "ord", "f-fav"].forEach((id) => $(id).addEventListener("change", aplicar));

  $("btn-filtros").onclick = () => abrirPainel($("painel").hidden);
  $("btn-limpar").onclick = () => {
    ["f-not", "f-uf", "f-mun", "f-mod", "f-vmin", "f-vmax", "f-dias"].forEach((id) => ($(id).value = ""));
    $("f-fav").checked = false;
    aplicar();
  };
  document.querySelectorAll("[data-atalho]").forEach((b) => (b.onclick = () => {
    const a = ATALHOS[b.dataset.atalho];
    a.ativo() ? a.desliga() : a.liga();
    aplicar();
  }));
  $("btn-mais").onclick = renderMais;
  $("btn-csv").onclick = baixarPlanilha;

  $("lista").addEventListener("click", (ev) => {
    const est = ev.target.closest("[data-fav]");
    if (est) {
      const id = est.closest(".item").dataset.id;
      const on = !favs.has(id);
      on ? favs.add(id) : favs.delete(id);
      store.set("favs", [...favs]);
      est.setAttribute("aria-pressed", on);
      est.setAttribute("aria-label", on ? "Remover das favoritas" : "Salvar nas favoritas");
      est.classList.remove("pop"); void est.offsetWidth; if (on) est.classList.add("pop");
      return;
    }
    if (ev.target.closest("a")) return;
    const corpo = ev.target.closest(".corpo");
    if (corpo) alternarItem(corpo.closest(".item"));
  });
  $("lista").addEventListener("keydown", (ev) => {
    const corpo = ev.target.closest(".corpo");
    if (corpo && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); alternarItem(corpo.closest(".item")); }
  });
}

// ---------- início ----------
async function init() {
  favs = new Set(store.get("favs") || []);
  ligarEventos();
  try {
    const res = await fetch("data/licitacoes.json?v=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const js = await res.json();
    const agora = Date.now();
    dados = (js.itens || []).map(preparar).filter((r) => r._enc === Infinity || r._enc >= agora - DIA);
    $("status").textContent = `Dados do PNCP atualizados em ${js.atualizado}.`;
    montarOpcoes();
    animarContador(dados.length);
    desenharRadar();
  } catch (e) {
    $("status").textContent = `Não foi possível carregar os dados (${e.message}). Recarregue a página em instantes.`;
  }
  const f = store.get("filtros");
  if (f) {
    CAMPOS.forEach((id) => { if (f[id] != null) $(id).value = f[id]; });
    $("f-fav").checked = !!f["f-fav"];
    if (["f-not", "f-uf", "f-mun", "f-mod", "f-vmin", "f-vmax"].some((id) => f[id])) abrirPainel(true);
  }
  aplicar();
}

init();
