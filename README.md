# Ordely — Demo V2

## Publication HTTPS
### GitHub Pages
1. Mettre `index.html`, `manifest.json`, `sw.js` dans un repository.
2. Settings → Pages → Deploy from branch → `main` / `/root`.
3. Ouvrir l'URL `https://<compte>.github.io/<repo>/`.
4. Vérifier le cadenas HTTPS.

### Netlify / Vercel
Déployer le contenu de ce dossier comme site statique. Aucun build n'est nécessaire.

## Test jury
1. Chrome Android → URL HTTPS.
2. `🎤 Tester micro` → Autoriser.
3. `▶ Démarrer`.
4. `🗣️ Parler`.
5. Exemple : `Ey nconfirmi lcommande`.
6. Vérifier `CONFIRMED` + `Write-back simulé → OK`.

## Périmètre V2
- UI mobile
- Web Speech API + microphone
- réponses vocales avec préférence ar-TN si disponible
- Order State Machine de démonstration
- confirmation / annulation / modification / rappel
- PWA installable
- write-back simulé uniquement

## Limite
Cette version ne réalise pas de téléphonie PSTN réelle et n'utilise pas encore de LLM distant. La production devra placer l'IA et les données métier derrière un backend sécurisé, conformément à l'architecture Ordely.
