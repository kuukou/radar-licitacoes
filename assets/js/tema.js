// Roda antes da página aparecer: aplica o tema salvo e o topo enxuto, sem piscar.
try {
  var d = document.documentElement, t = localStorage.getItem("radar_tema");
  d.dataset.tema = t ? JSON.parse(t) : (matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro");
  if (localStorage.getItem("radar_visita")) d.classList.add("compacto");
} catch (e) {}
