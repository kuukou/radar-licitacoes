"""Coletor do Radar de Licitações.

Baixa do PNCP (API de consulta pública) as contratações com recebimento de
propostas em aberto e mantém os arquivos que o site lê:

    data/indice.json      resumo: totais por estado, pontos do radar, diagnóstico
    data/uf/<UF>.json     licitações abertas de cada estado

A API do PNCP é lenta e instável, então a coleta é incremental:

- cada execução aproveita o que já foi baixado antes;
- os estados há mais tempo sem uma varredura completa são baixados primeiro;
- um estado só é substituído por inteiro quando todas as suas páginas vieram;
  se faltou alguma página, o que veio é somado ao que já existia;
- ao atingir o limite de tempo, grava o que tem e a próxima execução continua.

Uso local (Python 3.9+, sem dependências externas):

    python scripts/atualizar.py                      # coleta completa
    python scripts/atualizar.py --ufs AC,RR --limite 5
    python scripts/atualizar.py --so-converter       # só regrava os arquivos, sem acessar o PNCP
"""
import argparse, collections, json, pathlib, re, threading, time
import datetime as dt
import urllib.error, urllib.parse, urllib.request
import concurrent.futures as cf

API = "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta"
UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split()
RAIZ = pathlib.Path(__file__).resolve().parent.parent
DADOS = RAIZ / "data"
LEGADO = DADOS / "licitacoes.json"          # formato antigo (arquivo único)
BRT = dt.timezone(dt.timedelta(hours=-3))
ID_PADRAO = re.compile(r"^\d{14}-\d+-\d+/\d{4}$")
RADAR_MAX = 160

INICIO = time.time()
LIMITE_SEG = 150 * 60
ERROS = collections.Counter()               # motivo -> quantidade (vai para o índice)
_lock = threading.Lock()


def agora_brt():
    return dt.datetime.now(BRT).replace(tzinfo=None, microsecond=0)


def estourou():
    return time.time() - INICIO > LIMITE_SEG


# ---------------------------------------------------------------- PNCP
def get(uf, pagina, data_final, tentativas=4):
    """Busca uma página. Devolve o JSON, ou None se não conseguiu."""
    qs = urllib.parse.urlencode({"dataFinal": data_final, "uf": uf, "pagina": pagina, "tamanhoPagina": 50})
    for t in range(1, tentativas + 1):
        espera = 5 * t * t
        try:
            req = urllib.request.Request(f"{API}?{qs}", headers={
                "Accept": "application/json",
                "User-Agent": "radar-licitacoes (github.com/kuukou/radar-licitacoes)"})
            with urllib.request.urlopen(req, timeout=120) as r:
                if r.status == 204:
                    return {"data": [], "totalPaginas": 0}
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            motivo = f"HTTP {e.code}"
            ra = e.headers.get("Retry-After") if e.headers else None
            if ra and ra.isdigit():
                espera = max(espera, int(ra))
            elif e.code == 429:
                espera = 30 * t
        except Exception as e:
            motivo = type(e).__name__
        with _lock:
            ERROS[motivo] += 1
        if t == tentativas or estourou():
            print(f"  falhou {uf} p{pagina}: {motivo}", flush=True)
            return None
        time.sleep(espera)


def url_segura(u):
    """Só aceita http/https; completa endereços cadastrados sem o esquema ("www.portal.com.br")."""
    u = (u or "").strip()
    if not u or any(ch.isspace() or ord(ch) < 32 for ch in u):
        return ""
    if not re.match(r"^[a-z][a-z0-9+.-]*:", u, re.I) and re.match(r"^[a-z0-9-]+(\.[a-z0-9-]+)+([/:?#]|$)", u, re.I):
        u = "https://" + u
    return u[:500] if re.match(r"^https?://[^/\s]+", u, re.I) else ""


def norm(c):
    """Reduz um registro do PNCP aos campos usados pelo site (campos vazios são omitidos)."""
    org, un = c.get("orgaoEntidade") or {}, c.get("unidadeOrgao") or {}
    cnpj, ano, seq = org.get("cnpj", ""), c.get("anoCompra"), c.get("sequencialCompra")
    id_ = c.get("numeroControlePNCP") or f"{cnpj}-{ano}-{seq}"
    orgao, unidade = (org.get("razaoSocial") or "").strip()[:200], (un.get("nomeUnidade") or "").strip()[:200]
    disputa = c.get("modoDisputaNome") or ""
    situacao = c.get("situacaoCompraNome") or ""
    r = {
        "id": id_,
        "objeto": (c.get("objetoCompra") or "").strip()[:3000],
        "info": (c.get("informacaoComplementar") or "").strip()[:200],
        "orgao": orgao,
        "unidade": "" if unidade.lower() == orgao.lower() else unidade,
        "uf": un.get("ufSigla") or "",
        "municipio": (un.get("municipioNome") or "")[:100],
        "modalidade": c.get("modalidadeNome") or "",
        "disputa": "" if disputa.lower().startswith("não se aplica") else disputa,
        "srp": bool(c.get("srp")),
        "valor": float(c.get("valorTotalEstimado") or 0),
        "abertura": c.get("dataAberturaProposta"),
        "encerra": c.get("dataEncerramentoProposta"),
        "publicada": c.get("dataPublicacaoPncp"),
        "numero": "/".join(str(x) for x in [c.get("numeroCompra"), ano] if x),
        "origem": url_segura(c.get("linkSistemaOrigem")),
        "sit": "" if situacao == "Divulgada no PNCP" else situacao,
    }
    if not ID_PADRAO.match(id_):            # o site monta o link a partir do id; só guarda se não der
        r["link"] = f"https://pncp.gov.br/app/editais/{cnpj}/{ano}/{seq}" if cnpj and ano and seq else r["origem"]
    return {k: v for k, v in r.items() if v}


