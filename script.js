// ===================== CONFIGURAÇÃO =====================
const cargos2026 = [
    { nome: "Deputado Federal", digitos: 4 },
    { nome: "Deputado Estadual", digitos: 5 },
    { nome: "Senador (1ª Vaga)", digitos: 3 },
    { nome: "Senador (2ª Vaga)", digitos: 3 },
    { nome: "Governador", digitos: 2 },
    { nome: "Presidente", digitos: 2 }
];

// Um arquivo por partido do grupo. O nome do arquivo (sem .json) é usado
// como partido quando o candidato não traz o campo "partido".
const ARQUIVOS_PARTIDOS = ['PDisney.json', 'PMarvel.json', 'PDC.json', 'PMauricio.json'];

// ===================== ESTADO =====================
let etapaAtual = 0;
let numeroDigitado = "";
let votoEmBranco = false;
let votacaoBloqueada = false;
let votacaoEncerrada = false;

const memoriaVotosEleitores = [];
let votoEleitorAtual = [];
let todosCandidatos = [];
let audioCtx = null;

// ===================== INICIALIZAÇÃO =====================
window.onload = async () => {
    await carregarJSONs();
    iniciarNovoEleitor();
};

document.addEventListener('keydown', (e) => {
    if (votacaoEncerrada) return;
    if (/^[0-9]$/.test(e.key)) digitar(e.key);
    else if (e.key === 'Enter') confirmar();
    else if (e.key === 'Backspace') corrigir();
    else if (e.key.toLowerCase() === 'b') votarBranco();
});

async function carregarJSONs() {
    todosCandidatos = [];
    for (const arquivo of ARQUIVOS_PARTIDOS) {
        try {
            const res = await fetch(arquivo);
            if (!res.ok) {
                console.error(`Arquivo ${arquivo} não encontrado (erro ${res.status}).`);
                continue;
            }
            const data = await res.json();

            // Aceita array puro, { candidatos: [...] } ou { PDisney: [...] }
            let lista = [];
            if (Array.isArray(data)) lista = data;
            else if (Array.isArray(data.candidatos)) lista = data.candidatos;
            else lista = data[arquivo.replace('.json', '')] || Object.values(data)[0] || [];

            const sigla = arquivo.replace('.json', '');
            lista.forEach(c => {
                c.partido = (c.partido || sigla).trim();
                c.numero = String(c.numero).replace(/\D/g, ''); // tira espaços/traços digitados errado
                c.nome = String(c.nome).trim();
                c.cargo = String(c.cargo).trim();
                validarFormato(c, arquivo);
            });
            todosCandidatos = todosCandidatos.concat(lista);
        } catch (e) {
            console.error(`Erro ao carregar ${arquivo}. Está usando o Live Server?`, e);
        }
    }
    detectarConflitos();
    console.log(`${todosCandidatos.length} candidatos carregados:`, todosCandidatos);
}

// Avisa no console se o número não tem a quantidade de dígitos do cargo
function validarFormato(c, arquivo) {
    const cargo = cargos2026.find(x => normalizarCargo(x.nome) === normalizarCargo(c.cargo));
    if (!cargo) console.warn(`${arquivo}: cargo "${c.cargo}" de ${c.nome} não existe na urna.`);
    else if (c.numero.length !== cargo.digitos)
        console.warn(`${arquivo}: ${c.nome} tem ${c.numero.length} dígitos (${c.numero}), mas ${c.cargo} usa ${cargo.digitos}.`);
}

// Avisa no console se dois candidatos disputam o mesmo cargo com o mesmo número
function detectarConflitos() {
    const vistos = {};
    todosCandidatos.forEach(c => {
        const chave = `${normalizarCargo(c.cargo)}|${c.numero}`;
        if (vistos[chave]) console.warn(`Conflito: ${c.nome} e ${vistos[chave]} têm o mesmo número (${c.numero}) para ${c.cargo}.`);
        vistos[chave] = c.nome;
    });
}

// ===================== FLUXO DA URNA =====================
function iniciarNovoEleitor() {
    etapaAtual = 0;
    votoEleitorAtual = [];
    votacaoBloqueada = false;
    iniciarEtapa();
}

function iniciarEtapa() {
    numeroDigitado = "";
    votoEmBranco = false;

    const cargo = cargos2026[etapaAtual];
    document.getElementById('lblCargo').innerText = cargo.nome;
    document.getElementById('dadosCandidato').innerHTML = "";
    const img = document.getElementById('imgCandidato');
    img.style.display = "none";
    img.src = "";

    renderizarQuadradosDigitos(cargo.digitos);
}

function renderizarQuadradosDigitos(qtd) {
    const container = document.getElementById('containerDigitos');
    container.style.display = "flex";
    container.innerHTML = "";

    for (let i = 0; i < qtd; i++) {
        const div = document.createElement('div');
        div.className = i === 0 ? 'digito pisca' : 'digito';
        div.id = `digito-${i}`;
        container.appendChild(div);
    }
}

