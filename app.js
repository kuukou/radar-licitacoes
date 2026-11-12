// Radar de Licitações — consulta PNCP /v1/contratacoes/proposta e filtra localmente.
const PAGE_SIZE = 50;       // máximo aceito por este endpoint
const CONCORRENCIA = 4;     // requisições simultâneas
const POR_PAGINA_TELA = 50;

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const MODALIDADES = {
  1:"Leilão eletrônico",2:"Diálogo competitivo",3:"Concurso",4:"Concorrência eletrônica",
  5:"Concorrência presencial",6:"Pregão eletrônico",7:"Pregão presencial",8:"Dispensa",
  9:"Inexigibilidade",10:"Manifestação de interesse",11:"Pré-qualificação",12:"Credenciamento",13:"Leilão presencial"
};

const $ = (id) => document.getElementById(id);
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const DIA = 86400000;

let dados = [];        // registros normalizados
let filtrados = [];
let favs = new Set();
let pagina = 1;
let abortar = false;

// ---------- armazenamento ----------
const store = {
  get: async (k) => { try { return JSON.parse(localStorage.getItem("radar_" + k)); } catch { return null; } },
  set: async (k, v) => { try { localStorage.setItem("radar_" + k, JSON.stringify(v)); } catch {} },
};

// ---------- utilidades ----------
const norm = (s) => (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const esc = (s) => (s ?? "").toString().replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const status = (html) => { $("status").innerHTML = html; };

function termos(str) {
  return str.split(",").map((t) => norm(t.trim())).filter(Boolean);
}

function normalizar(c) {
  const org = c.orgaoEntidade || {};
  const un = c.unidadeOrgao || {};
  const cnpj = org.cnpj || "";
  const link = cnpj && c.anoCompra && c.sequencialCompra
    ? `https://pncp.gov.br/app/editais/${cnpj}/${c.anoCompra}/${c.sequencialCompra}`
    : (c.linkSistemaOrigem || "https://pncp.gov.br/app/editais");
  const r = {
    id: c.numeroControlePNCP || `${cnpj}-${c.anoCompra}-${c.sequencialCompra}`,
    objeto: (c.objetoCompra || "").trim(),
    info: (c.informacaoComplementar || "").trim().slice(0, 500),
    orgao: org.razaoSocial || "",
    unidade: un.nomeUnidade || "",
    uf: un.ufSigla || "",
    municipio: un.municipioNome || "",
    modId: c.modalidadeId,
    modalidade: c.modalidadeNome || MODALIDADES[c.modalidadeId] || "",
    disputa: c.modoDisputaNome || "",
    srp: !!c.srp,
    valor: Number(c.valorTotalEstimado) || 0,
    abertura: c.dataAberturaProposta || null,
    encerra: c.dataEncerramentoProposta || null,
    publicada: c.dataPublicacaoPncp || null,
    numero: [c.numeroCompra, c.anoCompra].filter(Boolean).join("/"),
    link,
    origem: c.linkSistemaOrigem || "",
  };
  r._busca = norm([r.objeto, r.info, r.orgao, r.unidade, r.municipio].join(" "));
  r._enc = r.encerra ? Date.parse(r.encerra) : Infinity;
  r._pub = r.publicada ? Date.parse(r.publicada) : 0;
  return r;
}

// ---------- filtros ----------
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

  const ord = $("ord").value;
  const cmp = {
    "enc-asc": (a, b) => a._enc - b._enc,
    "enc-desc": (a, b) => (b._enc === Infinity ? -1 : a._enc === Infinity ? 1 : b._enc - a._enc),
    "val-desc": (a, b) => b.valor - a.valor,
    "val-asc": (a, b) => a.valor - b.valor,
    "pub-desc": (a, b) => b._pub - a._pub,
  }[ord];
  filtrados.sort(cmp);

  pagina = 1;
  salvarFiltros();
  render();
}

const CAMPOS_FILTRO = ["f-txt","f-not","f-uf","f-mun","f-mod","f-vmin","f-vmax","f-dias","ord"];
function salvarFiltros() {
  const f = {};
  CAMPOS_FILTRO.forEach((id) => (f[id] = $(id).value));
  f["f-fav"] = $("f-fav").checked;
  store.set("filtros", f);
}

