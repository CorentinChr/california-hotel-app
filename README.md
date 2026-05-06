# Le California - Système de Gestion Ménage & Admin

Solution de gestion hôtelière pour l'équipe d'entretien et la direction de l'hôtel **Le California**. Le système automatise la récupération des réservations depuis **Lodgify** pour générer des plannings de ménage intelligents et un suivi administratif complet.

---

## Interface Ménage (Optimisée Tablette)

L'interface est divisée en deux sections principales pour faciliter le travail quotidien :

### Onglet Réservations (Quotidien)

- **Liste dynamique** : Affiche les tâches du jour (Arrivée, Départ, Intermédiaire).
- **Check-list condensée** : Grille intelligente de sous-tâches pour éviter le scroll excessif.
- **Suivi Minibar** : Interface tactile permettant d'incrémenter/décrémenter les consommations par produit.
- **Anticipation** : Bouton permettant de voir les **Arrivées** des 15 prochains jours pour préparer les chambres en avance.
- **Alertes visuelles** : Distinction claire entre les tâches du jour, les retards (orange) et les tâches en avance (bleu).

### Onglet Tâches Récurrentes (Entretien Profond)

- **Accordéon par chambre** : Les tâches sont regroupées par chambre pour plus de clarté.
- **Tri par fréquence** : Organisation automatique par cycles (30 jours, 90 jours, 180 jours).
- **Vue condensée** : Affichage sous forme de "badges" cliquables pour valider l'entretien profond rapidement.

---

## Panel Administration

Espace sécurisé pour la direction :

- **Authentification** : Accès protégé via Supabase Auth (Email/Mot de passe).
- **Vue Mensuelle** : Sélecteur de mois pour consulter les réservations passées et futures.
- **Gestion des Options** : Activation/Désactivation d'options (ex: Petit-déjeuner) qui met à jour les check-lists ménage au cycle suivant.
- **Récapitulatif Minibar** : Tableau de facturation consolidé par réservation.
- **Badges de Statut** : Traduction automatique et code couleur des statuts Lodgify (_Confirmée, Annulée, En attente_).

---

## Stack Technique

- **Frontend** : React.js (Vite + TypeScript)
- **Backend** : Supabase
  - **Base de données** : PostgreSQL
  - **Edge Functions** : Deno (Sync Lodgify)
  - **Cron Jobs** : Synchronisation automatique toutes les 15 minutes.
- **Déploiement** : Vercel

---

## Installation et Déploiement

### 1. Variables d'environnement

Créer un fichier `.env.local` à la racine :

```text
VITE_SUPABASE_URL=votre_url_supabase
VITE_SUPABASE_ANON_KEY=votre_cle_anonyme
```

### 2. Installation

```bash
npm install
npm run dev
```

### 3. Déploiement de la fonction de synchronisation

```bash
supabase functions deploy sync-lodgify
```

---

## Logique de Synchronisation

La **Edge Function** effectue les opérations suivantes toutes les 15 minutes :

1. Récupère les réservations Lodgify sur un horizon de **90 jours**.
2. Effectue un `upsert` avec `ignoreDuplicates: false` pour garantir que toute modification d'option est détectée.
3. Nettoie les tâches "A FAIRE" et les régénère en fonction des modèles de check-list et des options JSON de la réservation.
4. Préserve les tâches déjà marquées comme "TERMINÉ".

---

## Structure de la Base de Données

- `reservations` : Stockage central des séjours et des options clients (JSONB).
- `taches` : Planning des interventions (Arrivée, Départ, etc.).
- `tache_items_execution` : Détails de la check-list pour chaque intervention.
- `taches_recurrentes` : Registre des fréquences d'entretien profond par chambre.
- `minibar_produits` & `minibar_consommations` : Gestion des ventes en chambre.

---
