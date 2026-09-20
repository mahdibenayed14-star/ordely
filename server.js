import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/voice' });
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public'));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'ordely-v6', version: '6.1.0', time: new Date().toISOString() }));

const DG_URL = process.env.DEEPGRAM_AGENT_URL || 'wss://agent.deepgram.com/v1/agent/converse';

const ORDER = Object.freeze({
  id: 'ORD-2026-0919',
  name: 'Ahmed Ben Ali',
  phone: '20 123 456',
  product: 'casque audio rouge',
  qty: 1,
  size: 'S (smol)',
  address: '15 نهج تونس، صفاقس',
  total: 189
});

const STATES = Object.freeze({ NEW:'NEW', VERIFYING:'VERIFYING', MODIFICATION_REQUESTED:'MODIFICATION_REQUESTED', CANCEL_REQUESTED:'CANCEL_REQUESTED', CONFIRMED:'CONFIRMED', CALLBACK_REQUESTED:'CALLBACK_REQUESTED', HUMAN_HANDOFF:'HUMAN_HANDOFF', DONE:'DONE' });

function makeState() {
  return { status: STATES.NEW, phase: 'greeting', confirmed: { product:false, address:false, identity:false }, callbackAt:null, turn:0 };
}

function transition(s, next) {
  const allowed = {
    NEW: ['VERIFYING','MODIFICATION_REQUESTED','CANCEL_REQUESTED','CALLBACK_REQUESTED'],
    VERIFYING: ['VERIFYING','MODIFICATION_REQUESTED','CANCEL_REQUESTED','CONFIRMED','CALLBACK_REQUESTED','HUMAN_HANDOFF'],
    MODIFICATION_REQUESTED: ['VERIFYING','MODIFICATION_REQUESTED','CANCEL_REQUESTED','CALLBACK_REQUESTED','CONFIRMED'],
    CANCEL_REQUESTED: ['CANCEL_REQUESTED','DONE'],
    CONFIRMED: ['CONFIRMED','DONE'],
    CALLBACK_REQUESTED: ['CALLBACK_REQUESTED','VERIFYING','DONE'],
    HUMAN_HANDOFF: ['HUMAN_HANDOFF','DONE'],
    DONE: ['DONE']
  };
  if (!allowed[s.status]?.includes(next)) return false;
  s.status = next;
  return true;
}

function detectState(text, state) {
  const q = String(text || '').toLowerCase();
  state.turn += 1;
  if (/(الغى|نلغي|نلغيه|annul|annule|cancel|ما نحبش|مانحبش)/i.test(q)) transition(state, STATES.CANCEL_REQUESTED);
  else if (/(بعد|ba3d|بعد ساعة|عاود|نعاود|rappel|callback|later)/i.test(q)) transition(state, STATES.CALLBACK_REQUESTED);
  else if (/(بدل|نبدل|تبدل|نغير|changer|modif|wrong|غلط)/i.test(q)) transition(state, STATES.MODIFICATION_REQUESTED);
  else if (/(اي|إي|ايه|نعم|oui|yes|صحيح|س7ي7|s7i7|مريقل|مريقلة|confirm)/i.test(q)) {
    if (state.phase === 'product') state.confirmed.product = true;
    if (state.phase === 'address') state.confirmed.address = true;
    if (state.phase === 'identity') state.confirmed.identity = true;
    if (state.confirmed.product && state.confirmed.address && state.confirmed.identity) transition(state, STATES.CONFIRMED);
    else transition(state, STATES.VERIFYING);
  }
  return state;
}