function montarOpcoes() {
  const ufAtual = $("f-uf").value, modAtual = $("f-mod").value;
  const ufs = [...new Set(dados.map((r) => r.uf).filter(Boolean))].sort();
  $("f-uf").innerHTML = `<option value="">Todas</option>` + ufs.map((u) => `<option>${u}</option>`).join("");
  $("f-uf").value = ufs.includes(ufAtual) ? ufAtual : "";
  const mods = [...new Set(dados.map((r) => r.modalidade).filter(Boolean))].sort();
  $("f-mod").innerHTML = `<option value="">Todas</option>` + mods.map((m) => `<option>${esc(m)}</option>`).join("");
  $("f-mod").value = mods.includes(modAtual) ? modAtual : "";
  const muns = [...new Set(dados.map((r) => r.municipio).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  $("dl-mun").innerHTML = muns.map((m) => `<option value="${esc(m)}">`).join("");
}

// ---------- render ----------
function destacar(texto, inc) {
  let h = esc(texto);
  if (!inc.length) return h;
  // destaca ignorando acento: mapeia posições no texto normalizado
  const n = norm(texto);
  const marcas = [];
  inc.forEach((t) => { let i = n.indexOf(t); while (i >= 0) { marcas.push([i, i + t.length]); i = n.indexOf(t, i + t.length); } });
  if (!marcas.length) return h;
  marcas.sort((a, b) => a[0] - b[0]);
  let out = "", pos = 0;
  for (const [a, b] of marcas) {
    if (a < pos) continue;
    out += esc(texto.slice(pos, a)) + "<mark>" + esc(texto.slice(a, b)) + "</mark>";
    pos = b;
  }
  return out + esc(texto.slice(pos));
}

function fmtEnc(r) {
  if (r._enc === Infinity) return { txt: "—", cls: "" };
  const d = new Date(r._enc);
  const falta = (r._enc - Date.now()) / DIA;
  const txt = d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const rel = falta < 0 ? "encerrada" : falta < 1 ? "hoje/amanhã" : `em ${Math.ceil(falta)} dias`;
  return { txt: `${txt}<div class="sub">${rel}</div>`, cls: falta < 2 ? "urg" : falta < 7 ? "breve" : "" };
}

function render() {
  const inc = termos($("f-txt").value);
  const total = filtrados.length;
  const soma = filtrados.reduce((s, r) => s + r.valor, 0);
  $("resumo").innerHTML = dados.length
    ? `<b>${total.toLocaleString("pt-BR")}</b> de ${dados.length.toLocaleString("pt-BR")} licitações · valor estimado somado ${brl.format(soma)}`
    : "Nenhum dado carregado ainda.";

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_TELA));
  pagina = Math.min(pagina, paginas);
  const ini = (pagina - 1) * POR_PAGINA_TELA;
  const fatia = filtrados.slice(ini, ini + POR_PAGINA_TELA);

  $("tb").innerHTML = fatia.length ? fatia.map((r) => {
    const e = fmtEnc(r);
    const fav = favs.has(r.id);
    return `<tr>
      <td><button class="star ${fav ? "on" : ""}" data-fav="${esc(r.id)}" title="Favoritar">★</button></td>
      <td class="obj"><div class="t" title="Clique para expandir">${destacar(r.objeto || "(sem descrição)", inc)}</div>
        ${r.info ? `<div class="sub">${destacar(r.info.slice(0, 200), inc)}</div>` : ""}
        <span class="tag">nº ${esc(r.numero)}</span>${r.srp ? ` <span class="tag">Registro de preços</span>` : ""}</td>
      <td>${destacar(r.orgao, inc)}<div class="sub">${esc(r.municipio)}${r.uf ? " / " + r.uf : ""}</div></td>
      <td>${esc(r.modalidade)}${r.disputa ? `<div class="sub">${esc(r.disputa)}</div>` : ""}</td>
      <td class="num">${r.valor ? brl.format(r.valor) : "sigiloso / n/d"}</td>
      <td class="enc ${e.cls}">${e.txt}</td>
      <td><a class="lnk" href="${esc(r.link)}" target="_blank" rel="noopener">Ver no PNCP ↗</a>
        ${r.origem ? `<br><a class="lnk" href="${esc(r.origem)}" target="_blank" rel="noopener">Sistema de origem ↗</a>` : ""}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="7" class="empty">${dados.length ? "Nada com esses filtros." : "Os dados ainda não foram coletados. Rode a ação <b>Atualizar licitações</b> no GitHub."}</td></tr>`;

  $("pg-info").textContent = `Página ${pagina} de ${paginas}`;
  $("pg-prev").disabled = pagina <= 1;
  $("pg-next").disabled = pagina >= paginas;
}

// ---------- CSV ----------
function exportarCSV() {
  const cols = [
    ["Objeto","objeto"],["Órgão","orgao"],["Unidade","unidade"],["Município","municipio"],["UF","uf"],
    ["Modalidade","modalidade"],["Valor estimado","valor"],["Abertura propostas","abertura"],
    ["Encerramento propostas","encerra"],["Número","numero"],["Link PNCP","link"],["Sistema de origem","origem"]
  ];
  const q = (v) => `"${(v ?? "").toString().replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const linhas = [cols.map((c) => q(c[0])).join(";")]
    .concat(filtrados.map((r) => cols.map(([, k]) => k === "valor" ? String(r.valor).replace(".", ",") : q(r[k])).join(";")));
  const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `licitacoes_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- init ----------
async function init() {
  favs = new Set((await store.get("favs")) || []);
  const f = await store.get("filtros");
  try {
    const res = await fetch("data/licitacoes.json?v=" + Date.now());
    const js = await res.json();
    const agora = Date.now();
    dados = (js.itens || []).map((x) => {
      x._busca = norm([x.objeto, x.info, x.orgao, x.unidade, x.municipio].join(" "));
      x._enc = x.encerra ? Date.parse(x.encerra) : Infinity;
      x._pub = x.publicada ? Date.parse(x.publicada) : 0;
      return x;
    }).filter((r) => r._enc === Infinity || r._enc >= agora - DIA);
    status(`${dados.length.toLocaleString("pt-BR")} licitações abertas · dados do PNCP atualizados em ${esc(js.atualizado)}` +
      (js.falhas ? ` · ${js.falhas} página(s) do PNCP falharam nesta coleta` : ""));
    montarOpcoes();
  } catch (e) {
    status("Não consegui carregar os dados (" + esc(e.message) + ").");
  }
  if (f) {
    CAMPOS_FILTRO.forEach((id) => { if (f[id] != null) $(id).value = f[id]; });
    $("f-fav").checked = !!f["f-fav"];
  }
  aplicar();

  let t;
  const deb = () => { clearTimeout(t); t = setTimeout(aplicar, 250); };
  ["f-txt","f-not","f-mun","f-vmin","f-vmax","f-dias"].forEach((id) => $(id).addEventListener("input", deb));
  ["f-uf","f-mod","ord","f-fav"].forEach((id) => $(id).addEventListener("change", aplicar));
  $("btn-limpar").onclick = () => {
    ["f-txt","f-not","f-uf","f-mun","f-mod","f-vmin","f-vmax","f-dias"].forEach((id) => ($(id).value = ""));
    $("f-fav").checked = false;
    aplicar();
  };
  $("pg-prev").onclick = () => { pagina--; render(); window.scrollTo(0, 0); };
  $("pg-next").onclick = () => { pagina++; render(); window.scrollTo(0, 0); };
  $("btn-csv").onclick = exportarCSV;
  $("tb").addEventListener("click", (ev) => {
    const s = ev.target.closest("[data-fav]");
    if (s) {
      const id = s.dataset.fav;
      favs.has(id) ? favs.delete(id) : favs.add(id);
      store.set("favs", [...favs]);
      s.classList.toggle("on");
      return;
    }
    const t = ev.target.closest(".t");
    if (t) t.classList.toggle("open");
  });
}

init();