# ---------------------------------------------------------------- dados anteriores
def carregar_anterior():
    ant = {uf: {"itens": {}, "completa": None, "v": None, "bruto": None} for uf in UFS}
    try:
        indice = json.loads((DADOS / "indice.json").read_text(encoding="utf-8"))
    except Exception:
        indice = {}
    for uf in UFS:
        arq = DADOS / "uf" / f"{uf}.json"
        if not arq.exists():
            continue
        try:
            d = json.loads(arq.read_text(encoding="utf-8"))
        except Exception:
            continue
        meta = (indice.get("ufs") or {}).get(uf) or {}
        ant[uf].update(itens={r["id"]: r for r in d.get("itens", [])},
                       completa=meta.get("completa"), v=meta.get("v"),
                       bruto=serializar_itens(d.get("itens", [])))
    if LEGADO.exists():                     # importa o arquivo único antigo, sem sobrepor o que já existe
        try:
            for r in json.loads(LEGADO.read_text(encoding="utf-8")).get("itens", []):
                uf = r.get("uf")
                if uf in ant and r.get("id") and r["id"] not in ant[uf]["itens"]:
                    if ID_PADRAO.match(r["id"]):
                        r.pop("link", None)
                    if r.get("unidade", "").lower() == r.get("orgao", "").lower():
                        r.pop("unidade", None)
                    if r.get("disputa", "").lower().startswith("não se aplica"):
                        r.pop("disputa", None)
                    r["info"] = (r.get("info") or "")[:200]
                    r.setdefault("visto", r.get("publicada"))
                    ant[uf]["itens"][r["id"]] = {k: v for k, v in r.items() if v}
        except Exception as e:
            print("Não consegui ler o arquivo antigo:", e)
    return ant


def consolidar(obtidos, completo, ant_uf, agora_s):
    """Junta o que veio agora com o que já existia para um estado."""
    prev, ja_completa = ant_uf["itens"], ant_uf["completa"]
    res = {}
    for id_, it in obtidos.items():
        p = prev.get(id_)
        if p:                               # já conhecido: mantém a data em que foi visto pela 1ª vez
            it["visto"] = p.get("visto") or p.get("publicada") or agora_s
        else:                               # novo: só carimba "agora" se o estado já esteve completo antes
            it["visto"] = agora_s if ja_completa else (it.get("publicada") or agora_s)
        res[id_] = it
    for id_, p in prev.items():
        if id_ in res:
            continue
        if completo:                        # sumiu de uma varredura completa:
            if p.get("aus"):                #   segunda vez seguida -> remove
                continue
            p = dict(p, aus=1)              #   primeira vez -> mantém e marca
        res[id_] = p
    return {i: r for i, r in res.items() if not r.get("encerra") or r["encerra"] >= agora_s}


