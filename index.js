const { makeWASocket, useSingleFileAuthState } = require('@adiwajshing/baileys');
const sqlite3 = require('sqlite3').verbose();
const { Boom } = require('@hapi/boom');
const { unlinkSync } = require('fs');

// Configuração do arquivo de autenticação
const { state, saveState } = useSingleFileAuthState('./auth_info_multi.json');

// Conectando ao banco de dados SQLite
let db = new sqlite3.Database('./cards.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Conectado ao banco de dados.');
});

// Cria a tabela se não existir
db.run(`CREATE TABLE IF NOT EXISTS cartas (
    NomePT TEXT PRIMARY KEY,
    NomeEN TEXT,
    Custo INTEGER,
    Poder INTEGER,
    Habilidade TEXT,
    Disponibilidade TEXT,
    URLImagem TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS autorizados (
    numero TEXT PRIMARY KEY
)`);

// Função para verificar se um número está autorizado
function isAuthorized(numero, callback) {
    db.get(`SELECT * FROM autorizados WHERE numero = ?`, [numero], (err, row) => {
        if (err) {
            return callback(false);
        }
        callback(!!row); // Retorna true se o número existir no banco de dados
    });
}

// Função para adicionar uma carta no banco de dados
function addCarta(nomePT, nomeEN, custo, poder, habilidade, disponibilidade, urlImagem, callback) {
    db.run(`INSERT INTO cartas (NomePT, NomeEN, Custo, Poder, Habilidade, Disponibilidade, URLImagem) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [nomePT, nomeEN, custo, poder, habilidade, disponibilidade, urlImagem],
        function(err) {
            if (err) {
                return callback(err.message);
            }
            callback(null, 'Carta adicionada com sucesso!');
        }
    );
}

// Função para atualizar uma carta no banco de dados
function updateCarta(nomePT, nomeEN, custo, poder, habilidade, disponibilidade, urlImagem, callback) {
    db.run(`UPDATE cartas SET NomeEN = ?, Custo = ?, Poder = ?, Habilidade = ?, Disponibilidade = ?, URLImagem = ? WHERE NomePT = ?`,
        [nomeEN, custo, poder, habilidade, disponibilidade, urlImagem, nomePT],
        function(err) {
            if (err) {
                return callback(err.message);
            }
            callback(null, 'Carta atualizada com sucesso!');
        }
    );
}

// Função para buscar uma carta no banco de dados
function getCarta(nome, callback) {
    db.get(`SELECT * FROM cartas WHERE NomePT = ? OR NomeEN = ?`, [nome, nome], (err, row) => {
        if (err) {
            return callback(err.message);
        }
        callback(null, row);
    });
}

// Configuração do Baileys
async function connectToWhatsApp() {
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['Marvel Snap Bot', 'Chrome', '1.0.0'],
    });

    // Salvar o estado de autenticação
    sock.ev.on('creds.update', saveState);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type === 'notify') {
            const msg = messages[0];

            if (!msg.message || msg.key.fromMe) return;

            const from = msg.key.remoteJid;
            const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

            if (body.startsWith('!')) {
                const command = body.slice(1).trim();
                const [action, ...params] = command.split(' ');

                // Verifica se o comando é para buscar uma carta
                if (!action.startsWith('addcarta') && !action.startsWith('attcarta')) {
                    getCarta(action, (err, carta) => {
                        if (err || !carta) {
                            sock.sendMessage(from, { text: 'Carta não encontrada!' });
                        } else {
                            const resposta = `Nome PT: ${carta.NomePT}\nNome EN: ${carta.NomeEN}\nCusto: ${carta.Custo}\nPoder: ${carta.Poder}\nHabilidade: ${carta.Habilidade}\nDisponibilidade: ${carta.Disponibilidade}\nImagem: ${carta.URLImagem}`;
                            sock.sendMessage(from, { text: resposta });
                        }
                    });
                }

                // Comando para adicionar carta
                if (action === 'addcarta') {
                    const [nomePT, nomeEN, custo, poder, habilidade, disponibilidade, urlImagem] = params;
                    isAuthorized(from, (authorized) => {
                        if (authorized) {
                            addCarta(nomePT, nomeEN, parseInt(custo), parseInt(poder), habilidade, disponibilidade, urlImagem, (err, msg) => {
                                if (err) {
                                    sock.sendMessage(from, { text: `Erro: ${err}` });
                                } else {
                                    sock.sendMessage(from, { text: msg });
                                }
                            });
                        } else {
                            sock.sendMessage(from, { text: 'Você não está autorizado a adicionar cartas!' });
                        }
                    });
                }

                // Comando para atualizar carta
                if (action === 'attcarta') {
                    const [nomePT, nomeEN, custo, poder, habilidade, disponibilidade, urlImagem] = params;
                    isAuthorized(from, (authorized) => {
                        if (authorized) {
                            updateCarta(nomePT, nomeEN, parseInt(custo), parseInt(poder), habilidade, disponibilidade, urlImagem, (err, msg) => {
                                if (err) {
                                    sock.sendMessage(from, { text: `Erro: ${err}` });
                                } else {
                                    sock.sendMessage(from, { text: msg });
                                }
                            });
                        } else {
                            sock.sendMessage(from, { text: 'Você não está autorizado a atualizar cartas!' });
                        }
                    });
                }
            }
        }
    });
}

connectToWhatsApp();
