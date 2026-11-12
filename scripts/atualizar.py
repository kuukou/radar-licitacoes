"""Coletor do Radar de Licitações.

Baixa do PNCP (API de consulta pública) todas as contratações com recebimento
de propostas em aberto, UF por UF, normaliza os campos usados pelo site e grava
`data/licitacoes.json`.

Uso local:  python scripts/atualizar.py   (Python 3.9+, sem dependências externas)
"""
import json, time, pathlib, collections, threading, urllib.error, datetime as dt, urllib.request, urllib.parse, concurrent.futures as cf

API = "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta"
UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split()
SAIDA = pathlib.Path(__file__).resolve().parent.parent / "data" / "licitacoes.json"
DATA_FINAL = (dt.date.today() + dt.timedelta(days=365)).strftime("%Y%m%d")

INICIO = time.time()
ERROS = collections.Counter()   # motivo -> quantidade (vai para o JSON, para diagnóstico)
_lock = threading.Lock()


def _erro(motivo):
    with _lock:
        ERROS[motivo] += 1


def get(params, pagina, tentativas=5):
    """Busca uma página. Respeita Retry-After e espera mais quando o PNCP limita (429) ou falha (5xx)."""
    qs = urllib.parse.urlencode({**params, "pagina": pagina, "tamanhoPagina": 50})
    for t in range(1, tentativas + 1):
        espera = 3 * t * t
        try:
            req = urllib.request.Request(f"{API}?{qs}", headers={"Accept": "application/json", "User-Agent": "radar-licitacoes (github.com/kuukou/radar-licitacoes)"})
            with urllib.request.urlopen(req, timeout=90) as r:
                if r.status == 204:
                    return {"data": [], "totalPaginas": 0}
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            motivo = f"HTTP {e.code}"
            ra = e.headers.get("Retry-After") if e.headers else None
            if ra and ra.isdigit():
                espera = max(espera, int(ra))
            elif e.code == 429:
                espera = 15 * t
        except Exception as e:
            motivo = type(e).__name__
        _erro(motivo)
        if t == tentativas or time.time() - INICIO > LIMITE_SEG:
            print(f"  falhou uf={params.get('uf')} p{pagina}: {motivo}", flush=True)
            return None
        time.sleep(espera)


def norm(c):
    org, un = c.get("orgaoEntidade") or {}, c.get("unidadeOrgao") or {}
    cnpj, ano, seq = org.get("cnpj", ""), c.get("anoCompra"), c.get("sequencialCompra")
    return {
        "id": c.get("numeroControlePNCP") or f"{cnpj}-{ano}-{seq}",
        "objeto": (c.get("objetoCompra") or "").strip(),
        "info": (c.get("informacaoComplementar") or "").strip()[:300],
        "orgao": org.get("razaoSocial", ""),
        "unidade": un.get("nomeUnidade", ""),
        "uf": un.get("ufSigla", ""),
        "municipio": un.get("municipioNome", ""),
        "modalidade": c.get("modalidadeNome", ""),
        "disputa": c.get("modoDisputaNome", ""),
        "srp": bool(c.get("srp")),
        "valor": float(c.get("valorTotalEstimado") or 0),
        "abertura": c.get("dataAberturaProposta"),
        "encerra": c.get("dataEncerramentoProposta"),
        "publicada": c.get("dataPublicacaoPncp"),
        "numero": "/".join(str(x) for x in [c.get("numeroCompra"), ano] if x),
        "link": f"https://pncp.gov.br/app/editais/{cnpj}/{ano}/{seq}" if cnpj and ano and seq else (c.get("linkSistemaOrigem") or ""),
        "origem": c.get("linkSistemaOrigem") or "",
    }

WORKERS = 4
LIMITE_SEG = 75 * 60   # para de baixar após 75 min e salva o que já tem


def main():
    inicio = INICIO
    brutos, falhas = [], 0

    # 1) primeira página de cada UF (descobre quantas páginas cada uma tem)
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        primeiras = dict(zip(UFS, ex.map(lambda uf: get({"dataFinal": DATA_FINAL, "uf": uf}, 1), UFS)))
    tarefas = []
    for uf, p1 in primeiras.items():
        if p1 is None:
            falhas += 1
            continue
        brutos += [(uf, c) for c in p1.get("data") or []]
        tarefas += [(uf, n) for n in range(2, (p1.get("totalPaginas") or 1) + 1)]
    print(f"{len(tarefas) + len(UFS)} páginas no total", flush=True)

    # 2) demais páginas, todas em paralelo
    puladas = 0
    pendentes = []
    n_de = [n for _, n in tarefas]

    def baixar(t):
        uf, n = t
        if time.time() - inicio > LIMITE_SEG:
            return uf, "pulada"
        return uf, get({"dataFinal": DATA_FINAL, "uf": uf}, n)
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for i, (uf, p) in enumerate(ex.map(baixar, tarefas), 1):
            if p == "pulada":
                puladas += 1
            elif p is None:
                falhas += 1
                pendentes.append((uf, n_de[i - 1]))
            else:
                brutos += [(uf, c) for c in p.get("data") or []]
            if i % 100 == 0:
                print(f"  {i}/{len(tarefas)} páginas · {time.time() - inicio:.0f}s", flush=True)

    # 3) segunda rodada, mais devagar, só para as páginas que falharam
    if pendentes and time.time() - inicio < LIMITE_SEG:
        print(f"Segunda rodada: {len(pendentes)} páginas", flush=True)
        time.sleep(30)
        with cf.ThreadPoolExecutor(max_workers=2) as ex:
            for uf, p in ex.map(baixar, pendentes):
                if p not in (None, "pulada"):
                    falhas -= 1
                    brutos += [(uf, c) for c in p.get("data") or []]

    todos = {}
    for uf, c in brutos:
        r = norm(c)
        if r["uf"] and r["uf"] != uf:   # a API às vezes ignora filtros
            continue
        todos[r["id"]] = r

    agora = dt.datetime.now(dt.timezone(dt.timedelta(hours=-3)))
    lista = [r for r in todos.values() if not r["encerra"] or r["encerra"] >= agora.strftime("%Y-%m-%dT%H:%M:%S")]
    out = {"atualizado": agora.strftime("%d/%m/%Y %H:%M"), "falhas": falhas + puladas,
           "erros": dict(ERROS), "duracao_seg": round(time.time() - inicio), "itens": lista}
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("Erros:", dict(ERROS))
    print(f"TOTAL: {len(lista)} licitações abertas; {falhas} páginas falharam; {puladas} puladas por tempo; {time.time() - inicio:.0f}s")


if __name__ == "__main__":
    main()
