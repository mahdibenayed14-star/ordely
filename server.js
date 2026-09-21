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

const STATES = Object.freeze({
  NEW:'NEW', VERIFYING:'VERIFYING', MODIFICATION_REQUESTED:'MODIFICATION_REQUESTED',
  CANCEL_REQUESTED:'CANCEL_REQUESTED', CONFIRMED:'CONFIRMED',
  CALLBACK_REQUESTED:'CALLBACK_REQUESTED', HUMAN_HANDOFF:'HUMAN_HANDOFF', DONE:'DONE'
});

function makeState() {
  return {
    status: STATES.NEW,
    phase: 'greeting',
    confirmed: { product:false, address:false, identity:false, final:false },
    callbackAt: null,
    turn: 0
  };
}

function transition(s, next) {
  const allowed = {
    NEW:['VERIFYING','MODIFICATION_REQUESTED','CANCEL_REQUESTED','CALLBACK_REQUESTED'],
    VERIFYING:['VERIFYING','MODIFICATION_REQUESTED','CANCEL_REQUESTED','CONFIRMED','CALLBACK_REQUESTED','HUMAN_HANDOFF'],
    MODIFICATION_REQUESTED:['VERIFYING','MODIFICATION_REQUESTED','CANCEL_REQUESTED','CALLBACK_REQUESTED','CONFIRMED'],
    CANCEL_REQUESTED:['CANCEL_REQUESTED','DONE'],
    CONFIRMED:['CONFIRMED','DONE'],
    CALLBACK_REQUESTED:['CALLBACK_REQUESTED','VERIFYING','DONE'],
    HUMAN_HANDOFF:['HUMAN_HANDOFF','DONE'],
    DONE:['DONE']
  };
  if (allowed[s.status]?.includes(next)) { s.status = next; return true; }
  return false;
}