function prompt(state) {
  return `
Tu es Ordely, agent tunisien de confirmation de commandes par téléphone.

LANGUE — OBLIGATOIRE
- Parle en DERJA TUNISIENNE naturelle. Jamais d'arabe standard scolaire.
- Utilise un tunisien parlé au téléphone, court, spontané et chaleureux.
- Tu peux écrire en arabe tunisien ou en translittération tunisienne quand c'est naturel.
- Comprends le code-switching Derja/français et la translittération: "n7eb", "nثبت", "s7i7", "smol", "ba3d sa3a".
- Ne traduis pas la Derja vers le français pour faire joli.
- Une ou deux phrases maximum par tour.

CONVERSATION
- Le client peut t'interrompre à tout moment.
- Une interruption annule ta phrase en cours: ne la répète jamais et ne recommence jamais le dialogue.
- Réponds à la dernière information du client et continue exactement depuis l'état courant.
- Ne repose pas une question dont la réponse est déjà confirmée.
- Si tu n'as pas compris, demande une reformulation très courte en Derja.
- N'invente aucune information.

COMMANDE
ID: ${ORDER.id}
Nom: ${ORDER.name}
Téléphone: ${ORDER.phone}
Produit: ${ORDER.product}
Quantité: ${ORDER.qty}
Taille: ${ORDER.size}
Adresse: ${ORDER.address}
Total: ${ORDER.total} dinars

ÉTAT INTERNE
status=${state.status}; phase=${state.phase}; produit=${state.confirmed.product}; adresse=${state.confirmed.address}; identité=${state.confirmed.identity}; callback=${state.callbackAt ?? 'none'}

OBJECTIF
1. Vérifier produit/quantité/taille.
2. Vérifier adresse.
3. Vérifier nom/téléphone.
4. Demander confirmation finale.
5. Si modification, identifier précisément ce qui change puis reprendre la vérification.
6. Si annulation, confirmer l'annulation.
7. Si rappel, demander/valider le moment du rappel.

SÉCURITÉ
- Tu ne prétends jamais avoir modifié, annulé ou confirmé dans un système externe sans outil explicite.
- Les changements d'état sont pilotés côté serveur; ton rôle est conversationnel.
`;
}

function send(ws, obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

wss.on('connection', (client) => {
  if (!process.env.DEEPGRAM_API_KEY) {
    send(client, { type:'Error', message:'DEEPGRAM_API_KEY manquante côté serveur.' });
    client.close();
    return;
  }
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
    send(client, { type:'Error', message:'ELEVENLABS_API_KEY ou ELEVENLABS_VOICE_ID manquante. Configure le TTS tunisien.' });
    client.close();
    return;
  }

  const state = makeState();
  const dg = new WebSocket(DG_URL, { headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` } });

  dg.on('open', () => {
    const settings = {
      type: 'Settings',
      tags: ['ordely','order-confirmation','tunisia','derja'],
      audio: {
        input: { encoding:'linear16', sample_rate:16000 },
        output: { encoding:'linear16', sample_rate:24000, container:'none' }
      },
      agent: {
        greeting: 'Aslema Ahmed, ena Ordely. N3ayetlek 3la commande mte3ek. Nثبتوha m3a ba3dhna?',
        listen: {
          provider: {
            type:'deepgram', model:'nova-3', language:'ar-TN', smart_format:false,
            keyterms:['Ordely','commande','nثبتو','نثبتو','صفاقس','سمول','smol','S','20 123 456','نهج تونس']
          }
        },
        think: {
          provider: { type:'open_ai', model:process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature:0.2 },
          prompt: prompt(state)
        },
        speak: {
          provider: {
            type:'eleven_labs',
            model_id:process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5',
            language_code:'ar'
          },
          endpoint: {
            url:'wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/multi-stream-input',
            headers:{ 'xi-api-key': process.env.ELEVENLABS_API_KEY }
          }
        }
      }
    };
    dg.send(JSON.stringify(settings));
    send(client, { type:'State', state, order:ORDER });
  });

  dg.on('message', (data, isBinary) => {
    if (isBinary) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
      return;
    }
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'ConversationText' && msg.role === 'user') {
      detectState(msg.content, state);
      send(client, { type:'State', state, order:ORDER });
    }
    if (msg.type === 'UserStartedSpeaking') {
      send(client, { type:'UserStartedSpeaking' });
    }
    if (msg.type === 'SettingsApplied') send(client, { type:'SettingsApplied', state });
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(msg));
  });

  dg.on('error', err => send(client, { type:'Error', message:`Deepgram: ${err.message}` }));
  dg.on('close', () => { if (client.readyState === WebSocket.OPEN) client.close(); });

  client.on('message', (data, isBinary) => {
    if (dg.readyState !== WebSocket.OPEN) return;
    if (isBinary) { dg.send(data); return; }
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (['Interrupt','InjectUserMessage','ForceEndTurn'].includes(msg.type)) dg.send(JSON.stringify(msg));
  });

  client.on('close', () => { try { dg.close(); } catch {} });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Ordely V6.1 listening on :${PORT}`));