function digitar(n) {
    if (votacaoBloqueada || votoEmBranco) return;

    const cargo = cargos2026[etapaAtual];
    if (numeroDigitado.length >= cargo.digitos) return;

    numeroDigitado += n;

    const digitoElem = document.getElementById(`digito-${numeroDigitado.length - 1}`);
    if (digitoElem) {
        digitoElem.innerText = n;
        digitoElem.classList.remove('pisca');
    }

    if (numeroDigitado.length < cargo.digitos) {
        const proximoElem = document.getElementById(`digito-${numeroDigitado.length}`);
        if (proximoElem) proximoElem.classList.add('pisca');
    } else {
        verificarCandidatoDigitado(numeroDigitado, cargo.nome);
    }
}

// "Deputado(a) Federal", "Deputado Federal" e "Senador (1ª Vaga)" viram
// "deputado federal" e "senador": remove qualquer (...) e espaços extras.
function normalizarCargo(texto) {
    return String(texto).toLowerCase().replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
}

function buscarCandidatoNoJSON(numero, cargoNome) {
    const cargoBusca = normalizarCargo(cargoNome);
    return todosCandidatos.find(c =>
        c && c.cargo && c.numero &&
        String(c.numero) === String(numero) &&
        normalizarCargo(c.cargo) === cargoBusca
    );
}

function verificarCandidatoDigitado(numero, cargoNome) {
    const candidato = buscarCandidatoNoJSON(numero, cargoNome);
    const img = document.getElementById('imgCandidato');

    if (candidato) {
        document.getElementById('dadosCandidato').innerHTML = `
            <strong>Nome:</strong> ${candidato.nome}<br>
            <strong>Partido:</strong> ${candidato.partido}
        `;
        if (candidato.foto) {
            img.onerror = () => { img.style.display = "none"; };
            img.src = candidato.foto;
            img.style.display = "block";
        }
    } else {
        img.style.display = "none";
        document.getElementById('dadosCandidato').innerHTML = `
            <div style="font-size: 1.4rem; font-weight: bold; margin-top: 10px;">VOTO NULO</div>
            <span style="font-size: 0.8rem;">Número não correspondente a nenhum candidato</span>
        `;
    }
}

function votarBranco() {
    if (votacaoBloqueada) return;

    if (numeroDigitado === "") {
        votoEmBranco = true;
        document.getElementById('containerDigitos').style.display = "none";
        document.getElementById('dadosCandidato').innerHTML = `
            <div style="font-size: 1.5rem; font-weight: bold; text-align: center; margin-top: 15px;">VOTO EM BRANCO</div>
        `;
    } else {
        alert("Para votar em BRANCO, o campo de número deve estar vazio. Aperte CORRIGE primeiro.");
    }
}

function corrigir() {
    if (votacaoBloqueada) return;
    iniciarEtapa();
}

function confirmar() {
    if (votacaoBloqueada) return;

    const cargo = cargos2026[etapaAtual];

    if (votoEmBranco) {
        votoEleitorAtual.push({ cargo: cargo.nome, numero: null, tipo: "BRANCO", nome: null, partido: null });
    } else if (numeroDigitado.length === cargo.digitos) {
        const c = buscarCandidatoNoJSON(numeroDigitado, cargo.nome);
        votoEleitorAtual.push({
            cargo: cargo.nome,
            numero: numeroDigitado,
            tipo: c ? "VALIDO" : "NULO",
            nome: c ? c.nome : null,
            partido: c ? c.partido : null
        });
    } else {
        alert(`Por favor, insira os ${cargo.digitos} dígitos do cargo de ${cargo.nome} ou vote em BRANCO.`);
        return;
    }

    etapaAtual++;
    if (etapaAtual < cargos2026.length) {
        tocarSom(false);
        iniciarEtapa();
    } else {
        tocarSom(true);
        finalizarVotoEleitor();
    }
}

function finalizarVotoEleitor() {
    votacaoBloqueada = true;

    memoriaVotosEleitores.push({
        eleitor: memoriaVotosEleitores.length + 1,
        timestamp: new Date().toISOString(),
        votos: votoEleitorAtual
    });

    document.getElementById('tela').innerHTML = `<div class="mensagem-fim">F I M</div>`;

    setTimeout(() => {
        if (votacaoEncerrada) return; // a votação foi encerrada durante o "FIM"
        restaurarEstruturaTela();
        iniciarNovoEleitor();
    }, 3000);
}

function restaurarEstruturaTela() {
    document.getElementById('tela').innerHTML = `
        <div id="conteudo-voto" style="height: 100%; display: flex; flex-direction: column; justify-content: space-between;">
            <div class="tela-topo">
                <div>
                    <span>SEU VOTO PARA</span>
                    <div class="cargo-titulo" id="lblCargo">---</div>
                </div>
                <img id="imgCandidato" class="foto-candidato" src="" alt="" style="display: none;">
            </div>
            <div class="quadrados-numero" id="containerDigitos"></div>
            <div class="dados-candidato" id="dadosCandidato"></div>
            <div class="tela-instrucoes" id="instrucoes">
                Aperte a tecla:<br>
                <strong>VERDE</strong> para CONFIRMAR<br>
                <strong>LARANJA</strong> para CORRIGIR
            </div>
        </div>
    `;
}

