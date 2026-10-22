// Simula conexao BLE + coleta em andamento pra gerar o print do manual.
// Roda depois do script principal da PWA (mesmo escopo global).
(function () {
  device = { name: 'LoggerP_C3' };
  cmdChar = {};
  setConnectedUi();

  // 1a chamada: entra em COLL (limpa o historico do sparkline)
  applyState('COLL 1Hz n=1534 r=5680 p=2.8 t=24.6 b=4015');

  // Historico sintetico dos ultimos 60 s: pressao subindo com oscilacao
  const now = Date.now();
  liveSamples = [];
  for (let i = 59; i >= 1; i--) {
    const k = 59 - i;
    const bar  = 2.2 + 0.6 * (k / 58) + 0.12 * Math.sin(k / 3) + 0.05 * Math.sin(k * 1.7);
    const temp = 24.4 + 0.2 * (k / 58) + 0.03 * Math.sin(k / 5);
    liveSamples.push({ t: now - i * 1000, bar: bar, temp: temp });
  }

  // 2a chamada: amostra atual, redesenha o sparkline com o historico
  applyState('COLL 1Hz n=1535 r=5679 p=2.8 t=24.6 b=4015');

  // Horario de inicio fixo (o real depende do relogio de quem gera o print)
  $('statusStarted').textContent = 'Iniciada as 14:32:01';
})();