# ---------------------------------------------------------------- gravação
def serializar_itens(itens):
    linhas = [json.dumps(r, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
              for r in sorted(itens, key=lambda r: r["id"])]
    return ",\n".join(linhas)


def amostra_radar(todos, agora):
    lim = (agora + dt.timedelta(days=7)).isoformat()
    prox = sorted((r for r in todos if r.get("encerra") and r["encerra"] <= lim), key=lambda r: r["encerra"])
    passo = max(1, len(prox) // RADAR_MAX)
    return [{"id": r["id"], "uf": r.get("uf", ""), "o": r.get("objeto", "")[:140], "g": r.get("orgao", ""),
             "m": r.get("municipio", ""), "e": r["encerra"], **({"l": r["link"]} if r.get("link") else {})}
            for r in prox[::passo][:RADAR_MAX]]


def gravar(estado, agora, falhas, manter_legado):
    """estado: {uf: {"itens": {id: item}, "completa": ts|None, "v": carimbo, "bruto": str|None}}"""
    agora_s, carimbo = agora.isoformat(), agora.strftime("%Y%m%d%H%M")
    (DADOS / "uf").mkdir(parents=True, exist_ok=True)
    ufs, todos = {}, []
    for uf in UFS:
        e = estado[uf]
        itens = list(e["itens"].values())
        for r in itens:                     # "visto" igual à publicação é o padrão: não precisa gravar
            if r.get("visto") and r.get("visto") == r.get("publicada"):
                del r["visto"]
        todos += itens
        bruto = serializar_itens(itens)
        arq = DADOS / "uf" / f"{uf}.json"
        if not itens:
            if arq.exists():
                arq.unlink()
            continue
        if bruto != e["bruto"] or not arq.exists() or not e["v"]:
            e["v"] = carimbo
            arq.write_text('{"uf":"%s","itens":[\n%s\n]}\n' % (uf, bruto), encoding="utf-8")
        ufs[uf] = {"n": len(itens), "v": e["v"], "completa": e["completa"]}
    indice = {
        "gerado": agora_s,
        "atualizado": agora.strftime("%d/%m/%Y %H:%M"),
        "total": len(todos),
        "falhas": falhas,
        "erros": dict(ERROS),
        "duracao_seg": round(time.time() - INICIO),
        "ufs": ufs,
        "radar": amostra_radar(todos, agora),
    }
    (DADOS / "indice.json").write_text(json.dumps(indice, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if LEGADO.exists() and not manter_legado:
        LEGADO.unlink()
    return indice


# ---------------------------------------------------------------- principal
def main():
    global LIMITE_SEG
    ap = argparse.ArgumentParser(description="Coletor do Radar de Licitações")
    ap.add_argument("--ufs", help="estados a coletar, separados por vírgula (padrão: todos)")
    ap.add_argument("--limite", type=float, default=150, help="limite de tempo em minutos (padrão: 150)")
    ap.add_argument("--workers", type=int, default=3, help="requisições simultâneas (padrão: 3)")
    ap.add_argument("--so-converter", action="store_true", help="não acessa o PNCP; só regrava os arquivos")
    ap.add_argument("--manter-legado", action="store_true", help="não apaga data/licitacoes.json")
    a = ap.parse_args()
    LIMITE_SEG = a.limite * 60
    alvo = [u for u in (a.ufs.upper().split(",") if a.ufs else UFS) if u in UFS]

    agora = agora_brt()
    agora_s = agora.isoformat()
    data_final = (agora.date() + dt.timedelta(days=365)).strftime("%Y%m%d")
    estado = carregar_anterior()
    print(f"Dados anteriores: {sum(len(e['itens']) for e in estado.values())} licitações", flush=True)

    falhas = 0
    if not a.so_converter:
        obtidos = {uf: {} for uf in alvo}
        faltou = collections.Counter()      # uf -> páginas que não vieram

        def guardar(uf, pagina):
            for c in pagina.get("data") or []:
                r = norm(c)
                if r.get("uf", uf) == uf:   # a API às vezes ignora o filtro de UF
                    r["uf"] = uf
                    obtidos[uf][r["id"]] = r

        # 1) primeira página de cada estado: descobre quantas páginas cada um tem
        with cf.ThreadPoolExecutor(max_workers=a.workers) as ex:
            primeiras = dict(zip(alvo, ex.map(lambda uf: get(uf, 1, data_final), alvo)))
        paginas = {}
        for uf, p1 in primeiras.items():
            if p1 is None:
                faltou[uf] += 1
                continue
            guardar(uf, p1)
            paginas[uf] = p1.get("totalPaginas") or 1

        # 2) demais páginas: primeiro quem está há mais tempo sem varredura completa; depois os menores
        ordem = sorted(paginas, key=lambda uf: (estado[uf]["completa"] or "", paginas[uf]))
        tarefas = [(uf, n) for uf in ordem for n in range(2, paginas[uf] + 1)]
        print(f"{len(tarefas) + len(alvo)} páginas no total · ordem: {' '.join(ordem)}", flush=True)

        def baixar(t):
            uf, n = t
            return uf, (None if estourou() else get(uf, n, data_final))

        with cf.ThreadPoolExecutor(max_workers=a.workers) as ex:
            for i, (uf, p) in enumerate(ex.map(baixar, tarefas), 1):
                if p is None:
                    faltou[uf] += 1
                else:
                    guardar(uf, p)
                if i % 25 == 0:
                    print(f"  {i}/{len(tarefas)} páginas · {time.time() - INICIO:.0f}s", flush=True)

        # 3) junta com o que já existia
        for uf in alvo:
            completo = uf in paginas and faltou[uf] == 0
            estado[uf]["itens"] = consolidar(obtidos[uf], completo, estado[uf], agora_s)
            if completo:
                estado[uf]["completa"] = agora_s
        falhas = sum(faltou.values())
        completos = [uf for uf in alvo if uf in paginas and faltou[uf] == 0]
        print(f"Estados completos nesta coleta ({len(completos)}): {' '.join(completos)}")
        print("Erros:", dict(ERROS))

    # licitações já encerradas saem, inclusive dos estados não coletados agora
    for uf in UFS:
        estado[uf]["itens"] = {i: r for i, r in estado[uf]["itens"].items()
                               if not r.get("encerra") or r["encerra"] >= agora_s}

    indice = gravar(estado, agora, falhas, a.manter_legado)
    print(f"TOTAL: {indice['total']} licitações abertas · {falhas} páginas faltaram · {time.time() - INICIO:.0f}s")


if __name__ == "__main__":
    main()