// ===================== ENCERRAMENTO E EXPORTAÇÃO =====================
function encerrarVotacaoEEnviarTSE() {
    if (votacaoEncerrada) return;

    if (memoriaVotosEleitores.length === 0) {
        alert("Nenhum voto foi registrado nesta urna ainda!");
        return;
    }

    if (!confirm(`Deseja encerrar a eleição? Total de eleitores que votaram: ${memoriaVotosEleitores.length}`)) return;

    votacaoBloqueada = true;
    votacaoEncerrada = true;

    const registro = {
        urna: "Simulação 2026",
        encerradaEm: new Date().toISOString(),
        totalEleitores: memoriaVotosEleitores.length,
        partidos: [...new Set(todosCandidatos.map(c => c.partido))],
        eleitores: memoriaVotosEleitores
    };
    baixarJSON(registro, "votos.json");

    document.getElementById('tela').innerHTML = `
        <div class="mensagem-centro">
            VOTAÇÃO ENCERRADA<br>
            <span style="font-size: 1rem; margin-top: 15px; font-weight: normal;">Arquivo votos.json baixado com sucesso.</span>
        </div>
    `;

    exibirBoletim();
}

function baixarJSON(objeto, nomeArquivo) {
    const blob = new Blob([JSON.stringify(objeto, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

// ===================== BÔNUS 1: BOLETIM DE URNA =====================
function apurar() {
    return cargos2026.map(cargo => {
        const placar = {};
        // Todos os candidatos do cargo aparecem, mesmo com 0 votos
        todosCandidatos
            .filter(c => normalizarCargo(c.cargo) === normalizarCargo(cargo.nome))
            .forEach(c => { placar[c.numero] = { nome: c.nome, partido: c.partido, numero: c.numero, votos: 0 }; });

        let brancos = 0, nulos = 0;
        memoriaVotosEleitores.forEach(el => {
            const v = el.votos.find(x => x.cargo === cargo.nome);
            if (!v) return;
            if (v.tipo === "BRANCO") brancos++;
            else if (v.tipo === "NULO") nulos++;
            else if (placar[v.numero]) placar[v.numero].votos++;
        });

        const candidatos = Object.values(placar).sort((a, b) => b.votos - a.votos);
        return { cargo: cargo.nome, candidatos, brancos, nulos };
    });
}

function exibirBoletim() {
    const secao = document.getElementById('boletim');
    const total = memoriaVotosEleitores.length;

    let html = `<h2>Boletim de Urna</h2>
        <p class="resumo">Eleitores que votaram: <strong>${total}</strong></p>`;

    apurar().forEach(r => {
        const maior = r.candidatos.length ? r.candidatos[0].votos : 0;
        html += `<h3>${r.cargo}</h3>
            <table>
                <tr><th>Candidato</th><th>Partido</th><th>Votos</th></tr>
                ${r.candidatos.map(c => `
                    <tr class="${maior > 0 && c.votos === maior ? 'lider' : ''}">
                        <td>${c.nome} (${c.numero})</td><td>${c.partido}</td><td>${c.votos}</td>
                    </tr>`).join('')}
                <tr class="especial"><td colspan="2">Votos em branco</td><td>${r.brancos}</td></tr>
                <tr class="especial"><td colspan="2">Votos nulos</td><td>${r.nulos}</td></tr>
            </table>`;
    });

    secao.innerHTML = html;
    secao.hidden = false;
    secao.scrollIntoView({ behavior: 'smooth' });
}

// ===================== BÔNUS 2: SOM DA URNA =====================
// fim.mp3      -> "pililili" real do fim da votação (alterna 2200/2300 Hz a cada 100 ms)
// confirma.mp3 -> bip curto de cada confirmação
// Se os arquivos não carregarem, usa uma cópia sintetizada (Web Audio API).
const somConfirma = new Audio('confirma.mp3');
const somFim = new Audio('fim.mp3');
somConfirma.preload = somFim.preload = 'auto';

function tocarSom(final) {
    const audio = final ? somFim : somConfirma;
    audio.currentTime = 0;
    audio.play().catch(() => tocarSomSintetizado(final));
}

function tocarSomSintetizado(final) {
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const ctx = audioCtx;
        const t0 = ctx.currentTime;
        const duracao = final ? 1.35 : 0.1;

        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();
        osc.type = "sine";
        // Medido no áudio original: 2200 Hz / 2300 Hz alternando a cada 100 ms
        for (let t = 0, k = 0; t < duracao; t += 0.1, k++) {
            osc.frequency.setValueAtTime(k % 2 === 0 ? 2200 : 2300, t0 + t);
        }
        ganho.gain.setValueAtTime(0.3, t0);
        ganho.gain.setValueAtTime(0.3, t0 + duracao - 0.01);
        ganho.gain.linearRampToValueAtTime(0, t0 + duracao);
        osc.connect(ganho).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + duracao + 0.02);
    } catch (e) {
        console.warn("Áudio indisponível:", e);
    }
}