function norm(t) {
  return String(t || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[’']/g,"'").trim();
}

function classify(text) {
  const q = norm(text);
  if (/(الغى|نلغي|نلغيه|annul|annule|cancel|ما نحبش|مانحبش|ma n7ebch)/i.test(q)) return 'cancel';
  if (/(بدل|نبدل|تبدل|نغير|changer|modif|wrong|غلط|ghalet)/i.test(q)) return 'modify';
  if (/(بعد|ba3d|بعد ساعة|بعد شوية|عاود|نعاود|rappel|callback|later|sa3a)/i.test(q)) return 'callback';
  if (/(اي|إي|ايه|نعم|oui|yes|صحيح|s7i7|مريقل|مريقلة|confirm|ok|okay|d'accord)/i.test(q)) return 'yes';
  if (/(لا|لا لا|non|no|nn|manich|مش|موش)/i.test(q)) return 'no';
  if (/(سمول|smol|small|s\b)/i.test(q)) return 'size';
  if (/(احمر|حمراء|rouge|red)/i.test(q)) return 'red';
  if (/(عنوان|adresse|address|دار|نهج|شارع|sfax|صفاقس)/i.test(q)) return 'address';
  if (/(اسم|nom|name|احمد|بن علي)/i.test(q)) return 'identity';
  if (/(تليفون|هاتف|numero|رقم|phone|20)/i.test(q)) return 'phone';
  return 'other';
}

function nextFreeTurn(state, text) {
  const intent = classify(text);
  state.turn++;

  if (intent === 'cancel') {
    transition(state, STATES.CANCEL_REQUESTED);
    state.phase = 'cancel';
    return 'واضح. نثبتلك إلغاء الكوموند. ما عادش باش تتبعث.';
  }

  if (intent === 'callback') {
    transition(state, STATES.CALLBACK_REQUESTED);
    state.phase = 'callback';
    return 'مريقل. نعاودو نكلموك بعد شوية. تحب بعد ساعة بالضبط؟';
  }

  if (intent === 'modify') {
    transition(state, STATES.MODIFICATION_REQUESTED);
    state.phase = 'modification';
    return 'مريقل، شنوّة تحب تبدّل في الكوموند؟';
  }

  if (state.phase === 'greeting') {
    transition(state, STATES.VERIFYING);
    state.phase = 'product';
    return 'عندك كاسك صوتي أحمر، الكمية واحد، والمقاس S يعني smol. صحيح؟';
  }

  if (state.phase === 'product') {
    if (intent === 'yes' || intent === 'red' || intent === 'size') {
      state.confirmed.product = true;
      state.phase = 'address';
      return 'مريقل. العنوان هو 15 نهج تونس، صفاقس. صحيح؟';
    }
    if (intent === 'no') return 'شنوّة الغالط في المنتوج ولا في المقاس؟';
    return 'نثبتو المنتوج والمقاس: كاسك أحمر، S smol. صحيح؟';
  }

  if (state.phase === 'address') {
    if (intent === 'yes' || intent === 'address') {
      state.confirmed.address = true;
      state.phase = 'identity';
      return 'تمام. الاسم أحمد بن علي والتليفون 20 123 456. صحيح؟';
    }
    if (intent === 'no') return 'شنوّة العنوان الصحيح؟';
    return 'العنوان 15 نهج تونس، صفاقس. صحيح؟';
  }

  if (state.phase === 'identity') {
    if (intent === 'yes' || intent === 'identity' || intent === 'phone') {
      state.confirmed.identity = true;
      state.phase = 'final';
      return 'باهي. الكل واضح: الكاسك الأحمر S، العنوان في صفاقس، والمبلغ 189 دينار. نأكدولك الكوموند؟';
    }
    if (intent === 'no') return 'شنوّة المعلومة الغالطة: الاسم ولا التليفون؟';
    return 'نأكد الاسم والتليفون: أحمد بن علي، 20 123 456. صحيح؟';
  }

  if (state.phase === 'final') {
    if (intent === 'yes') {
      state.confirmed.final = true;
      transition(state, STATES.CONFIRMED);
      state.phase = 'done';
      return 'مريقل أحمد، الكوموند تأكدت. يعطيك الصحة ونهارك مبروك.';
    }
    if (intent === 'no') return 'مريقل، ما نأكدهاش توة. شنوّة تحب نبدّل؟';
    return 'نأكدولك الكوموند ولا تحب تبدّل حاجة؟';
  }

  if (state.phase === 'modification') {
    state.phase = 'product';
    transition(state, STATES.VERIFYING);
    return 'فهمتك. نعاودو نثبتو الكوموند من جديد، شنوّة تحب يكون المنتوج والمقاس؟';
  }

  if (state.phase === 'callback') {
    if (intent === 'yes') {
      state.callbackAt = 'بعد ساعة';
      return 'مريقل، بعد ساعة نعاودو نكلموك. خلي التليفون محلول وشارجى.';
    }
    return 'وقتاش تحب نعاودو نكلموك؟';
  }

  return 'سمحني، ما فهمتكش مليح. تعاودلي باختصار؟';
}

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function sendState(ws, state) {
  send(ws, { type:'State', state, order:ORDER, mode:'FREE' });
}

wss.on('connection', client => {
  const state = makeState();

  send(client, { type:'SettingsApplied', mode:'FREE', message:'Mode démo gratuit actif' });
  sendState(client, state);

  client.on('message', (data, isBinary) => {
    if (isBinary) return;

    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'InjectUserMessage') {
      const text = String(msg.text || '').trim();
      if (!text) return;

      send(client, { type:'UserStartedSpeaking' });
      send(client, { type:'ConversationText', role:'user', content:text });

      const reply = nextFreeTurn(state, text);
      sendState(client);

      setTimeout(() => {
        send(client, { type:'ConversationText', role:'assistant', content:reply });
      }, 180);
    }

    if (msg.type === 'Interrupt') {
      send(client, { type:'UserStartedSpeaking' });
    }

    if (msg.type === 'ForceEndTurn') {
      send(client, { type:'AgentAudioDone' });
    }
  });
});

app.get('/health', (_req, res) => res.json({
  ok:true, service:'ordely', version:'7.0.0-free', mode:'FREE',
  time:new Date().toISOString()
}));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Ordely V7 FREE listening on :${PORT}`);
});
