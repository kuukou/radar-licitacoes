"""Coletor do Radar de Licitações.

Baixa do PNCP (API de consulta pública) todas as contratações com recebimento
de propostas em aberto, UF por UF, normaliza os campos usados pelo site e grava
`data/licitacoes.json`.

Uso local:  python scripts/atualizar.py   (Python 3.9+, sem dependências externas)
"""
import json, time, pathlib, datetime as dt, urllib.request, urllib.parse, concurrent.futures as cf

API = "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta"
UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split()
SAIDA = pathlib.Path(__file__).resolve().parent.parent / "data" / "licitacoes.json"
DATA_FINAL = (dt.date.today() + dt.timedelta(days=365)).strftime("%Y%m%d")

def get(params, pagina, tentativas=5):
    qs = urllib.parse.urlencode({**params, "pagina": pagina, "tamanhoPagina": 50})
    for t in range(1, tentativas + 1):
        try:
            req = urllib.request.Request(f"{API}?{qs}", headers={"Accept": "application/json", "User-Agent": "radar-licitacoes"})
            with urllib.request.urlopen(req, timeout=60) as r:
                if r.status == 204:
                    return {"data": [], "totalPaginas": 0}
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            if t == tentativas:
                print(f"  falhou {params} p{pagina}: {e}")
                return None
            time.sleep(2 * t * t)

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

def baixar_uf(uf):
    params = {"dataFinal": DATA_FINAL, "uf": uf}
    p1 = get(params, 1)
    if not p1:
        return uf, [], 1
    itens, falhas = list(p1.get("data") or []), 0
    for n in range(2, (p1.get("totalPaginas") or 1) + 1):
        p = get(params, n)
        if p is None:
            falhas += 1
        else:
            itens += p.get("data") or []
    print(f"{uf}: {len(itens)} registros, {falhas} páginas com falha")
    return uf, itens, falhas

def main():
    todos, falhas = {}, 0
    with cf.ThreadPoolExecutor(max_workers=4) as ex:
        for uf, itens, f in ex.map(baixar_uf, UFS):
            falhas += f
            for c in itens:
                r = norm(c)
                if r["uf"] and r["uf"] != uf:   # a API às vezes ignora filtros
                    continue
                todos[r["id"]] = r
    agora = dt.datetime.now(dt.timezone(dt.timedelta(hours=-3)))
    lista = [r for r in todos.values() if not r["encerra"] or r["encerra"] >= agora.strftime("%Y-%m-%dT%H:%M:%S")]
    out = {"atualizado": agora.strftime("%d/%m/%Y %H:%M"), "falhas": falhas, "itens": lista}
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"TOTAL: {len(lista)} licitações abertas; {falhas} páginas falharam")

if __name__ == "__main__":
    main()
