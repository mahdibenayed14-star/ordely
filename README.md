
# Ordely FINAL DEMO — 0€
Cette version est conçue comme une vraie démo fonctionnelle de confirmation de commandes.

## Ce que la démo reproduit
- conversation de confirmation en Derja tunisienne;
- commande multi-produits;
- suppression d'un produit / conservation d'un autre;
- changement adresse, numéro, couleur, taille, quantité;
- consultation du prix;
- rappel après une heure;
- annulation avec confirmation;
- persistance dans `data/database.json`;
- dashboard de suivi de la commande;
- reconnaissance vocale du navigateur si disponible;
- synthèse vocale du navigateur si disponible.

## Déploiement Render
Build: `npm install`
Start: `npm start`
Plan: Free
Port: `PORT` (le serveur écoute sur 0.0.0.0)

## Limite importante
Cette version est 100% gratuite et ne dépend d'aucune API IA payante. La couche vocale repose donc sur les capacités vocales du navigateur/appareil. Elle ne prétend pas être équivalente à un STT/TTS neuronal tunisien commercial. L'architecture serveur est volontairement séparée pour permettre de remplacer cette couche plus tard sans refaire la logique métier.
