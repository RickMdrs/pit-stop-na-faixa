// Atividade educativa (§12): 2–3 minutos, três situações + aplicação em caso novo.
// Sem cronômetro, sem recompensa por rapidez, usável só com teclado.
// CONTEÚDO A VALIDAR com a equipe de segurança da unidade antes do uso real.

const PED = '<circle cx="34" cy="10" r="6" fill="currentColor"/><path d="M30 19h8l6 14-5 2-4-8-2 10 8 10v15h-6V49l-7-8-3 9-8 12-5-3 8-12 4-14 1-9-5 4v8h-5V24z" fill="currentColor"/>';
const SIGNAL_NAME = 'sinal âmbar piscando com o símbolo de pedestre e a mensagem "PEDESTRE PEDIU PASSAGEM — PARE ANTES DA FAIXA"';

// Cena esquemática vista de cima (ilustração, não foto do local).
function scene({ person = 'espera', signal = false, car = 'aproximando', carSide = 'left', label }) {
  const personPos = { corredor: [290, 70], espera: [290, 136], faixa: [290, 200], nenhuma: null }[person];
  const carX = { aproximando: 70, rapido: 110, parado: 168, passando: 300 }[car];
  const cx = carSide === 'left' ? carX : 600 - carX - 80;
  const speed = car === 'rapido' ? 3 : car === 'aproximando' ? 2 : 0;
  const arrows = Array.from({ length: speed }, (_, i) => {
    const ax = carSide === 'left' ? cx - 18 - i * 14 : cx + 98 + i * 14;
    const d = carSide === 'left' ? `M${ax} 186l-8 -6v12z` : `M${ax} 186l8 -6v12z`;
    return `<path d="${d}" fill="#f9fafb" opacity="${0.9 - i * 0.25}"/>`;
  }).join('');
  const stripes = [158, 176, 194, 212, 230].map((y) => `<rect x="256" y="${y}" width="68" height="10" fill="#e6e9ee"/>`).join('');
  const lamp = (x) => `<rect x="${x}" y="104" width="16" height="10" rx="2" fill="${signal ? '#fbbf24' : '#3b3210'}" ${signal ? 'stroke="#fde68a"' : ''}/>`;
  return `
  <svg class="scene" viewBox="0 0 600 300" role="img" aria-label="${label}">
    <rect width="600" height="300" fill="#0c0e11"/>
    <rect x="0" y="0" width="250" height="118" fill="#1a1e25"/>
    <rect x="330" y="0" width="270" height="118" fill="#1a1e25"/>
    <text x="20" y="30" font-size="14" fill="#7d8694" font-family="Inter, system-ui">prédio</text>
    <text x="520" y="30" font-size="14" fill="#7d8694" font-family="Inter, system-ui">prédio</text>
    <text x="258" y="20" font-size="12" fill="#7d8694" font-family="Inter, system-ui">corredor</text>
    <rect x="0" y="118" width="600" height="34" fill="#13161b"/>
    <rect x="262" y="124" width="56" height="24" fill="none" stroke="#f59e0b" stroke-dasharray="4 3"/>
    <rect x="0" y="152" width="600" height="96" fill="#262b33"/>
    <line x1="0" y1="200" x2="600" y2="200" stroke="#5b6270" stroke-dasharray="20 14" stroke-width="2"/>
    ${stripes}
    <rect x="200" y="252" width="70" height="36" rx="5" fill="#2f3540"/>
    <rect x="360" y="252" width="70" height="36" rx="5" fill="#2f3540"/>
    <rect x="344" y="96" width="44" height="24" rx="3" fill="#111827"/>
    ${lamp(348)}${lamp(368)}
    <line x1="366" y1="120" x2="366" y2="134" stroke="#111827" stroke-width="3"/>
    ${car !== 'nenhum' ? `<rect x="${cx}" y="168" width="80" height="36" rx="8" fill="#3d7bea"/><rect x="${carSide === 'left' ? cx + 52 : cx + 8}" y="172" width="20" height="28" rx="3" fill="#bfdbfe"/>${arrows}` : ''}
    ${personPos ? `<g transform="translate(${personPos[0] - 14} ${personPos[1] - 18}) scale(0.45)" color="#111827"><circle cx="32" cy="36" r="40" fill="#fde047" opacity="0.85"/>${PED}</g>` : ''}
  </svg>`;
}

