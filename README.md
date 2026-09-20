# Ordely V6.1 — Real Tunisian Voice Demo

## Objectif
Démo interactive d'un agent IA de confirmation de commandes en Derja tunisienne avec interruption naturelle (barge-in).

## Architecture
Micro navigateur → WebSocket Ordely → Deepgram Voice Agent → STT Nova-3 `ar-TN` → LLM conversationnel → ElevenLabs TTS → audio navigateur.

Deepgram Voice Agent gère la boucle temps réel sur une connexion WebSocket. La logique métier Ordely reste côté serveur : commande, état, phases de vérification et transitions.

## Pourquoi cette version
La V5 utilisait les API vocales natives du navigateur. Elles ne garantissent ni un STT tunisien fiable ni une voix TTS tunisienne et rendaient le barge-in instable.

La V6.1 utilise donc :
- STT Deepgram Nova-3 `ar-TN`.
- LLM conversationnel configuré pour la Derja tunisienne.
- ElevenLabs en streaming pour la sortie TTS.
- événement `UserStartedSpeaking` pour couper immédiatement la lecture locale lors d'une interruption.
- file audio locale séquentielle afin d'éviter le chevauchement des chunks audio.
- machine d'état Ordely côté serveur.

## Développement local

```bash
npm install
cp .env.example .env
# renseigner les variables secrètes
npm start
```

Puis ouvrir `http://localhost:10000`.

## Variables obligatoires

`DEEPGRAM_API_KEY`

`ELEVENLABS_API_KEY`

`ELEVENLABS_VOICE_ID`

Le modèle ElevenLabs par défaut est `eleven_turbo_v2_5`, choisi pour le streaming temps réel. Sélectionner une voix arabe adaptée à la Derja tunisienne et vérifier sa licence d'utilisation.

## Déploiement recommandé

Pour cette V6, GitHub sert de dépôt de code. L'application doit être déployée comme **Web Service Node.js** afin que `server.js` et le WebSocket `/voice` fonctionnent. GitHub Pages ne peut pas exécuter ce backend Node.

Render peut connecter directement le dépôt GitHub. Paramètres :
- Build command : `npm install`
- Start command : `npm start`
- Health check : `/health`
- Variables : ajouter les clés dans l'onglet Environment de Render, jamais dans GitHub.

## Test jury

1. Ouvrir l'URL HTTPS du Web Service.
2. Autoriser le micro.
3. Démarrer.
4. Laisser Ordely commencer.
5. L'interrompre volontairement : `La la, estanna, l'adresse تبدلت`.
6. Vérifier que l'audio s'arrête immédiatement et que la conversation continue au même état.
7. Tester confirmation, modification, annulation et rappel.

## Limite actuelle
Cette V6 est une vraie architecture de conversation vocale temps réel mais la téléphonie PSTN n'est pas encore branchée. Pour l'appel téléphonique réel, on ajoutera ensuite un adaptateur Twilio/SIP/operateur tunisien sans changer la machine d'état Ordely.