const CASES = [
  {
    titulo: '1. Pedestre saindo do corredor',
    principal: {
      texto: 'Você sai do corredor entre os prédios e para na área de espera antes da faixa. O sinal começa a piscar.',
      cena: { person: 'espera', signal: true, car: 'aproximando', label: 'Pedestre na área de espera, sinal aceso, carro se aproximando pela esquerda.' },
      pergunta: 'O que você faz?',
      opcoes: [
        { t: 'Atravesso logo: o sinal acendeu, então o caminho está livre.', ok: false,
          f: 'O sinal é um aviso para o motorista. Ele não garante que o veículo vai parar.' },
        { t: 'Fico na área de espera, olho para os dois lados e só atravesso quando os veículos pararem ou a via estiver livre.', ok: true,
          f: 'Isso mesmo. O alerta deixa você mais visível, mas o momento seguro é você quem confirma, olhando o trânsito.' },
        { t: 'Levanto a mão e começo a atravessar, porque o motorista é obrigado a parar.', ok: false,
          f: 'Levantar a mão é uma forma opcional de pedir passagem. Não garante a parada: confirme antes de entrar na via.' },
      ],
    },
    transferencia: {
      texto: 'Outro caso: você chega à área de espera, mas o sinal NÃO acende. A câmera pode não ter detectado você.',
      cena: { person: 'espera', signal: false, car: 'aproximando', carSide: 'right', label: 'Pedestre na área de espera, sinal apagado, carro vindo pela direita.' },
      pergunta: 'Qual a conduta mais segura?',
      opcoes: [
        { t: 'Atravesso: se o sistema não acendeu, é porque não vem carro.', ok: false,
          f: 'O sistema detecta pessoas, não carros. Sinal apagado não quer dizer via livre.' },
        { t: 'Aperto o botão de solicitação, espero e verifico o trânsito antes de atravessar.', ok: true,
          f: 'Certo. O botão é a alternativa quando a detecção falha. E a verificação continua sendo sua.' },
        { t: 'Volto para o corredor e procuro outro caminho.', ok: false,
          f: 'Não precisa desistir: use o botão e verifique o trânsito antes de atravessar.' },
      ],
    },
  },
  {
    titulo: '2. Motorista na aproximação',
    principal: {
      texto: `Você dirige pela via interna. Perto da saída do corredor, aparece o ${SIGNAL_NAME}.`,
      cena: { person: 'espera', signal: true, car: 'aproximando', label: 'Visão do motorista: carro se aproximando da faixa com o sinal aceso e uma pessoa esperando.' },
      pergunta: 'O que você faz?',
      opcoes: [
        { t: 'Mantenho a velocidade: se ninguém está na faixa ainda, não preciso parar.', ok: false,
          f: 'O sinal indica que alguém está esperando ou chegando, possivelmente por um ponto com pouca visibilidade.' },
        { t: 'Buzino para avisar que estou passando.', ok: false,
          f: 'Buzinar não dá passagem a ninguém e pode assustar quem está saindo do corredor.' },
        { t: 'Reduzo e paro antes da faixa para dar passagem, conforme a orientação de segurança da unidade.', ok: true,
          f: 'Isso mesmo. Pare ANTES da faixa, deixando a travessia livre.' },
      ],
    },
    transferencia: {
      texto: 'Outro caso: o sinal está apagado, mas você vê alguém saindo do corredor em direção à faixa.',
      cena: { person: 'corredor', signal: false, car: 'aproximando', label: 'Sinal apagado, pessoa saindo do corredor, carro se aproximando.' },
      pergunta: 'O que você faz?',
      opcoes: [
        { t: 'Reduzo e me preparo para parar: o sinal não substitui a atenção.', ok: true,
          f: 'Certo. O sistema pode falhar ou ainda não ter detectado a pessoa. Vale o que você está vendo.' },
        { t: 'Sigo normalmente, porque o sinal está apagado.', ok: false,
          f: 'Sinal apagado não significa ausência de pedestres. Detecção pode falhar.' },
        { t: 'Pisco o farol para a pessoa atravessar logo.', ok: false,
          f: 'Apressar o pedestre não é seguro. Pode haver outro veículo vindo no sentido oposto.' },
      ],
    },
  },
  {
    titulo: '3. Situação inesperada',
    principal: {
      texto: 'Você está na área de espera e o sinal está piscando, mas um veículo se aproxima sem reduzir.',
      cena: { person: 'espera', signal: true, car: 'rapido', label: 'Pedestre esperando, sinal aceso, carro se aproximando rápido sem reduzir.' },
      pergunta: 'O que você faz?',
      opcoes: [
        { t: 'Atravesso rápido antes que ele chegue.', ok: false,
          f: 'Correr na frente de um veículo que não reduziu é o cenário de maior risco.' },
        { t: 'Atravesso devagar para obrigar o motorista a parar.', ok: false,
          f: 'Ninguém deve usar o próprio corpo para forçar uma parada.' },
        { t: 'Não atravesso. Espero o veículo passar ou parar de fato e verifico de novo.', ok: true,
          f: 'Isso mesmo. Se a situação se repetir, avise a equipe de segurança: esses relatos ajudam a melhorar o local.' },
      ],
    },
    transferencia: {
      texto: 'Outro caso: você está dirigindo e o sinal pisca, mas você não vê ninguém perto da faixa.',
      cena: { person: 'nenhuma', signal: true, car: 'aproximando', label: 'Sinal aceso sem pedestre visível, carro se aproximando.' },
      pergunta: 'Qual a conduta mais segura?',
      opcoes: [
        { t: 'Paro o carro em cima da faixa e espero o sinal apagar.', ok: false,
          f: 'Parar sobre a faixa bloqueia a travessia. Se for parar, pare antes dela.' },
        { t: 'Reduzo, observo a saída do corredor e a faixa, e só sigo se não houver ninguém. Se repetir, aviso a segurança.', ok: true,
          f: 'Certo. Pode haver alguém fora do seu campo de visão, dentro do corredor. E acionamentos sem motivo devem ser relatados.' },
        { t: 'Ignoro: deve ser defeito.', ok: false,
          f: 'Não confie cegamente, nem descarte o aviso. Alguém pode estar saindo de um ponto que você não enxerga.' },
      ],
    },
  },
];

const app = document.getElementById('app');
const sessao = 'edu-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let perfil = 'nao_informado';
let momento = 'primeira_vez';
let startedAt = 0;
const respostas = [];

function focusHeading() {
  const h = app.querySelector('h1, h2');
  if (h) { h.tabIndex = -1; h.focus(); }
}

function renderIntro() {
  app.innerHTML = `
    <h1>Pit Stop na Faixa</h1>
    <p>Uma atividade curta (2 a 3 minutos) sobre a travessia na saída do corredor. Não há tempo limite: leia com calma.</p>
    <div class="signal-legend" role="img" aria-label="Exemplo do sinal: âmbar piscando com símbolo de pedestre">
      <svg viewBox="0 0 64 64" aria-hidden="true">${PED}</svg>
      <span>PEDESTRE PEDIU PASSAGEM — PARE ANTES DA FAIXA</span>
    </div>
    <p>Este é o <b>sinal de advertência ao motorista</b>. Ele acende quando alguém espera na área antes da faixa ou aperta o botão.
       <b>Ele não autoriza o pedestre a atravessar.</b></p>
    <div class="signal-legend n2" role="img" aria-label="Alerta máximo: vermelho e âmbar piscando rápido, pedestre na faixa">
      <svg viewBox="0 0 64 64" aria-hidden="true">${PED}</svg>
      <span>PEDESTRE NA FAIXA — PARE</span>
    </div>
    <p>Quando alguém <b>já está na faixa</b>, o sinal muda para o <b>alerta máximo</b>: pisca rápido, alternando vermelho e âmbar.
       Motorista: <b>pare</b>.</p>
    <fieldset>
      <legend>Você circula por ali principalmente como (opcional)</legend>
      <label class="check"><input type="radio" name="perfil" value="pedestre"> Pedestre</label>
      <label class="check"><input type="radio" name="perfil" value="motorista"> Motorista</label>
      <label class="check"><input type="radio" name="perfil" value="ambos"> Os dois</label>
      <label class="check"><input type="radio" name="perfil" value="nao_informado" checked> Prefiro não informar</label>
    </fieldset>
    <fieldset>
      <legend>Esta é</legend>
      <label class="check"><input type="radio" name="momento" value="primeira_vez" checked> Minha primeira vez</label>
      <label class="check"><input type="radio" name="momento" value="reforco"> Um reforço (já fiz antes)</label>
    </fieldset>
    <p class="muted small">Não pedimos nome. Guardamos apenas as respostas, de forma anônima, para avaliar a atividade.</p>
    <div class="nav"><button class="btn btn-primary btn-lg" id="go">Começar <svg class="i"><use href="vendor/icons.svg#arrow-right"/></svg></button></div>`;
  document.getElementById('go').onclick = () => {
    perfil = app.querySelector('input[name="perfil"]:checked').value;
    momento = app.querySelector('input[name="momento"]:checked').value;
    startedAt = performance.now();
    renderQuestion(0, 'principal');
  };
  focusHeading();
}

function renderQuestion(ci, parte) {
  const c = CASES[ci];
  const q = c[parte];
  const step = ci * 2 + (parte === 'principal' ? 1 : 2);
  app.innerHTML = `
    <p class="progress">Situação ${ci + 1} de ${CASES.length} · ${parte === 'principal' ? 'caso' : 'aplique em outro caso'} (${step}/6)</p>
    <h2>${c.titulo}</h2>
    ${scene(q.cena)}
    <p>${q.texto}</p>
    <p><b>${q.pergunta}</b></p>
    <ul class="options">${q.opcoes.map((o, i) => `<li><button data-i="${i}" aria-pressed="false">${o.t}</button></li>`).join('')}</ul>
    <div id="fb" aria-live="polite"></div>
    <div class="nav"></div>`;
  app.querySelectorAll('.options button').forEach((b) => {
    b.onclick = () => answer(ci, parte, Number(b.dataset.i));
  });
  focusHeading();
}

function answer(ci, parte, i) {
  const q = CASES[ci][parte];
  const opt = q.opcoes[i];
  respostas.push({ caso: ci + 1, parte, escolha: i, correta: opt.ok });
  app.querySelectorAll('.options button').forEach((b, j) => {
    b.disabled = true;
    if (j === i) { b.setAttribute('aria-pressed', 'true'); b.classList.add(opt.ok ? 'right' : 'wrong'); }
    else if (q.opcoes[j].ok && !opt.ok) b.classList.add('reveal');
  });
  const right = q.opcoes.find((o) => o.ok);
  document.getElementById('fb').innerHTML = `
    <div class="feedback ${opt.ok ? 'right' : 'wrong'}">
      <strong>${opt.ok ? '<svg class="i"><use href="vendor/icons.svg#circle-check"/></svg> Conduta segura' : '<svg class="i"><use href="vendor/icons.svg#circle-x"/></svg> Não é a conduta mais segura'}</strong>
      ${opt.f}
      ${opt.ok ? '' : `<p><b>Mais segura:</b> ${right.t}</p>`}
    </div>`;
  const nav = app.querySelector('.nav');
  const isLast = ci === CASES.length - 1 && parte === 'transferencia';
  const next = Object.assign(document.createElement('button'), {
    className: 'btn btn-primary btn-lg',
    textContent: isLast ? 'Ver resumo' : parte === 'principal' ? 'Aplicar em outro caso →' : 'Próxima situação →',
  });
  next.onclick = () => {
    if (isLast) renderEnd();
    else if (parte === 'principal') renderQuestion(ci, 'transferencia');
    else renderQuestion(ci + 1, 'principal');
  };
  nav.append(next);
  next.focus();
}

async function renderEnd() {
  const acertos = respostas.filter((r) => r.correta).length;
  const duracaoS = Math.round((performance.now() - startedAt) / 1000);
  app.innerHTML = `
    <h1>Resumo</h1>
    <ul class="principles">
      <li><b>O sinal âmbar avisa o motorista.</b> Não é autorização para atravessar.</li>
      <li><b>Pedestre:</b> espere na área antes da faixa, olhe e só atravesse com os veículos parados ou a via livre.</li>
      <li><b>Motorista:</b> sinal piscando → reduza e pare antes da faixa para dar passagem.</li>
      <li><b>Sinal apagado não quer dizer "sem risco":</b> o sistema pode falhar. Se a detecção não funcionar, use o botão.</li>
      <li>Viu o sinal falhar ou alguém não respeitar? <b>Avise a equipe de segurança.</b></li>
    </ul>
    <p>Você escolheu a conduta segura em <b>${acertos} de ${respostas.length}</b> situações.</p>
    <p class="muted small">Isto é um treino. Acertar aqui não comprova como agimos no trânsito real. O que conta é repetir a conduta na faixa.</p>
    <div class="nav">
      <button id="again" class="btn btn-lg"><svg class="i"><use href="vendor/icons.svg#rotate-ccw"/></svg> Recomeçar</button>
    </div>
    <p class="note">Conteúdo em validação com a equipe de segurança da unidade. Ilustrações esquemáticas, sem fotos de situações reais.</p>`;
  document.getElementById('again').onclick = () => { respostas.length = 0; renderIntro(); };
  focusHeading();
  try {
    await fetch('/api/educacao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessao, perfil, momento, respostas, acertos, total: respostas.length, duracaoS }),
    });
  } catch { /* sem servidor: a atividade continua funcionando */ }
}

renderIntro();
